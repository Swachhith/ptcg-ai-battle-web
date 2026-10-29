# PTCG AI Battle Web

Play the Pokémon Trading Card Game in your browser against a reinforcement-learning agent that
competed in the Kaggle competition
[*The Pokémon Company – PTCG AI Battle Challenge*](https://www.kaggle.com/competitions/pokemon-tcg-ai-battle).

The opponent is the exact final Kaggle submission (submission 55559155 by **Dipam Chakraborty,
Team Unown Gradiant**). It is a token-transformer policy trained by self-play PPO. The weights,
the agent code and its training stack come from the open-source release
[dipamc/kaggle-ptcg-ai-battle](https://github.com/dipamc/kaggle-ptcg-ai-battle) (MIT). This
repository adds an interactive web app on top of it and keeps the full training pipeline, so you
can see both how the agent plays and how it was made.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How the web app works](#how-the-web-app-works)
- [The agent](#the-agent)
- [How the agent was trained](#how-the-agent-was-trained)
- [Repository layout](#repository-layout)
- [Official card images (optional)](#official-card-images-optional)
- [Development](#development)
- [What is not in this repository](#what-is-not-in-this-repository)
- [Credits and license](#credits-and-license)

---

## Features

**Play the agent**
- The official competition engine runs the game, so every rule is enforced exactly as on the Kaggle
  ladder. The UI only offers moves the engine reports as legal.
- The board is animated. Cards fly from hand to field. HP bars, damage counters, attached Energy,
  Pokémon Tools, evolution stacks and Special Conditions are all visible, and damage and healing
  numbers pop up as they happen.
- The AI's turn plays out step by step with captions ("AI attached Basic Grass Energy to Teal Mask
  Ogerpon ex", "Hydrapple ex used …!"). Its speed is adjustable from 0.5× to 4×.
- On your turn you can click a glowing card to see its actions, drag cards from your hand onto a
  Pokémon or the Bench, or use the attack / retreat / End turn dock. A sidebar lists every legal
  move.
- Every other decision opens a chooser: deck searches, targets, discards, coin calls, damage-counter
  placement, effect order and so on. A "peek board" toggle lets you look at the board meanwhile.
- Hover any card to read its full text in the zoom panel. Both discard piles can be opened. The
  game log is written from your point of view.
- The result screen shows prizes taken, offers a rematch, and reveals the AI's 60-card list.

**Decks**
- 106 presets: the AI's tournament deck (Hydrapple ex / Meganium) plus one list for each of the
  105 archetypes in the agent's training pool.
- Deck builder over all 1,267 cards the engine knows, with search (name, attack, ability text, set
  code), filters by card kind, stage and type, and live rule checks (60 cards, max 4 copies per
  name, max 1 ACE SPEC, at least one Basic Pokémon). The engine itself gives the final verdict.
  You can import/export decks in the repo's `deck.csv` format, and custom decks are saved in your
  browser.
- The agent can also pilot any preset instead of its own deck: same weights, different list.

**Card art**
- By default, cards are drawn from engine data with generated, seeded artwork in the card's type
  palette.
- Optional official card images, fetched from a public Kaggle dataset (see
  [below](#official-card-images-optional)). An Official / Generated toggle switches between them.

---

## Quick start

**Requirements**
- Python 3.10+ and Node.js 18+.
- A Kaggle account that has joined the
  [competition](https://www.kaggle.com/competitions/pokemon-tcg-ai-battle) and accepted its rules,
  with an API token at `~/.kaggle/kaggle.json`. The game engine can only be downloaded from there.
- Windows (x64), Linux (x86_64 / arm64) or macOS. The competition SDK ships an engine library for
  each.

```bash
git clone https://github.com/<you>/ptcg-ai-battle-web.git
cd ptcg-ai-battle-web
pip install -r webapp/requirements.txt

# one-time: competition SDK + card sheet (~300 MB download, not redistributable)
python setup/fetch_kaggle_data.py

# optional: official card images (~3.7 GB download, ~70 MB kept)
python webapp/tools/fetch_card_images.py

# build the frontend and start the server
cd webapp/web && npm install && npm run build && cd ../..
python -X utf8 webapp/server/app.py
```

Open **http://localhost:8000**. On Windows, `webapp\start.bat` does the data fetch, the build and the
launch in one step. On Linux and macOS, use `webapp/start.sh`.

> **Windows note:** start Python in UTF-8 mode (`-X utf8` or `PYTHONUTF8=1`). The agent opens its
> data files with the platform default encoding. Under cp1252 it fails to load them, and its
> fallback then silently plays random legal moves instead of using the model. The launchers and the
> server set this for you.

---

## How the web app works

```
 browser (React)                FastAPI server                      game process (one per game)
 ───────────────                ──────────────                      ───────────────────────────
 setup / deck builder  ──HTTP──  /api/cards  /api/presets            exec(submission/main.py)
                                 /api/validate ── engine check         = the Kaggle agent, unchanged
 game board  ◄──WebSocket──────► /ws/game  ◄────── Pipe ────────────► cg.game battle (official engine)
    ▲  prompt / ai_step / game_over                                      │ AI seat: agent(obs)
    └─ answer [option indices]                                           │ human seat: wait for answer
                                                                         └ redact AI-private info
```

- **One process per game.** The SDK's `cg.game` holds one battle per process, and the submitted
  agent keeps per-episode globals. Each game therefore gets a fresh process that loads the agent
  the way kaggle-environments does (`exec` of `submission/main.py`). The server keeps one process
  pre-loaded, so a new game starts immediately.
- **The protocol is the competition's own.** Each turn the human seat receives the engine's
  `select` (options, min/max counts, context). The browser answers with option indices, just like
  an agent. The server checks the answer's shape, and the engine checks legality. An illegal answer
  is re-prompted, never forfeited.
- **Hidden information is respected.** When the AI acts, the engine observation is from the AI's
  seat and contains its hand, deck-search results and cards it is looking at. The worker strips all
  of that, hides set-up Pokémon while they are face down, and keeps your last known hand. The game
  log is built only from your seat's observations, where the opponent's draws are face down.
- **Narration.** The AI's answers are translated into public descriptions. Only cards that become
  public through the action itself are named.
- **Deck validation.** `POST /api/validate` calls the engine's `BattleStart` with the deck. The
  engine is the rulebook, including per-name copy limits across reprints.

| endpoint | purpose |
|---|---|
| `GET /api/cards` | the engine card database merged with the card sheet (set, number, printed damage strings) and an image flag |
| `GET /api/presets` | preset decks with featured card and main types |
| `POST /api/validate` | `{cards: [60 ids]}` → `{ok, message}` |
| `WS /ws/game` | send `{deck, aiDeck?, seat?}`; receive `loading`, `started`, `ai_step`, `prompt`, `invalid`, `game_over`; send `{type: "answer", indices}` |
| `GET /cardimg/<id>.webp` | official card images, when fetched |

---

## The agent

`submission/` is the exact bundle uploaded to Kaggle (minus the SDK and card sheet, which are not
redistributable):

| file | what |
|---|---|
| `main.py` | Kaggle entry point. Greedy policy play (`SearchAgent(cfg=None, temp=0.0)`, argmax every decision), a rejection guard, and a time-budget valve that switches to free legal answers below 30 s of remaining overage time |
| `model.pt` | the trained policy, 19.5 MB. Token transformer, d=256, 4 layers, 8 heads, FFN 512 |
| `deck.csv` | Hydrapple ex / Meganium / Forest of Vitality, identical to `decks/pool/hydrapple_ex_meganium_forest_of_vitality__03.csv` |
| `ptcg/` | the runtime as shipped: observation encoder, hidden-information tracker, lingering-effect model, torch model, agent |
| `data/` | static tables: `embed_pca.npz` (text embeddings) and `lingering_effects.json` |

The web app plays this bundle unchanged. The only addition is optional: `set_ai_deck` in
`webapp/server/worker.py` builds a second `SearchAgent` with the same weights and a different
`deck.csv`, for when you ask the AI to pilot another preset.

---

## How the agent was trained

Everything here is in `native/`, `ptcg/`, `tools/`, `setup/` and `docs/`, as released by the
original author. This section summarizes it. The full details are in
[docs/training.md](docs/training.md), [docs/model.md](docs/model.md),
[docs/deck-pool.md](docs/deck-pool.md), [docs/eval.md](docs/eval.md) and
[docs/engine.md](docs/engine.md).

### Training stack: no PyTorch in the loop

The trainer is one CUDA process per GPU. Three pieces compile into a single Python extension:

| piece | what it is |
|---|---|
| `native/ptcg/` | the game environment in C: observation encoder, hidden-information tracker, oracle, deck sampling, self-play driver. It links directly against the competition engine (`libcg`) |
| `native/model/` | the policy/value network in CUDA (forward and backward, fp32), mirroring the torch reference `ptcg/rl/model.py` |
| `native/src/` | PufferLib's native CUDA trainer (commit `c5d3c63`) with local patches (`native/PATCHES.md`) |

Rollouts never cross a Python boundary. The C env fills a pinned observation buffer, the CUDA model
acts on it, and PPO with the Muon optimizer runs on the device. PyTorch is used only to create the
initial weights and to convert checkpoints to `.pt` for evaluation (`native/tools/native_weights.py`).

### Observation and action space

- **Observation:** a fixed 10,944-float row (`ptcg/rl/buffers.py`, version 4). It holds up to 160
  card tokens (every visible card with zone, owner, HP, energy, status and similar features), up to
  64 option descriptors, a global feature block, a decision block (select type and context), and
  a 136-float **oracle** block. The oracle block holds ground truth such as the opponent's hand and
  prizes, and **only the critic** sees it.
- **Actions:** one categorical head over 64 slots. Slots 0–62 index the engine's options directly,
  and slot 63 is STOP. A multi-select (`maxCount > 1`) is answered one pick at a time, with STOP to
  finish, so the action space stays small.
- **Hidden information:** `ptcg/tracker.py` deduces everything the agent may legitimately know
  (cards it hasn't seen yet, known cards in the opponent's hand, inferred prizes) from the
  observation stream alone. `ptcg/effects.py` models lingering card effects (locks, damage
  modifiers, durations).

### Network (`ptcg/rl/model.py`, `native/model/ptcg_model.cu`)

- **Card encoder:** each card is a learned id embedding, plus 58 static features (type, stage,
  ex/Mega/Tera/ACE SPEC flags, HP, retreat cost, prize liability, weakness and resistance), plus a
  frozen PCA-reduced **text embedding** of its printed text, plus pooled vectors of its attacks and
  abilities.
- **Trunk:** card tokens (with attached tools, zone and owner embeddings) and a CLS readout token
  go through 4 pre-LN transformer blocks (d=256, 8 heads, FFN 512). Global and decision features
  are broadcast into every token.
- **Policy head:** each option slot builds a query from its option type, the trunk states of the
  cards it points to, and its card/attack vectors. It is scored against the readout and masked to
  legal options.
- **Critic:** an *asymmetric* oracle critic. Extra attention layers over the trunk output plus the
  oracle tokens produce the PPO baseline. A "blind" value head that sees only what the policy sees
  is trained alongside it. Auxiliary heads predict the opponent's hand and which of your unseen
  cards are prized.
- About **4.47 M parameters** in total (trunk 2.11 M). Only the policy is needed at play time.

### Algorithm

- **PPO** with GAE (γ = 1.0, λ = 0.95), clip 0.2, value clip 0.2, horizon 64, entropy 0.01, value
  coefficient 2.0, max grad norm 1.5, prioritized replay (α = 0.8, annealed β), and the **Muon**
  optimizer (lr 1e-3, cosine schedule).
- **Reward:** +1 for a win and −1 for a loss, nothing else.
- **Self-play with one row per game:** the observation is always from the seat that must decide.
  The advantage kernel is **negamax**: it flips the sign of the bootstrap whenever the acting seat
  changes, so one shared policy learns both sides of every game.
- **Opponent mix:** 98% mirror self-play. The rest is a random-legal opponent (this is the
  `win_vs_rand` health metric) and optional **league** banks of frozen past checkpoints.
- **Deck sampling:** each seat draws a deck from a pool of **616 competitive lists over 105
  archetypes** (`decks/pool`). A random opponent can also draw from an 87-deck **coverage pool**
  (`decks/pool_alt`), so every card in the database is seen during training. The pool can grow and
  be re-weighted while a run is live, through request files (`docs/deck-pool.md`).
- **Safety rails:** minibatch updates are skipped when approximate KL or value loss spikes, and the
  run aborts if spikes persist. A supervisor relaunches crashed or hung runs and keeps an
  evaluation watcher running alongside training.
- **Deck matrix:** a training run can periodically write a deck-vs-deck win matrix.
  `tools/deck_matrix.py`, `deck_nash.py` and `deck_generalists.py` analyse it. This is how the
  final deck was chosen.

### Reproducing a run

Training needs Linux with an NVIDIA GPU, nvcc and NCCL. The C environment tests run on any
Linux/macOS machine.

```bash
python setup/fetch_kaggle_data.py                 # SDK + card sheet
bash setup/bootstrap.sh                           # pinned deps, engine smoke test, data/carddb.json
PYTHONPATH=data:. python3 native/tools/export_tables.py native/ptcg_tables.bin \
    --pool decks/pool --alt-pool decks/pool_alt   # static tables blob for the C env + CUDA model
make -C native test                               # C env contract tests (no GPU)
bash native/build_native.sh                       # -> native/puffer_ptcg/_C*.so

PYTHONPATH=data:.:native PTCG_TABLES=native/ptcg_tables.bin \
python3 native/train_native.py --run-name run1 --deck-pool decks/pool \
    --gpus 1 --total-agents 1024 --minibatch 512 --timesteps 1000000000 \
    --deck-matrix-every 20000 --checkpoint-interval 50
```

Turn a checkpoint into a playable agent and pit it against another one:

```bash
PYTHONPATH=data:.:native python3 native/tools/native_weights.py import \
    experiments/native-run1/<step>.bin model.pt
PYTHONPATH=data:. python3 -m ptcg.rl.arena --ckpt model.pt \
    --deck decks/pool/hydrapple_ex_meganium_forest_of_vitality__03.csv \
    --opponent opponents/<agent-dir> --games 50 --heads 8 --temp 0 --device cpu
```

`battery/` holds the anchor and candidate decks the final run was scored on. `tools/make_opponents.sh`
packages any checkpoint as a Kaggle-format agent directory (the `agent/` template). That directory
can be dropped into `submission/` to play it in the web app.

---

## Repository layout

| path | what |
|---|---|
| `webapp/server/` | FastAPI app (`app.py`), per-game worker (`worker.py`), card DB / presets / validation (`carddb.py`) |
| `webapp/web/` | React + TypeScript + framer-motion frontend (Vite) |
| `webapp/tools/` | `fetch_card_images.py` and the card-id → image mapping (`card_image_map.py`) |
| `webapp/start.bat`, `start.sh` | one-step launchers |
| `submission/` | the exact Kaggle submission the web app plays |
| `native/` | the trainer: C env, CUDA model, patched PufferLib, build scripts, supervisor, weight tools |
| `ptcg/` | Python runtime shared by training and evaluation: encoder, tracker, model, agent, arena, eval battery |
| `tools/` | card DB and text-embedding builders, deck-pool validation, deck-matrix analysis, self-eval runners |
| `decks/pool`, `decks/pool_alt` | training pool (616 decks) and coverage pool (87 decks). The web app's presets come from `decks/pool` |
| `battery/` | evaluation battery used on the final run |
| `agent/` | Kaggle-format agent template |
| `data/` | static tables (`embed_pca.npz`, `lingering_effects.json`); the SDK and card sheet are fetched into it |
| `setup/` | `fetch_kaggle_data.py`, `bootstrap.sh`, pinned training requirements |
| `docs/` | engine, model, training, deck pool and evaluation documentation |

---

## Official card images (optional)

```bash
python webapp/tools/fetch_card_images.py          # whole dataset as one zip (~3.7 GB, deleted afterwards)
python webapp/tools/fetch_card_images.py --files  # per-file downloads (Kaggle rate-limits these heavily)
```

The script reads the Kaggle dataset
[`ellimaaac/pokemon-tcg-all-image-cards`](https://www.kaggle.com/datasets/ellimaaac/pokemon-tcg-all-image-cards).
It matches each engine card to an image by **printed set code and collection number**: for example,
`TWM 025` maps to `twilight-masquerade/sv6_en_025_std.jpg`. The set table is in
`webapp/tools/card_image_map.py`. It resolves 1,259 of 1,267 cards. The other 8 (cards with no set
code in the card sheet) keep generated art. Images are stored as 420 px WebP files in
`webapp/server/card_images/` (about 70 MB) and are git-ignored.

Card artwork is © The Pokémon Company / Nintendo / Creatures / GAME FREAK. Keep the images for
personal, local use and do not commit or redistribute them.

---

## Development

```bash
python -X utf8 webapp/server/app.py      # API + game server on :8000
cd webapp/web && npm run dev             # Vite on :5173, proxies /api and /ws to :8000
```

Environment variables: `PORT` (8000), `HOST` (127.0.0.1), `PTCG_MAX_GAMES` (8 concurrent games),
and `PTCG_REPO` (repo root, if the server runs from elsewhere).

Frontend map:

| file | what |
|---|---|
| `src/game/useGame.ts` | WebSocket session, AI-step playback queue and pacing, auto-answers for forced selects |
| `src/game/options.ts` | resolves option references to cards, prompt texts for all 49 select contexts, AI narration |
| `src/game/Board.tsx` | Pokémon slots, bench, prizes, piles, hand; shared-layout animations keyed by card serial |
| `src/game/Chooser.tsx` | chooser modal for non-main selects and the action popover |
| `src/screens/` | setup, game and deck-builder screens |
| `src/components/Card.tsx` | card renderer: generated faces (Pokémon / Trainer / Energy) or official image |

---

## What is not in this repository

| missing | why | how to get it |
|---|---|---|
| competition SDK (`cg/`, engine binaries) and `EN_Card_Data.csv` | competition data; redistribution not allowed | `python setup/fetch_kaggle_data.py` |
| official card images | copyrighted artwork | `python webapp/tools/fetch_card_images.py` |
| the deck lab (`decklab/`, `tools/decklab_*`, `tools/dlab.py`) | not needed to play or to train | [upstream repository](https://github.com/dipamc/kaggle-ptcg-ai-battle) |

---

## Credits and license

- **Agent, model weights, training stack, deck pools, docs in `docs/`:** Dipam Chakraborty, Team
  Unown Gradiant, from [dipamc/kaggle-ptcg-ai-battle](https://github.com/dipamc/kaggle-ptcg-ai-battle),
  MIT. If you use the training code, please cite it (`CITATION.cff`).
- **Trainer core:** [PufferLib](https://github.com/PufferAI/PufferLib) (MIT, `native/src/PUFFERLIB_LICENSE`).
  JSON parsing uses [cJSON](https://github.com/DaveGamble/cJSON) (MIT).
- **Game engine:** the competition's `cabt` simulator, by the competition organisers. It is not
  included and remains subject to the competition rules.
- **Web app (`webapp/`):** this repository.

Released under the MIT License (see [LICENSE](LICENSE)). Pokémon and all related names are
trademarks of their respective owners. This is a fan project for research and education, not
affiliated with or endorsed by The Pokémon Company.
