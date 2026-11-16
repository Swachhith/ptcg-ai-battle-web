"""Export the submitted policy to ONNX so it can run in the browser.

    python -X utf8 webapp/tools/export_onnx.py <out.onnx> [--games 2]

The exported graph is the policy only (move scores; no critic). It takes one
encoded observation row (1 x OBS_SIZE float32) and returns 64 logits.

After exporting, the script plays the PyTorch agent against a random-legal
opponent, records every observation the agent was asked about, and checks
that ONNX Runtime gives the same scores and the same chosen move for each.
"""
import argparse
import os
import random
import sys

os.environ["PYTHONUTF8"] = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))

import numpy as np  # noqa: E402
import torch  # noqa: E402

from paths import SUBMISSION  # noqa: E402
from worker import load_agent  # noqa: E402


class PolicyForExport(torch.nn.Module):
    """PTCGTransformer._core with one change: the trunk runs over all
    MAX_TOKENS slots instead of slicing to the longest filled prefix. The
    slice length depends on the data, which a traced graph cannot express.
    Empty slots are masked out of attention either way, and option pointers
    only ever target filled slots, so the scores are the same."""

    def __init__(self, policy):
        super().__init__()
        self.p = policy

    def forward(self, obs):
        from ptcg.rl import model as M
        p = self.p
        B = obs.shape[0]
        card_vec, attack_vec = p._card_table()
        take = M._take

        tok_i = take(obs, "tok_int").view(B, M.MAX_TOKENS, M.TOK_INT).long()
        tok_f = take(obs, "tok_float").view(B, M.MAX_TOKENS, M.TOK_F)
        cid = tok_i[:, :, 0].clamp(0, M.N_CARDS - 1)
        t0, t1 = tok_i[:, :, 3], tok_i[:, :, 4]
        tool_vec = \
            card_vec[t0.clamp(0, M.N_CARDS - 1)] * (t0 > 0).unsqueeze(-1) + \
            card_vec[t1.clamp(0, M.N_CARDS - 1)] * (t1 > 0).unsqueeze(-1)
        x = p.token_proj(torch.cat([
            card_vec[cid], tool_vec, tok_f,
            p.zone_emb(tok_i[:, :, 1].clamp(0, M.N_ZONES - 1)),
            p.owner_emb(tok_i[:, :, 2].clamp(0, M.N_OWNERS - 1))], dim=-1))

        g = p.global_mlp(take(obs, "global_f"))
        dec_i = take(obs, "dec_int").long()
        D = M.DecInt
        d_vec = p.dec_mlp(torch.cat([
            p.sel_type_emb(dec_i[:, D.SELECT_TYPE].clamp(0, M.N_SELECT_TYPES - 1)),
            p.ctx_emb(dec_i[:, D.CONTEXT].clamp(0, M.N_CONTEXTS - 1)),
            card_vec[dec_i[:, D.EFFECT_CARD].clamp(0, M.N_CARDS - 1)],
            card_vec[dec_i[:, D.CONTEXT_CARD].clamp(0, M.N_CARDS - 1)],
            attack_vec[dec_i[:, D.MY_LAST_ATTACK].clamp(0, M.N_ATTACKS - 1)],
            attack_vec[dec_i[:, D.OPP_LAST_ATTACK].clamp(0, M.N_ATTACKS - 1)],
            card_vec[dec_i[:, D.MY_SUPPORTER].clamp(0, M.N_CARDS - 1)],
            card_vec[dec_i[:, D.OPP_SUPPORTER].clamp(0, M.N_CARDS - 1)],
            take(obs, "dec_float")], dim=-1))
        x = x + p.bcast(torch.cat([g, d_vec], dim=-1)).unsqueeze(1)

        valid = tok_i[:, :, 1] > 0
        x = torch.cat([p.readout.expand(B, 1, -1), x], dim=1)
        keep = torch.cat([
            torch.ones(B, 1, dtype=torch.bool), valid], dim=1).view(B, 1, 1, -1)
        for blk in p.blocks:
            x = blk(x, keep)
        h = p.ln_f(x)
        r = h[:, 0]

        opt_i = take(obs, "opt_int").view(B, M.MAX_OPTIONS, M.OPT_INT).long()
        opt_f = take(obs, "opt_float").view(B, M.MAX_OPTIONS, M.OPT_F)
        # pointer 0 means "no card" and must read as zeros; k+1 is buffer token k
        hz = torch.cat([torch.zeros(B, 1, p.d, dtype=h.dtype), h[:, 1:]], dim=1)
        idx1 = opt_i[:, :, 1].clamp(0, M.MAX_TOKENS)
        idx2 = opt_i[:, :, 2].clamp(0, M.MAX_TOKENS)
        p1 = hz.gather(1, idx1.unsqueeze(-1).expand(-1, -1, p.d))
        p2 = hz.gather(1, idx2.unsqueeze(-1).expand(-1, -1, p.d))
        q = p.q_mlp(torch.cat([
            p.opt_type_emb(opt_i[:, :, 0].clamp(0, M.N_OPT_TYPES - 1)),
            p1, p2,
            p.opt_card(card_vec[opt_i[:, :, 3].clamp(0, M.N_CARDS - 1)]),
            p.opt_attack(attack_vec[opt_i[:, :, 4].clamp(0, M.N_ATTACKS - 1)]),
            opt_f], dim=-1))
        rr = r.unsqueeze(1).expand(-1, M.MAX_OPTIONS, -1)
        gg = g.unsqueeze(1).expand(-1, M.MAX_OPTIONS, -1)
        dd = d_vec.unsqueeze(1).expand(-1, M.MAX_OPTIONS, -1)
        scores = p.score_mlp(torch.cat(
            [q, rr, gg, dd, q * rr], dim=-1)).squeeze(-1)
        return scores.masked_fill(take(obs, "opt_mask") == 0, -1e9)


