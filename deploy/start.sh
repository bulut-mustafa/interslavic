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

PYTHONPATH=/app/services/parser/src /opt/venv/bin/uvicorn parser_service.app:app --host 127.0.0.1 --port 8765 &

# Load both language models while the engine builds its dictionary index
# (about 22s and 33s on Cloud Run), so they overlap instead of adding up. The
# engine opens the public port only after its index is built, and a host such
# as Cloud Run holds the first visitor's request until then, so a cold start
# is a wait rather than a "translator is not answering" error.
/opt/venv/bin/python - <<'EOF' &
import json, time, urllib.request
for _ in range(180):
    try:
        urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=2)
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit('parser did not start')
for lang, text in (('en', 'Hello.'), ('ru', 'Привет.')):
    request = urllib.request.Request('http://127.0.0.1:8765/parse',
        data=json.dumps({'text': text, 'lang': lang}).encode(),
        headers={'content-type': 'application/json'})
    urllib.request.urlopen(request, timeout=120)
EOF

exec node --experimental-strip-types packages/server/src/main.ts
