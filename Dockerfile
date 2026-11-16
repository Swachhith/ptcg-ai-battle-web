# Game server for the web app, with the agent's network running in the player's browser
# (PTCG_INFERENCE=browser). No PyTorch in the image: it holds the rules engine, the NumPy
# side of the agent, and the FastAPI server.
#
# The competition SDK and card sheet may not be redistributed, so they are not in this
# repository. The build downloads them from Kaggle with your own API token, passed as a
# build secret named kaggle_json (on Render: a Secret File called kaggle.json).
#
#   docker build --secret id=kaggle_json,src=$HOME/.kaggle/kaggle.json -t ptcg-server .
#   docker run -p 8000:8000 -e PTCG_ALLOWED_ORIGINS=http://localhost:3000 ptcg-server

# ---- stage 1: fetch the SDK and card sheet (the 300 MB archive stays in this stage)
FROM python:3.12-slim AS sdk
WORKDIR /repo
RUN pip install --no-cache-dir kaggle six
COPY setup/fetch_kaggle_data.py setup/fetch_kaggle_data.py
RUN --mount=type=secret,id=kaggle_json,target=/root/.kaggle/kaggle.json,required=true \
    python setup/fetch_kaggle_data.py

# ---- stage 2: the server
FROM python:3.12-slim
ENV PYTHONUTF8=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    PTCG_INFERENCE=browser \
    PTCG_MAX_GAMES=3
WORKDIR /repo

COPY webapp/requirements-hybrid.txt webapp/requirements-hybrid.txt
RUN pip install --no-cache-dir -r webapp/requirements-hybrid.txt

COPY data data
COPY decks/pool decks/pool
COPY submission submission
COPY webapp/server webapp/server
COPY --from=sdk /repo/data/cg data/cg
COPY --from=sdk /repo/data/EN_Card_Data.csv data/EN_Card_Data.csv
COPY --from=sdk /repo/submission/cg submission/cg
COPY --from=sdk /repo/submission/EN_Card_Data.csv submission/EN_Card_Data.csv
COPY --from=sdk /repo/submission/data/EN_Card_Data.csv submission/data/EN_Card_Data.csv

# Render sets PORT itself; locally it is 8000.
EXPOSE 8000
CMD ["python", "-X", "utf8", "webapp/server/app.py"]
