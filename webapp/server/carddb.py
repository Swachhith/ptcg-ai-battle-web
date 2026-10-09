"""Card database and preset decks served to the browser.

Card facts come from the engine itself (AllCard / AllAttack), with the
competition card sheet adding the printed set code, collection number and
the printed damage string ("30+", "120x")."""
import csv
import glob
import json
import os
import re
import sys
from collections import Counter

from paths import CARD_CSV, DATA, POOL, SUBMISSION

if DATA not in sys.path:
    sys.path.insert(0, DATA)

from cg.sim import lib  # noqa: E402  (loads the engine library)


def _csv_rows():
    rows = {}
    with open(CARD_CSV, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            rows.setdefault(int(r["Card ID"]), []).append(r)
    return rows


def build_cards():
    cards = json.loads(lib.AllCard().decode())
    attacks = {a["attackId"]: a for a in json.loads(lib.AllAttack().decode())}
    rows = _csv_rows()
    out = []
    for c in cards:
        cid = c["cardId"]
        rs = rows.get(cid, [])
        r0 = rs[0] if rs else {}
        printed = {}
        for r in rs:
            printed[r.get("Move Name", "")] = r.get("Damage", "")
        atks = []
        for aid in c["attacks"]:
            a = attacks.get(aid)
            if not a:
                continue
            dmg = printed.get(a["name"], "")
            if dmg in ("n/a", ""):
                dmg = str(a["damage"]) if a["damage"] else ""
            atks.append({"id": aid, "name": a["name"], "text": a["text"],
                         "damage": a["damage"], "dmgText": dmg,
                         "cost": a["energies"]})
        stage = ("stage2" if c["stage2"] else "stage1" if c["stage1"]
                 else "basic" if c["basic"] else None)
        cat = r0.get("Category", "n/a")
        out.append({
            "id": cid, "name": c["name"], "cardType": c["cardType"],
            "energyType": c["energyType"], "hp": c["hp"], "stage": stage,
            "ex": c["ex"], "megaEx": c["megaEx"], "tera": c["tera"],
            "aceSpec": c["aceSpec"], "evolvesFrom": c["evolvesFrom"],
            "weakness": c["weakness"], "resistance": c["resistance"],
            "retreat": c["retreatCost"], "skills": c["skills"],
            "attacks": atks, "set": r0.get("Expansion", ""),
            "num": r0.get("Collection No.", ""),
            "category": "" if cat == "n/a" else cat,
        })
    return out


_SMALL = {"ex", "of", "the", "at", "s"}


def pretty_archetype(slug):
    s = re.sub(r"_s_", "'s_", slug + "_")
    s = re.sub(r"^n's_", "N's_", s)
    words = [w for w in s.strip("_").split("_") if w]
    out = []
    for i, w in enumerate(words):
        if w == "ex":
            out.append("ex")
        elif w in _SMALL and i:
            out.append(w)
        elif w.startswith("N's"):
            out.append(w)
        else:
            out.append(w[0].upper() + w[1:])
    return " ".join(out)


def _featured(deck, by_id):
    def score(cid):
        c = by_id.get(cid)
        if not c or c["cardType"] != 0:
            return (-1,)
        return (c["megaEx"] * 3 + c["ex"] * 2 + (c["stage"] == "stage2"),
                c["hp"], -cid)
    pokes = [cid for cid in set(deck) if score(cid)[0] >= 0]
    return max(pokes, key=score) if pokes else deck[0]


def _deck_types(deck, by_id):
    cnt = Counter()
    for cid in deck:
        c = by_id.get(cid)
        if c and c["cardType"] == 0:
            cnt[c["energyType"]] += 1
    return [t for t, _ in cnt.most_common(2)]


def read_deck(path):
    with open(path) as f:
        return [int(l) for l in f if l.strip()][:60]


def build_presets(cards):
    by_id = {c["id"]: c for c in cards}
    sub_deck = read_deck(os.path.join(SUBMISSION, "deck.csv"))
    presets = [{
        "id": "ai-submission",
        "name": "Hydrapple ex · Meganium (AI tournament deck)",
        "archetype": "hydrapple_ex_meganium_forest_of_vitality",
        "cards": sub_deck, "featured": _featured(sub_deck, by_id),
        "types": _deck_types(sub_deck, by_id), "aiDeck": True,
    }]
    seen = set()
    for path in sorted(glob.glob(os.path.join(POOL, "*.csv"))):
        slug = os.path.basename(path)[:-4].rsplit("__", 1)[0]
        if slug in seen:
            continue
        seen.add(slug)
        deck = read_deck(path)
        if len(deck) != 60:
            continue
        presets.append({
            "id": slug, "name": pretty_archetype(slug), "archetype": slug,
            "cards": deck, "featured": _featured(deck, by_id),
            "types": _deck_types(deck, by_id), "aiDeck": False,
        })
    return presets


def validate_deck(deck):
    """The engine is the rulebook: a deck is legal iff BattleStart accepts it."""
    import ctypes
    from cg.sim import StartData  # noqa: F401
    if len(deck) != 60:
        return False, f"Deck has {len(deck)} cards; it needs exactly 60."
    cards = list(deck) + list(deck)
    arr = (ctypes.c_int * 120)(*cards)
    sd = lib.BattleStart(arr)
    if not sd.battlePtr:
        return False, f"The engine rejected this deck (error {sd.errorType})."
    lib.BattleFinish(sd.battlePtr)
    return True, "ok"
