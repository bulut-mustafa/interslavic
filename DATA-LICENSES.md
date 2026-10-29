# Third-party data and its terms

The code is MIT (see `LICENSE`). The material below is **not** the project's
own and is **not** covered by that license; it keeps its original terms.

## The Interslavic dictionary - not included

The vocabulary comes from the Medžuslovjansky slovnik
([interslavic-dictionary.com](https://interslavic-dictionary.com/)), maintained by
Sergey Cherebedov and contributors, originating in Jan van Steenbergen's work.

**No dictionary data is in this repository.** The wordlist and the table derived
from it (`packages/rules/data/preposition-government.json`) are fetched and
generated at build time by `npm run lexicon:fetch`, and gitignored. Its terms are
not stated explicitly and trace to CC BY-NC-ND material, so a build of this
project that includes it is for **non-commercial use with attribution**. Details:
[docs/dictionary-provenance.md](docs/dictionary-provenance.md).

## Jan van Steenbergen's texts and grammar - CC BY-NC-ND 3.0

From [steen.free.fr/interslavic](http://steen.free.fr/interslavic), © Jan van
Steenbergen, [CC BY-NC-ND 3.0](https://creativecommons.org/licenses/by-nc-nd/3.0/):

- `packages/eval/data/gold-steenbergen.json` - unmodified sentence pairs from his
  grammar pages and parallel texts, each with its source page;
- the English sentences of those pairs in `packages/engine/test/fixtures/parse/gold/`
  (the `# text` lines; the parse annotations are generated);
- short quotations from his grammar pages in
  `packages/rules/data/rule-registry.json`, in code comments and in the lessons,
  each cited.

Shared unmodified, non-commercially, with attribution, as that license allows.

## Tatoeba sentences - CC BY 2.0 FR

Sentences from [Tatoeba](https://tatoeba.org) in the test fixtures, lessons and
phrasebook, each with its sentence ID,
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/).

## Ukrainian texts

The Ukrainian fixtures (`packages/engine/test/fixtures/parse/uk/`, sources per
sentence in its `SOURCES.md`) quote Tatoeba (above), Article 1 of the Universal
Declaration of Human Rights in the Ukrainian text of the Unicode UDHR project,
and short passages of Ivan Ohienko's Bible translation (Gen 11, Mt 6).

## Libraries

[`@interslavic/morphology`](https://www.npmjs.com/package/@interslavic/morphology)
and [`@interslavic/utils`](https://www.npmjs.com/package/@interslavic/utils) (MIT),
[Stanza](https://stanfordnlp.github.io/stanza/) (Apache 2.0) and its models,
[simplemma](https://github.com/adbar/simplemma) (MIT code; its Ukrainian
form-to-lemma tables are under ODbL and CC BY 4.0, see its `licenses` folder),
which the parser service uses to check Ukrainian lemmas at run time, and the
npm and Python packages listed in `package.json` and `services/parser`, each under
its own license.
