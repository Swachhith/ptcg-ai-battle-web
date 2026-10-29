@echo off
rem Launch the PTCG AI Battle web app at http://localhost:8000
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist "..\data\cg\api.py" (
  echo Fetching the competition SDK and card sheet from Kaggle...
  python -X utf8 ..\setup\fetch_kaggle_data.py || goto :eof
)
if not exist "web\dist\index.html" (
  echo Building the frontend...
  pushd web
  if not exist node_modules call npm install
  call npm run build
  popd
)
start "" http://localhost:8000
python -X utf8 server\app.py
