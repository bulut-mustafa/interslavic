"""
Freeze parses for the sentences in pairs.json that have none yet, with the
parser service's own pipeline (to_conllu), so the scorer reads the same parse
the live service would give.

    PYTHONPATH=services/parser/src services/parser/.venv/bin/python \
        packages/eval/scripts/freeze-tatoeba-parses.py ru_en uk

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

    pairs = json.loads((DATA / "pairs.json").read_text(encoding="utf-8"))
    for key in sys.argv[1:]:
        folder = DATA / key
        folder.mkdir(exist_ok=True)
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
