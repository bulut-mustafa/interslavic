"""Trial: other Stanza Ukrainian package combinations (iu, parlamint). Scratch-quality script kept so the 2026-11-23 result can be repeated.
   PYTHONPATH not needed; run from the repo root: services/parser/.venv/bin/python -I <this file> <out dir> <variant>...
"""
import sys, json, pathlib, gc
sys.path.insert(0, 'services/parser/src')
import stanza
import parser_service.app as app
import parser_service.to_conllu as tc
ROOT = pathlib.Path('.')
pairs = json.loads((ROOT/'packages/eval/data/tatoeba/pairs.json').read_text(encoding='utf-8'))['uk']
OUT = pathlib.Path(sys.argv[1])
D = {'tokenize': 'iu_nocharlm', 'mwt': 'iu', 'lemma': 'iu_nocharlm', 'pos': 'iu_charlm', 'depparse': 'iu_charlm'}
VARIANTS = {
  'default-control': dict(D),
  'parlamint-all': {'tokenize': 'parlamint_charlm', 'mwt': 'iu', 'lemma': 'parlamint_charlm', 'pos': 'parlamint_charlm', 'depparse': 'parlamint_charlm'},
  'iu+parlamint-lemma': {**D, 'lemma': 'parlamint_charlm'},
  'parlamint-pos+lemma': {**D, 'lemma': 'parlamint_charlm', 'pos': 'parlamint_charlm'},
}
for name in sys.argv[2:]:
    procs = VARIANTS[name]
    app.build_pipeline = lambda lang, p=procs: stanza.Pipeline(lang='uk', processors=p, package=None, download_method=None, verbose=False)
    tc._pipeline.cache_clear()
    folder = OUT / name / 'uk'; folder.mkdir(parents=True, exist_ok=True)
    for p in pairs:
        (folder / f"{p['id']}.conllu").write_text(tc.to_conllu(p['source'], 'uk'), encoding='utf-8')
    tc._pipeline.cache_clear(); gc.collect()
    print(name, len(pairs), 'parsed', flush=True)
