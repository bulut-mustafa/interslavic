#!/bin/sh
# Publish the current commit to a Hugging Face Space (Docker).
#
#   sh deploy/huggingface.sh <your-hf-username>/<space-name>
#
# Copies only files tracked by git - so the dictionary, which is not
# redistributed, never enters the Space repository; the image fetches it while
# building. Git asks for your Hugging Face username and an access token with
# "write" permission when it pushes.
set -e
SPACE="$1"
if [ -z "$SPACE" ]; then
  echo "usage: sh deploy/huggingface.sh <username>/<space-name>" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone "https://huggingface.co/spaces/$SPACE" "$WORK/space"
cd "$ROOT"
# Replace the Space's files with this commit's tracked files.
find "$WORK/space" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git ls-files -z | xargs -0 -I{} sh -c 'mkdir -p "$1/$(dirname "$2")" && cp "$2" "$1/$2"' _ "$WORK/space" {}

# The Space's README needs this header; the project README follows it.
{
  printf -- '---\ntitle: Interslavic Translator\nemoji: 🗣️\ncolorFrom: green\ncolorTo: blue\nsdk: docker\napp_port: 7860\npinned: false\n---\n\n'
  cat README.md
} > "$WORK/space/README.md"

cd "$WORK/space"
git add -A
git commit -q -m "Deploy $(cd "$ROOT" && git rev-parse --short HEAD)" || { echo "nothing changed"; exit 0; }
git push
echo "Pushed. The Space builds itself; follow it at https://huggingface.co/spaces/$SPACE"
