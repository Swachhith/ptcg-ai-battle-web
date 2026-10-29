#!/usr/bin/env bash
# Launch the PTCG AI Battle web app at http://localhost:8000
set -e
cd "$(dirname "$0")"
export PYTHONUTF8=1
[ -f ../data/cg/api.py ] || python3 -X utf8 ../setup/fetch_kaggle_data.py
if [ ! -f web/dist/index.html ]; then
  (cd web && { [ -d node_modules ] || npm install; } && npm run build)
fi
exec python3 -X utf8 server/app.py
