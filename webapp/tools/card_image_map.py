"""Map engine card ids to image files in the Kaggle dataset
ellimaaac/pokemon-tcg-all-image-cards, by printed set code + collection number."""
import csv
import re
from collections import defaultdict

# engine set code -> (dataset folder, filename prefix)
SETS = {
    "SVI": ("Pokemon TCG/Pokemon TCG/scarlet-violet", "sv1"),
    "PAL": ("Pokemon TCG/Pokemon TCG/paldea-evolved", "sv2"),
    "TEF": ("Pokemon TCG/Pokemon TCG/temporal-forces", "sv5"),
    "TWM": ("Pokemon TCG/Pokemon TCG/twilight-masquerade", "sv6"),
    "SFA": ("Pokemon TCG/Pokemon TCG/shrouded-fable", "sv6-5"),
    "SCR": ("Pokemon TCG/Pokemon TCG/stellar-crown", "sv7"),
    "SSP": ("Pokemon TCG/Pokemon TCG/surging-sparks", "sv8"),
    "PRE": ("Pokemon TCG/Pokemon TCG/prismatic-evolutions", "sv8-5"),
    "JTG": ("Pokemon TCG/Pokemon TCG/journey-together", "sv9"),
    "DRI": ("Pokemon TCG/Pokemon TCG/destined-rivals", "sv10"),
    "BLK": ("Pokemon TCG/Pokemon TCG/black-bolt", "zsv10-5"),
    "WHT": ("Pokemon TCG/Pokemon TCG/white-flare", "rsv10-5"),
    "MEG": ("Pokemon TCG/Pokemon TCG/mega-evolution", "me1"),
    "PFL": ("Pokemon TCG/Pokemon TCG/phantasmal-flames", "me2"),
    "ASC": ("ascended-heroes/ascended-heroes", "me2-5"),
    "POR": ("perfect-order/perfect-order", "me3"),
    "SVE": ("Pokemon TCG/Pokemon TCG/scarlet-violet-energy", "sve"),
    "SVP": ("Pokemon TCG/Pokemon TCG/scarlet-violet-promos", "svbsp"),
    "PROMO": ("Pokemon TCG/Pokemon TCG/mega-evolution-promos", "mebsp"),
}

_NAME = re.compile(r"^([a-z0-9-]+)_en_(\d+)(?:_std)?(?:-\d+)?\.(?:jpg|png)$", re.I)


def index_dataset(names):
    """(folder, prefix, number) -> file path"""
    idx = {}
    for n in names:
        folder, _, base = n.rpartition("/")
        m = _NAME.match(base)
        if m:
            idx.setdefault((folder, m.group(1).lower(), int(m.group(2))), n)
    return idx


def engine_prints(card_csv):
    """card id -> (set code, collection number)"""
    out = {}
    with open(card_csv, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            cid = int(r["Card ID"])
            if cid in out:
                continue
            num = re.sub(r"\D", "", r["Collection No."] or "")
            out[cid] = (r["Expansion"], int(num) if num else None)
    return out


def build_map(names, card_csv):
    idx = index_dataset(names)
    found, missing = {}, defaultdict(list)
    for cid, (code, num) in engine_prints(card_csv).items():
        if code == "PROMO" and num is not None and num >= 100:
            code = "SVP"      # the sheet labels both promo series PROMO
        s = SETS.get(code)
        path = idx.get((s[0], s[1], num)) if s and num is not None else None
        if path:
            found[cid] = path
        else:
            missing[code].append((cid, num))
    return found, missing
