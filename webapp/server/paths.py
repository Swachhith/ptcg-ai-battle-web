"""Filesystem layout: webapp/ lives at the repo root next to submission/, data/ and decks/."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WEBAPP = os.path.dirname(HERE)
ROOT = os.path.dirname(WEBAPP)
REPO = os.environ.get("PTCG_REPO", ROOT)   # the repo root holds submission/, data/, decks/
SUBMISSION = os.path.join(REPO, "submission")
DATA = os.path.join(REPO, "data")
POOL = os.path.join(REPO, "decks", "pool")
CARD_CSV = os.path.join(DATA, "EN_Card_Data.csv")
DIST = os.path.join(WEBAPP, "web", "dist")
CARD_IMAGES = os.path.join(HERE, "card_images")
