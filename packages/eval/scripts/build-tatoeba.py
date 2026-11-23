"""
Build packages/eval/data/tatoeba/pairs.json from the Tatoeba exports.

    python3 -I packages/eval/scripts/build-tatoeba.py <folder>
    python3 -I packages/eval/scripts/build-tatoeba.py --siblings <folder>   # adds ru_en and uk

<folder> holds, unpacked, from https://downloads.tatoeba.org/exports/per_language/:
isv/isv_sentences_detailed.tsv, isv/isv-eng_links.tsv, isv/isv-rus_links.tsv,
eng/eng_sentences.tsv, rus/rus_sentences.tsv.

One entry per source sentence, with EVERY Interslavic translation as a
reference (Cyrillic ones too; the scorer converts them) and its author, so a
human ceiling can compare two different people. Sentences already used
as engine fixtures are left out, because rules were tuned on them. A sentence
already in pairs.json keeps its split - the old tune half was tuned on - and a
new one gets a split from a hash of its id, so adding data never moves one.
"""

from __future__ import annotations

import glob
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "packages/eval/data/tatoeba/pairs.json"
LANGS = {"en": "eng", "ru": "rus"}


def read_sentences(path: pathlib.Path, wanted: set[str] | None = None) -> dict[str, str]:
    out: dict[str, str] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            sid, _, text = line.rstrip("\n").split("\t", 2)
            if wanted is None or sid in wanted:
                out[sid] = text
    return out


def fixture_texts() -> set[str]:
    texts: set[str] = set()
    for f in glob.glob(str(ROOT / "packages/engine/test/fixtures/parse/**/*.conllu"), recursive=True):
        for line in open(f, encoding="utf-8"):
            if line.startswith("# text = "):
                texts.add(line[9:].strip().lower())
    return texts


def old_splits() -> dict[str, str]:
    """Source sentence id -> split, from a pairs.json of either format."""
    if not OUT.exists():
        return {}
    old = json.loads(OUT.read_text(encoding="utf-8"))
    return {p["id"].split("-")[0]: p["split"] for pairs in old.values() for p in pairs}


def hashed_split(sid: str) -> str:
    return "tune" if hashlib.sha1(sid.encode()).digest()[-1] % 2 == 0 else "held"


def main() -> None:
    folder = pathlib.Path(sys.argv[1])
    isv: dict[str, str] = {}
    author: dict[str, str] = {}
    with (folder / "isv_sentences_detailed.tsv").open(encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            isv[cols[0]], author[cols[0]] = cols[2], cols[3]
    fixtures = fixture_texts()
    kept = old_splits()
    out: dict[str, list[dict[str, object]]] = {}
    for lang, code in LANGS.items():
        refs: dict[str, list[str]] = {}
        for line in open(folder / f"isv-{code}_links.tsv", encoding="utf-8"):
            isv_id, src_id = line.split()
            if isv_id in isv:
                refs.setdefault(src_id, []).append(isv_id)
        source = read_sentences(folder / f"{code}_sentences.tsv", set(refs))
        pairs = []
        for sid in sorted(source, key=int):
            if source[sid].strip().lower() in fixtures:
                continue
            ids = sorted(refs[sid], key=int)
            pairs.append({
                "id": sid,
                "source": source[sid],
                "refs": [isv[r] for r in ids],
                "by": [author[r] for r in ids],
                "split": kept.get(sid) or hashed_split(sid),
            })
        out[lang] = pairs
        print(lang, len(pairs), "sentences,", sum(len(p["refs"]) for p in pairs), "references")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# Russian and Ukrainian sentences that Tatoeba links to an English sentence we
# already have. The Interslavic references were written from the English
# sentence, so these are siblings, not sources: good for comparing languages and
# engine changes, not for reading a score as absolute. Only 17 Ukrainian
# sentences link to Interslavic directly (checked 2026-11-23).
SIBLINGS = {"ru_en": "rus", "uk": "ukr"}


def add_siblings(folder: pathlib.Path) -> None:
    """Add the sibling keys to pairs.json; `en` and `ru` stay exactly as they are,
    so the saved baselines stay valid. A sibling takes the split of its English
    anchor, so one sentence is never tuned in one language and held in another."""
    old = json.loads(OUT.read_text(encoding="utf-8"))
    anchors = {p["id"]: p for p in old["en"]}
    fixtures = fixture_texts()
    direct_ru = {p["id"] for p in old["ru"]}
    isv: dict[str, tuple[str, str]] = {}
    for line in (folder / "isv_sentences_detailed.tsv").open(encoding="utf-8"):
        cols = line.rstrip("\n").split("\t")
        isv[cols[0]] = (cols[2], cols[3])
    for key, code in SIBLINGS.items():
        by_sibling: dict[str, list[str]] = {}
        for line in open(folder / f"eng-{code}_links.tsv", encoding="utf-8"):
            eng_id, sib_id = line.split()
            if eng_id in anchors:
                by_sibling.setdefault(sib_id, []).append(eng_id)
        direct: dict[str, list[str]] = {}
        direct_file = folder / f"isv-{code}_links.tsv"
        if direct_file.exists():
            for line in open(direct_file, encoding="utf-8"):
                isv_id, sib_id = line.split()
                if isv_id in isv:
                    direct.setdefault(sib_id, []).append(isv_id)
        source = read_sentences(folder / f"{code}_sentences.tsv", set(by_sibling) | set(direct))
        pairs = []
        for sid in sorted(source, key=int):
            if source[sid].strip().lower() in fixtures or sid in direct_ru:
                continue
            ids = sorted(by_sibling.get(sid, []), key=int)
            refs: list[str] = []
            by: list[str] = []
            for eng_id in ids:
                for r, a in zip(anchors[eng_id]["refs"], anchors[eng_id]["by"]):
                    if r not in refs:
                        refs.append(r)
                        by.append(a)
            for isv_id in direct.get(sid, []):
                if isv[isv_id][0] not in refs:
                    refs.append(isv[isv_id][0])
                    by.append(isv[isv_id][1])
            if not refs:
                continue
            pairs.append({
                "id": sid,
                "source": source[sid],
                "refs": refs,
                "by": by,
                "split": anchors[ids[0]]["split"] if ids else hashed_split(sid),
                "anchor": ids[0] if ids else None,
            })
        old[key] = pairs
        print(key, len(pairs), "sentences,", sum(1 for p in pairs if p["anchor"]), "with an English anchor")
    OUT.write_text(json.dumps(old, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if "--siblings" in sys.argv:
        add_siblings(pathlib.Path(sys.argv[sys.argv.index("--siblings") + 1]))
    else:
        main()
