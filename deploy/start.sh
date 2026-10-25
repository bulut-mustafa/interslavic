#!/bin/sh
# Start the parser on the container's loopback, then the engine in front of
# it. The engine answers 503 with a clear message until the parser is up.
set -e
cd /app

# Tester reports: a persistent volume if the host gives one (/data on Hugging
# Face Spaces with persistent storage), otherwise a scratch file that is lost
# when the container restarts.
if [ -z "$FEEDBACK_FILE" ]; then
  if [ -d /data ] && [ -w /data ]; then FEEDBACK_FILE=/data/feedback.jsonl; else FEEDBACK_FILE=/tmp/feedback.jsonl; fi
fi
export FEEDBACK_FILE

PYTHONPATH=/app/services/parser/src /opt/venv/bin/uvicorn parser_service.app:app --host 127.0.0.1 --port 8765 &
exec node --experimental-strip-types packages/server/src/main.ts
