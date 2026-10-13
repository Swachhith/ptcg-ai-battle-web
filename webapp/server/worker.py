"""One game = one process.

The competition SDK's cg.game keeps a single battle per process and the
submitted agent (submission/main.py) keeps per-episode globals, so every
game gets a fresh process that loads the agent exactly the way Kaggle does
(exec of main.py) and then hosts the battle.

Messages to the parent (dicts over a multiprocessing Pipe):
  ready                      agent loaded, waiting for "start"
  ai_step   {action, state}  the AI answered a select; state is the board as
                             the human may see it (AI hand / searches hidden)
  prompt    {state, select, logs}   the human must answer this select
  invalid   {message}        the human's answer was rejected; prompt follows
  game_over {result, reason, state, aiDeck}
  error     {message}
"""
import copy
import os
import sys
import tempfile
import time
import traceback

DECK_CALL = {"select": None, "logs": [], "current": None,
             "search_begin_input": None}

HAND, DECK, DISCARD, ACTIVE, BENCH, PRIZE, STADIUM, LOOKING = 2, 1, 3, 4, 5, 6, 7, 12
PUBLIC_AREAS = {DISCARD, ACTIVE, BENCH, STADIUM}


def load_agent(submission_dir):
    """exec submission/main.py like kaggle-environments does."""
    sys.path.insert(0, submission_dir)
    os.chdir(submission_dir)
    env = {"__file__": os.path.join(submission_dir, "main.py"),
           "__name__": "kaggle_agent"}
    src = open(os.path.join(submission_dir, "main.py"), encoding="utf-8").read()
    exec(compile(src, "main.py", "exec"), env)
    return env


def set_ai_deck(env, submission_dir, ai_deck):
    """The same policy (same main.py wrapper, same weights) pilots ai_deck
    instead of the submitted list."""
    if ai_deck:
        from ptcg.rl.search_agent import SearchAgent
        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w") as f:
            f.write("\n".join(str(c) for c in ai_deck) + "\n")
        env["SA"] = SearchAgent(os.path.join(submission_dir, "model.pt"), path,
                                cfg=None, seed=0, device="cpu",
                                data_dir=submission_dir, heads=env["HEADS"],
                                temp=0.0)
        env["DECK"] = list(env["SA"].deck)
    return env["agent"]


def card_at(cur, sel, area, index, player):
    """Resolve (area, index, player) to a card dict, or None if hidden."""
    try:
        p = cur["players"][player]
        if area == HAND:
            return (p["hand"] or [None] * (index + 1))[index]
        if area == ACTIVE:
            return p["active"][0]
        if area == BENCH:
            return p["bench"][index]
        if area == DISCARD:
            return p["discard"][index]
        if area == PRIZE:
            return p["prize"][index]
        if area == STADIUM:
            return cur["stadium"][0]
        if area == DECK:
            return (sel or {}).get("deck", [])[index]
        if area == LOOKING:
            return (cur.get("looking") or [])[index]
    except (IndexError, KeyError, TypeError):
        return None
    return None


def _ref(c):
    return None if c is None else {"id": c["id"], "serial": c["serial"]}


def describe_ai_action(obs, ans, ai):
    """Turn the AI's answer into a public description. Only cards that are
    public once the action resolves are named."""
    sel, cur = obs["select"], obs["current"]
    opts = [sel["option"][i] for i in ans if 0 <= i < len(sel["option"])]
    base = {"selectType": sel["type"], "context": sel["context"]}
    if sel["type"] == 0 and opts:
        o = opts[0]
        t = o["type"]
        me = cur["players"][ai]
        act = me["active"][0] if me["active"] else None
        if t == 7:      # PLAY
            return {**base, "kind": "play", "card": _ref(card_at(cur, sel, HAND, o["index"], ai))}
        if t in (8, 9):  # ATTACH / EVOLVE
            src = card_at(cur, sel, o.get("area", HAND), o["index"], ai)
            tgt = card_at(cur, sel, o["inPlayArea"], o["inPlayIndex"], ai)
            return {**base, "kind": "attach" if t == 8 else "evolve",
                    "card": _ref(src), "target": _ref(tgt)}
        if t == 10:
            return {**base, "kind": "ability",
                    "card": _ref(card_at(cur, sel, o["area"], o["index"], ai))}
        if t == 11:
            return {**base, "kind": "discard",
                    "card": _ref(card_at(cur, sel, o["area"], o["index"], ai))}
        if t == 12:
            return {**base, "kind": "retreat", "card": _ref(act)}
        if t == 13:
            return {**base, "kind": "attack", "card": _ref(act),
                    "attackId": o["attackId"]}
        if t == 14:
            return {**base, "kind": "end"}
    kind = {"kind": "choose", "count": len(opts)}
    shown = []
    for o in opts:
        t = o["type"]
        if t == 1:
            kind["yesno"] = True
        elif t == 2:
            kind["yesno"] = False
        elif t == 0:
            kind["number"] = o.get("number")
        elif t == 13:
            kind["attackId"] = o.get("attackId")
        elif t == 3 and o.get("area") in PUBLIC_AREAS:
            shown.append(_ref(card_at(cur, sel, o["area"], o["index"],
                                      o.get("playerIndex", ai))))
        elif t in (4, 5, 6):
            poke = card_at(cur, sel, o["area"], o["index"], o.get("playerIndex", ai))
            if poke:
                lst = poke.get("tools" if t == 4 else "energyCards") or []
                k = o.get("toolIndex" if t == 4 else "energyIndex", 0) or 0
                if k < len(lst):
                    shown.append(_ref(lst[k]))
    kind["cards"] = [c for c in shown if c]
    return {**base, **kind}


