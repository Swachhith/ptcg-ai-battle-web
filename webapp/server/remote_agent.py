"""The agent with its network somewhere else.

Everything the submitted agent does around the model stays here, in NumPy:
tracking what the agent may legitimately know, encoding the observation, and
turning scores into an answer (one pick at a time, STOP to finish, argmax at
every pick, exactly like ptcg.rl.search_agent.SearchAgent with cfg=None and
temp=0). The forward pass itself is a callback: `infer(row) -> 64 scores`.
The web app passes a callback that sends the row to the player's browser,
where the exported ONNX model runs, so this process never imports PyTorch.

The answer logic is a copy of SearchAgent.agent / _decompose / _forced, kept
separate so that submission/ stays the untouched Kaggle bundle.
"""
import os
import random
import sys

import numpy as np


class RemoteAgent:
    def __init__(self, submission_dir, deck, infer):
        if submission_dir not in sys.path:
            sys.path.insert(0, submission_dir)
        os.chdir(submission_dir)   # the agent's data files resolve from here
        from ptcg.rl.buffers import OBS_SIZE, OFFSETS, STOP
        from ptcg.rl.encoder import encode
        from ptcg.tracker import InfoTracker
        self._encode, self._Tracker, self.STOP = encode, InfoTracker, STOP
        self._oracle = OFFSETS["oracle"]
        self.deck = [int(c) for c in deck][:60]
        self.row = np.zeros((1, OBS_SIZE), dtype=np.float32)
        self.infer = infer
        self.tracker = None
        self.forced_run = 0
        self.fallbacks = 0     # decisions answered without the model

    # -- same contract as the Kaggle agent: obs dict in, option indices out
    def agent(self, obs):
        if obs.get("select") is None:
            self.tracker = self._Tracker(self.deck)
            self.forced_run = 0
            return list(self.deck)
        sel = obs["select"]
        if self.tracker is None:
            self.tracker = self._Tracker(self.deck)
        self.tracker.update(obs)
        forced = self._forced(sel)
        if forced is not None:
            self.forced_run += 1
            return forced
        try:
            ans = self._decompose(obs)
        except Disconnected:
            raise
        except Exception:
            # No usable scores (the browser was too slow or sent nonsense):
            # a legal answer keeps the game going.
            self.fallbacks += 1
            ans = self._legal_random(sel)
        self.forced_run = 0
        return ans

    def _logits(self, obs, picked, stop_ok):
        self._encode(self.row[0], obs, picked, stop_ok, self.forced_run,
                     tracker=self.tracker)
        a, b = self._oracle
        self.row[0, a:b] = 0.0     # training-only block; never leaves the server
        out = np.asarray(self.infer(self.row), dtype=np.float32).reshape(-1)
        if out.shape[0] != self.STOP + 1 or not np.isfinite(out).all():
            raise ValueError("bad scores")
        return out

    def _decompose(self, obs):
        sel = obs["select"]
        n = len(sel["option"])
        picked = []
        while True:
            stop_ok = (len(picked) >= sel["minCount"]
                       and (sel["maxCount"] > 1 or sel["minCount"] == 0))
            a = int(self._logits(obs, picked, stop_ok).argmax())
            if a == self.STOP:
                if stop_ok:
                    return picked
                a = next((j for j in range(n) if j not in picked), 0)
            if a >= n or a in picked:
                a = next((j for j in range(n) if j not in picked), None)
                if a is None:
                    return picked
            if sel["maxCount"] == 1:
                return [a]
            picked.append(a)
            if len(picked) >= sel["maxCount"]:
                return picked

    @staticmethod
    def _forced(sel):
        n = len(sel["option"])
        if sel["minCount"] == sel["maxCount"] == n:
            return list(range(n))
        if n == 1 and sel["minCount"] >= 1:
            return [0]
        return None

    @staticmethod
    def _legal_random(sel):
        n = len(sel["option"])
        k = random.randint(sel["minCount"], min(sel["maxCount"], n))
        return sorted(random.sample(range(n), k))


class Disconnected(Exception):
    """The player left while the agent was waiting for scores."""
