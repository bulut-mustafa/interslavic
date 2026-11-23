"""
Freeze parses for the sentences in pairs.json that have none yet, with the
parser service's own pipeline (to_conllu), so the scorer reads the same parse
the live service would give.

    PYTHONPATH=services/parser/src services/parser/.venv/bin/python \
        packages/eval/scripts/freeze-tatoeba-parses.py [--into <dir>] ru_en uk

With --into, the parses go to <dir>/<key>/ and every sentence is parsed again,
whatever is already there: a fresh measurement with the live pipeline, to be
scored with `score-tatoeba.ts --parses <dir>`.

An existing file is never overwritten. One language at a time is loaded, so the
memory stays small.
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "packages/eval/data/tatoeba"
PARSER_LANG = {"en": "en", "ru": "ru", "ru_en": "ru", "uk": "uk"}


def main() -> None:
    from parser_service.to_conllu import to_conllu

    args = sys.argv[1:]
    into = pathlib.Path(args[args.index("--into") + 1]) if "--into" in args else None
    keys = [a for i, a in enumerate(args) if a != "--into" and (i == 0 or args[i - 1] != "--into")]
    pairs = json.loads((DATA / "pairs.json").read_text(encoding="utf-8"))
    for key in keys:
        folder = (into or DATA) / key
        folder.mkdir(parents=True, exist_ok=True)
        made = 0
        for p in pairs[key]:
            target = folder / f"{p['id']}.conllu"
            if target.exists():
                continue
            target.write_text(to_conllu(p["source"], PARSER_LANG[key]), encoding="utf-8")
            made += 1
        print(key, made, "parses written,", len(pairs[key]) - made, "already there")


if __name__ == "__main__":
    main()