class View:
    """Builds the human-visible board from either seat's observation."""

    def __init__(self, human):
        self.human = human
        self.ai = 1 - human
        self.hand = []        # last hand seen in a human observation

    def from_human(self, cur):
        cur = copy.deepcopy(cur)
        self.hand = cur["players"][self.human]["hand"] or []
        return cur

    def from_ai(self, cur):
        cur = copy.deepcopy(cur)
        ai, hu = cur["players"][self.ai], cur["players"][self.human]
        ai["hand"] = None
        ai["prize"] = [None] * len(ai["prize"])
        cur["looking"] = None
        n = hu["handCount"]
        hand = list(self.hand[:n])
        hand += [{"id": 0, "serial": -1 - i, "playerIndex": self.human}
                 for i in range(n - len(hand))]
        hu["hand"] = hand
        if cur.get("turn", 0) == 0:
            # set-up Pokemon are placed face down
            ai["active"] = [None] if ai["active"] else []
            ai["bench"] = []
        cur["yourIndex"] = self.human
        return cur


def run(conn, submission_dir):
    try:
        env = load_agent(submission_dir)
        conn.send({"type": "ready"})
        cmd = conn.recv()
        if cmd.get("cmd") != "start":
            return
        agent = set_ai_deck(env, submission_dir, cmd.get("aiDeck"))
        from cg import game
        human = int(cmd["humanSeat"])
        ai = 1 - human
        ai_deck = agent(dict(DECK_CALL))
        human_deck = list(cmd["humanDeck"])
        decks = [human_deck, ai_deck] if human == 0 else [ai_deck, human_deck]
        obs, sd = game.battle_start(decks[0], decks[1])
        if obs is None:
            who = "your" if sd.errorPlayer == human else "the AI's"
            conn.send({"type": "error",
                       "message": f"The engine rejected {who} deck (error {sd.errorType})."})
            return
        view = View(human)
        conn.send({"type": "started", "humanSeat": human})
        steps = 0
        while obs["current"]["result"] == -1 and steps < 4000:
            steps += 1
            seat = obs["current"]["yourIndex"]
            if seat == ai:
                t0 = time.time()
                ans = agent(obs)
                action = describe_ai_action(obs, ans, ai)
                action["thinkMs"] = int((time.time() - t0) * 1000)
                try:
                    obs = game.battle_select(list(ans))
                except Exception:
                    obs = game.battle_select([0] if obs["select"]["option"] else [])
                if obs["current"]["yourIndex"] == ai or obs["current"]["result"] != -1:
                    conn.send({"type": "ai_step", "action": action,
                               "state": view.from_ai(obs["current"])})
                else:
                    conn.send({"type": "ai_step", "action": action, "state": None})
                continue
            state = view.from_human(obs["current"])
            conn.send({"type": "prompt", "state": state, "select": obs["select"],
                       "logs": obs.get("logs") or []})
            while True:
                msg = conn.recv()
                if msg.get("cmd") == "quit":
                    return
                if msg.get("cmd") != "answer":
                    continue
                ans = [int(i) for i in msg.get("indices", [])]
                sel = obs["select"]
                n = len(sel["option"])
                ok = (sel["minCount"] <= len(ans) <= sel["maxCount"]
                      and len(set(ans)) == len(ans)
                      and all(0 <= i < n for i in ans))
                if ok:
                    try:
                        obs = game.battle_select(ans)
                        break
                    except Exception:
                        pass
                conn.send({"type": "invalid", "message": "That choice isn't allowed here."})
                conn.send({"type": "prompt", "state": state, "select": obs["select"],
                           "logs": []})
        cur = obs["current"]
        reason = None
        for lg in obs.get("logs") or []:
            if lg.get("type") == 23:
                reason = lg.get("reason")
        final = (view.from_human(cur) if cur["yourIndex"] == human
                 else view.from_ai(cur))
        conn.send({"type": "game_over", "result": cur["result"], "reason": reason,
                   "humanSeat": human, "state": final, "aiDeck": ai_deck,
                   "logs": (obs.get("logs") or []) if cur["yourIndex"] == human else []})
        try:
            game.battle_finish()
        except Exception:
            pass
    except (EOFError, BrokenPipeError):
        return
    except Exception as e:
        traceback.print_exc()
        try:
            conn.send({"type": "error", "message": f"{type(e).__name__}: {e}"})
        except Exception:
            pass


def worker_main(conn, submission_dir):
    run(conn, submission_dir)
    try:
        conn.close()
    except Exception:
        pass
