"""HTTP + WebSocket front for human-vs-agent games.

    python -X utf8 webapp/server/app.py        # http://localhost:8000
"""
import os

# The agent's data loaders open files without an explicit encoding; on
# Windows that means cp1252 and a silent fallback to random play. UTF-8
# mode must be on before any game process is spawned.
os.environ["PYTHONUTF8"] = "1"

import asyncio
import multiprocessing as mp
import random
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import carddb  # noqa: E402
from paths import CARD_IMAGES, DIST, SUBMISSION  # noqa: E402
from worker import worker_main  # noqa: E402

MAX_GAMES = int(os.environ.get("PTCG_MAX_GAMES", "8"))
CTX = mp.get_context("spawn")

app = FastAPI(title="PTCG AI Battle")
CARDS = carddb.build_cards()
PRESETS = carddb.build_presets(CARDS)
ENGINE_LOCK = threading.Lock()


class Worker:
    def __init__(self):
        self.conn, child = CTX.Pipe()
        self.proc = CTX.Process(target=worker_main, args=(child, SUBMISSION),
                                daemon=True)
        self.proc.start()
        child.close()

    def kill(self):
        try:
            self.conn.send({"cmd": "quit"})
        except Exception:
            pass
        try:
            self.conn.close()
        except Exception:
            pass
        if self.proc.is_alive():
            self.proc.terminate()


class Pool:
    """Keeps one game process loaded and idle so a new game starts at once."""

    def __init__(self):
        self.spare = None
        self.active = 0
        self.lock = threading.Lock()

    def take(self):
        with self.lock:
            w, self.spare = self.spare, None
        if w is None or not w.proc.is_alive():
            w = Worker()
        self.refill()
        return w

    def refill(self):
        with self.lock:
            if self.spare is None and self.active < MAX_GAMES:
                self.spare = Worker()


POOL = Pool()


@app.on_event("startup")
async def _warm():
    POOL.refill()


@app.get("/api/cards")
def api_cards():
    have = set()
    if os.path.isdir(CARD_IMAGES):
        have = {int(f[:-5]) for f in os.listdir(CARD_IMAGES) if f.endswith(".webp") and f[:-5].isdigit()}
    return [{**c, "img": c["id"] in have} for c in CARDS]


os.makedirs(CARD_IMAGES, exist_ok=True)
app.mount("/cardimg", StaticFiles(directory=CARD_IMAGES), name="cardimg")


@app.get("/api/presets")
def api_presets():
    return PRESETS


class DeckIn(BaseModel):
    cards: list[int]


@app.post("/api/validate")
def api_validate(d: DeckIn):
    with ENGINE_LOCK:
        ok, msg = carddb.validate_deck(d.cards)
    return {"ok": ok, "message": msg}


@app.websocket("/ws/game")
async def ws_game(ws: WebSocket):
    await ws.accept()
    if POOL.active >= MAX_GAMES:
        await ws.send_json({"type": "error", "message": "The server is full, try again shortly."})
        await ws.close()
        return
    POOL.active += 1
    worker = None
    try:
        start = await ws.receive_json()
        deck = [int(c) for c in start.get("deck", [])]
        ai_deck = start.get("aiDeck")
        if ai_deck:
            ai_deck = [int(c) for c in ai_deck]
        with ENGINE_LOCK:
            ok, msg = carddb.validate_deck(deck)
            if ok and ai_deck:
                ok, msg = carddb.validate_deck(ai_deck)
                msg = msg if ok else "AI deck: " + msg
        if not ok:
            await ws.send_json({"type": "error", "message": msg})
            return
        seat = start.get("seat")
        seat = random.randint(0, 1) if seat not in (0, 1) else int(seat)
        await ws.send_json({"type": "loading"})
        worker = await asyncio.to_thread(POOL.take)
        conn = worker.conn

        def recv():
            return conn.recv()

        first = await asyncio.to_thread(recv)
        if first.get("type") != "ready":
            await ws.send_json(first)
            return
        conn.send({"cmd": "start", "humanDeck": deck, "aiDeck": ai_deck,
                   "humanSeat": seat})

        async def pump_worker():
            while True:
                try:
                    msg = await asyncio.to_thread(recv)
                except (EOFError, OSError):
                    return
                await ws.send_json(msg)
                if msg.get("type") in ("game_over", "error"):
                    return

        async def pump_client():
            while True:
                msg = await ws.receive_json()
                if msg.get("type") == "answer":
                    conn.send({"cmd": "answer", "indices": msg.get("indices", [])})
                elif msg.get("type") == "quit":
                    return

        tasks = [asyncio.create_task(pump_worker()), asyncio.create_task(pump_client())]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        for t in done:
            exc = t.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
    except WebSocketDisconnect:
        pass
    finally:
        POOL.active -= 1
        if worker:
            worker.kill()
        POOL.refill()
        try:
            await ws.close()
        except Exception:
            pass


if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(DIST, path)
        if path and os.path.isfile(f):
            return FileResponse(f)
        # index.html names the hashed bundles; never let a browser keep a stale copy
        return FileResponse(os.path.join(DIST, "index.html"), headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"),
                port=int(os.environ.get("PORT", "8000")))