def record_rows(env, games):
    """Play the torch agent against random legal moves; keep every row it scored."""
    from cg import game
    sa = env["SA"]
    rows, outs = [], []
    orig = sa._logits

    def spy(*a, **k):
        logits, v = orig(*a, **k)
        rows.append(sa.row.copy())
        outs.append(logits.numpy().copy())
        return logits, v

    sa._logits = spy
    rng = random.Random(7)
    deck = list(env["DECK"])
    for g in range(games):
        env["agent"]({"select": None, "logs": [], "current": None, "search_begin_input": None})
        obs, _ = game.battle_start(deck, deck) if g % 2 == 0 else game.battle_start(deck, deck)
        ai = g % 2
        steps = 0
        while obs["current"]["result"] == -1 and steps < 3000:
            steps += 1
            sel = obs["select"]
            if obs["current"]["yourIndex"] == ai:
                ans = env["agent"](obs)
            else:
                n = len(sel["option"])
                k = rng.randint(sel["minCount"], min(sel["maxCount"], n))
                ans = sorted(rng.sample(range(n), k))
            try:
                obs = game.battle_select(list(ans))
            except Exception:
                obs = game.battle_select([0] if sel["option"] else [])
        try:
            game.battle_finish()
        except Exception:
            pass
    sa._logits = orig
    return np.concatenate(rows), np.stack(outs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--games", type=int, default=2)
    args = ap.parse_args()
    out = os.path.abspath(args.out)

    env = load_agent(SUBMISSION)
    policy = env["SA"].policy
    wrapper = PolicyForExport(policy).eval()

    rows, want = record_rows(env, args.games)
    print(f"recorded {len(rows)} decisions from {args.games} game(s)")

    with torch.no_grad():
        full = wrapper(torch.from_numpy(rows)).numpy()
    legal = want > -1e8
    print("full-length trunk vs the agent's own forward: max |diff| =",
          float(np.abs(full - want)[legal].max()))

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            wrapper, (torch.from_numpy(rows[:1]),), out,
            input_names=["obs"], output_names=["logits"],
            opset_version=17, do_constant_folding=True, dynamo=False)
    print("wrote", out, f"({os.path.getsize(out) / 1e6:.1f} MB)")

    import onnxruntime as ort
    sess = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
    got = np.concatenate([sess.run(None, {"obs": rows[i:i + 1]})[0] for i in range(len(rows))])
    diff = float(np.abs(got - want)[legal].max())
    same = int((got.argmax(1) == want.argmax(1)).sum())
    print(f"ONNX vs PyTorch: max |diff| = {diff:.2e}; same chosen move in {same}/{len(rows)} decisions")
    # A few recorded rows and the scores PyTorch gave, for checking the browser build.
    np.savez_compressed(os.path.splitext(out)[0] + ".check.npz", rows=rows[:24], logits=want[:24])
    if same != len(rows):
        sys.exit("MISMATCH: the exported model does not reproduce the agent")


if __name__ == "__main__":
    main()
