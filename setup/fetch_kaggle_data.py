"""Fetch the competition simulator SDK and card sheet from Kaggle.

    python setup/fetch_kaggle_data.py

Neither may be redistributed, so they are not in this repository. This script
downloads the competition archive (~300 MB) with your Kaggle credentials
(~/.kaggle/kaggle.json; you must have joined the competition and accepted its
rules) and installs:

    data/cg/                        simulator SDK (cg.dll / libcg.so / libcg.dylib + Python wrappers)
    data/EN_Card_Data.csv           card sheet
    submission/cg/                  the same SDK, inside the agent bundle
    submission/EN_Card_Data.csv     card sheet, where the agent looks for it
    submission/data/EN_Card_Data.csv
"""
import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMP = "pokemon-tcg-ai-battle"
SDK_PREFIX = "sample_submission/sample_submission/cg/"
SHEET = "EN Card Data.csv"


def main():
    from kaggle.api.kaggle_api_extended import KaggleApi

    cache = os.path.join(ROOT, ".cache")
    os.makedirs(cache, exist_ok=True)
    zpath = os.path.join(cache, f"{COMP}.zip")
    if not os.path.exists(zpath):
        api = KaggleApi()
        api.authenticate()
        print("downloading the competition archive (~300 MB)...")
        api.competition_download_files(COMP, path=cache, quiet=False)

    with zipfile.ZipFile(zpath) as z:
        sdk = [n for n in z.namelist() if n.startswith(SDK_PREFIX) and not n.endswith("/")]
        if not sdk or SHEET not in z.namelist():
            sys.exit("archive layout changed: SDK or card sheet not found")
        for dst in ("data/cg", "submission/cg"):
            out = os.path.join(ROOT, dst)
            os.makedirs(out, exist_ok=True)
            for n in sdk:
                with z.open(n) as src, open(os.path.join(out, n[len(SDK_PREFIX):]), "wb") as f:
                    shutil.copyfileobj(src, f)
        sheet = z.read(SHEET)
        for dst in ("data/EN_Card_Data.csv", "submission/EN_Card_Data.csv",
                    "submission/data/EN_Card_Data.csv"):
            with open(os.path.join(ROOT, dst), "wb") as f:
                f.write(sheet)
    print("installed the SDK into data/cg and submission/cg, and the card sheet into data/ and submission/")
    if "--keep" not in sys.argv:
        os.remove(zpath)


if __name__ == "__main__":
    main()
