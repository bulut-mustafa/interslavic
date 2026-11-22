#!/bin/sh
# Start the parser on the container's loopback, then the engine in front of
# it. The engine answers 503 with a clear message until the parser is up.
set -e
cd /app

# Tester reports: a persistent volume if the host gives one (/data, a Cloud
# Storage bucket on Cloud Run), otherwise a scratch file that is lost when the
# container restarts.
if [ -z "$FEEDBACK_FILE" ]; then
  if [ -d /data ] && [ -w /data ]; then FEEDBACK_FILE=/data/feedback.jsonl; else FEEDBACK_FILE=/tmp/feedback.jsonl; fi
fi
export FEEDBACK_FILE

# The engine is the container's main process, so the host never notices if
# the parser dies; restart it here instead of leaving every request a 503.
(
  while true; do
    PYTHONPATH=/app/services/parser/src /opt/venv/bin/uvicorn parser_service.app:app --host 127.0.0.1 --port 8765 \
      || echo "parser exited with status $?, restarting" >&2
    sleep 2
  done
) &

# Wait for the parser and load the language models BEFORE the engine opens its
# port. Cloud Run gives a container full (boosted) CPU only until the port
# opens; afterwards an idle container is throttled, and a parser that was still
# starting then needed 3 to 7 minutes (logs, 2026-11-22). The engine opens the
# public port only when this is done, and Cloud Run holds the first visitor's
# request until then, so a cold start is a wait rather than a "translator is
# not answering" error. `timeout` keeps this under the 240 s startup probe, and
# `|| echo` means a stuck parser never stops the container.
timeout 120 /opt/venv/bin/python - <<'EOF' || echo "parser warm-up did not finish; the engine starts anyway" >&2
import json, time, urllib.request
for _ in range(180):
    try:
        urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=2)
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit('parser did not start')
for lang, text in (('en', 'Hello.'), ('ru', 'Привет.'), ('uk', 'Привіт.')):
    request = urllib.request.Request('http://127.0.0.1:8765/parse',
        data=json.dumps({'text': text, 'lang': lang}).encode(),
        headers={'content-type': 'application/json'})
    urllib.request.urlopen(request, timeout=120)
EOF

exec node --experimental-strip-types packages/server/src/main.ts
