"""Download the card images the engine needs from the Kaggle dataset
ellimaaac/pokemon-tcg-all-image-cards and store them as small WebP files.

    python webapp/tools/fetch_card_images.py          # whole-dataset zip (~3.7 GB, one request)
    python webapp/tools/fetch_card_images.py --files  # per-file requests (Kaggle rate-limits these)

Needs the Kaggle CLI credentials (~/.kaggle). Writes webapp/server/card_images/<cardId>.webp
and only downloads what is missing, so it can be re-run."""
import io
import os
import sys
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))
from card_image_map import build_map  # noqa: E402
from paths import CARD_CSV, WEBAPP  # noqa: E402

DATASET = "ellimaaac/pokemon-tcg-all-image-cards"
OUT = os.path.join(WEBAPP, "server", "card_images")
WIDTH = 420


def list_files(api):
    names, tok = [], None
    while True:
        r = api.dataset_list_files(DATASET, page_token=tok, page_size=1000)
        names += [f.name for f in r.files]
        tok = r.next_page_token
        if not tok:
            return names


def save_webp(data, dst):
    im = Image.open(io.BytesIO(data)).convert("RGB")
    h = round(im.height * WIDTH / im.width)
    im.resize((WIDTH, h), Image.LANCZOS).save(dst, "WEBP", quality=84, method=5)


def from_zip(api, found):
    """One download of the whole dataset, then convert only the files we need."""
    tmp = os.path.join(os.path.dirname(WEBAPP), ".cache", "card-images")
    os.makedirs(tmp, exist_ok=True)
    zpath = os.path.join(tmp, DATASET.split("/")[1] + ".zip")
    if not os.path.exists(zpath):
        print("downloading the dataset zip (~3.7 GB)...", flush=True)
        api.dataset_download_files(DATASET, path=tmp, quiet=False, unzip=False)
    stats = {"ok": 0, "skip": 0, "fail": 0}
    with zipfile.ZipFile(zpath) as z:
        names = set(z.namelist())
        for cid, path in found.items():
            dst = os.path.join(OUT, f"{cid}.webp")
            if os.path.exists(dst):
                stats["skip"] += 1
            elif path in names:
                save_webp(z.read(path), dst)
                stats["ok"] += 1
            else:
                stats["fail"] += 1
                print("not in zip:", cid, path)
    os.remove(zpath)
    print("done", stats)


def fetch(api, cid, path):
    dst = os.path.join(OUT, f"{cid}.webp")
    if os.path.exists(dst):
        return "skip"
    with tempfile.TemporaryDirectory() as tmp:
        api.dataset_download_file(DATASET, path, path=tmp, quiet=True)
        got = [os.path.join(tmp, f) for f in os.listdir(tmp)]
        if not got:
            return "fail"
        data = open(got[0], "rb").read()
        if data[:2] == b"PK":   # some downloads arrive zipped
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                data = z.read(z.namelist()[0])
    save_webp(data, dst)
    return "ok"


def main():
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
    os.makedirs(OUT, exist_ok=True)
    found, missing = build_map(list_files(api), CARD_CSV)
    print(f"{len(found)} cards matched; no image for {sum(len(v) for v in missing.values())}")
    if "--files" not in sys.argv:
        return from_zip(api, found)
    stats = {"ok": 0, "skip": 0, "fail": 0}

    def job(item):
        cid, path = item
        for _ in range(3):
            try:
                return fetch(api, cid, path)
            except Exception as e:  # transient HTTP errors
                err = e
        print("failed", cid, path, err)
        return "fail"

    with ThreadPoolExecutor(12) as ex:
        for i, r in enumerate(ex.map(job, found.items())):
            stats[r] += 1
            if i % 100 == 0:
                print(i, stats, flush=True)
    print("done", stats)


if __name__ == "__main__":
    main()
