#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ "$1" = "ui" ]; then
  echo "🚀 Starting Clipper Web Studio at http://127.0.0.1:5050 ..."
  ./.venv/bin/python app.py
else
  ./.venv/bin/python cli.py "$@"
fi
