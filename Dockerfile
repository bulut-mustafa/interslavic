# One container for the whole translator: the Stanza parser (Python), the
# engine and API (Node), and the built web page, served from one address.
#
# The dictionary is NOT copied in: it is fetched from its public source while
# the image builds, and never served as a file (see docs/dictionary-provenance.md).
FROM node:23-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The app runs as the base image's own unprivileged user, node (uid 1000).
WORKDIR /app

# ---- parser: the exact versions the test suite was run against ----
ENV STANZA_RESOURCES_DIR=/opt/stanza
# Debian's pip 23 rejects the PyTorch index's typing_extensions wheel (its
# metadata spells the name differently), so pip is upgraded first.
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/venv/bin/pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
 && /opt/venv/bin/pip install --no-cache-dir stanza==1.15.0 fastapi==0.143.3 "uvicorn[standard]==0.54.0" \
 && /opt/venv/bin/python -c "import stanza; [stanza.download(l, processors='tokenize,pos,lemma,depparse', verbose=False) for l in ('en','ru')]" \
 && chmod -R a+rX /opt/stanza

# ---- engine and web ----
COPY . .
RUN npm ci --ignore-scripts \
 && npm run lexicon:fetch \
 && npm run web:build \
 && chown -R node /app

USER node
ENV HOST=0.0.0.0 PORT=7860 STATIC_DIR=/app/packages/web/dist
EXPOSE 7860
CMD ["sh", "deploy/start.sh"]
