"""
A dictionary check on Stanza's Ukrainian lemmas.

Stanza's Ukrainian lemmatizer (UD Ukrainian-IU) is a character model, and on
words it has not seen it invents lemmas that are not Ukrainian words: "мию" ->
"мияти", "вірю" -> "вірти", "Відчини" -> "відчити", "правах" -> "правох",
"дзеркалі" -> "дзеркаль". The engine looks every lemma up in the dictionary's
Ukrainian column, so each of these came through untranslated. Russian's model
(SynTagRus) does not do this, which is why Russian never needed the check.

The check uses simplemma's Ukrainian form-to-lemma tables (MIT code; data under
ODbL and CC BY 4.0, see DATA-LICENSES.md). Stanza's lemma is kept whenever it is
a real lemma of the right kind; only an invented one is replaced. Nothing else
in the parse - part of speech, features, tree - is touched.
"""

from __future__ import annotations

import simplemma

# A Ukrainian infinitive ends in -ти or (archaic, still listed) -чи; a reflexive
# one adds -ся (-сь is the short form, never the dictionary form).
_INFINITIVE = ("ти", "чи")
_REFLEXIVE = ("ся", "сь")
# The past tense is the l-participle: -в (masculine), -ла, -ло, -ли.
_PAST = ("ла", "ло", "ли", "в")
_CHECKED = {"NOUN", "VERB", "AUX", "ADJ", "ADV", "PROPN"}


def _is_lemma(word: str) -> bool:
    """A word simplemma knows and that is its own lemma ("римлян" is a form)."""
    if word.endswith("ся"):
        return _is_lemma(word[:-2])
    return simplemma.is_known(word, lang="uk") and simplemma.lemmatize(word, lang="uk").lower() == word.lower()


def _fits(upos: str, lemma: str) -> bool:
    if upos in ("VERB", "AUX"):
        base = lemma[:-2] if lemma.endswith("ся") else lemma
        return base.endswith(_INFINITIVE)
    return True


def _candidates(form: str, upos: str, feats: str) -> list[str]:
    word = form.lower()
    reflexive = upos in ("VERB", "AUX") and word.endswith(_REFLEXIVE)
    stem = word[:-2] if reflexive else word
    suffix = "ся" if reflexive else ""
    found = [simplemma.lemmatize(stem, lang="uk") + suffix]
    if upos in ("VERB", "AUX") and "Tense=Past" in feats:
        for ending in _PAST:
            if stem.endswith(ending):
                found.append(stem[: -len(ending)] + "ти" + suffix)
                break
    return found


def check_lemma(form: str, lemma: str, upos: str, feats: str, lang: str) -> str:
    """The lemma to use: Stanza's, unless it is not a real lemma of its kind."""
    if lang != "uk" or upos not in _CHECKED or not lemma:
        return lemma
    if _is_lemma(lemma.lower()) and _fits(upos, lemma.lower()):
        return lemma
    for candidate in _candidates(form, upos, feats or ""):
        if _is_lemma(candidate) and _fits(upos, candidate):
            # A name keeps its capital ("Ізраїлі" -> "Ізраїль").
            return candidate[:1].upper() + candidate[1:] if form[:1].isupper() and upos == "PROPN" else candidate
    return lemma


def check_words(words, lang: str) -> None:
    """Apply `check_lemma` to Stanza words in place."""
    if lang != "uk":
        return
    for w in words:
        w.lemma = check_lemma(w.text, w.lemma or w.text, w.upos or "X", w.feats or "", lang)
