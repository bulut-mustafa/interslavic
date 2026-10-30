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

import re

import simplemma

# A Ukrainian infinitive ends in -ти or (archaic, still listed) -чи; a reflexive
# one adds -ся (-сь is the short form, never the dictionary form).
_INFINITIVE = ("ти", "чи")
_REFLEXIVE = ("ся", "сь")
# The past tense is the l-participle: -в (masculine), -ла, -ло, -ли.
_PAST = ("ла", "ло", "ли", "в")
_CHECKED = {"NOUN", "VERB", "AUX", "ADJ", "ADV", "PROPN"}
# The synthetic future is the infinitive plus -му, -меш, -ме, -мемо, -мете,
# -муть, a reflexive adding -ся/-сь (-ться after -ме): "запізнюватимусь",
# "запізнюватиметься" (Wiktionary's conjugation of запізнюватися).
_SYNTHETIC_FUTURE = re.compile(r"^(.*ти)(му|меш|ме|мемо|мете|муть)(ся|сь|ться)?$")
# The forms of the demonstrative "той" (Wiktionary's declension table), which
# the parser lemmatises as themselves - "та" then matched the conjunction "та"
# ("and"): "Моя іспанська вже не та" came out "... ne jest a".
_TOJ = {"той", "те", "теє", "та", "тая", "ті", "тії", "того", "тієї", "тої", "теї",
        "тих", "тому", "тій", "тим", "ту", "тую", "тім"}


def _is_lemma(word: str) -> bool:
    """A word simplemma knows and that is its own lemma ("римлян" is a form)."""
    if simplemma.is_known(word, lang="uk") and simplemma.lemmatize(word, lang="uk").lower() == word.lower():
        return True
    # A reflexive verb is often listed by its stem ("митися" under "мити").
    return word.endswith("ся") and _is_lemma(word[:-2])


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
    future = _SYNTHETIC_FUTURE.match(word) if upos in ("VERB", "AUX") else None
    if future:
        found.append(future.group(1) + ("ся" if future.group(3) else ""))
    if upos in ("VERB", "AUX") and "Tense=Past" in feats:
        for ending in _PAST:
            if stem.endswith(ending):
                found.append(stem[: -len(ending)] + "ти" + suffix)
                break
    return found


# A passive participle's suffix, and the infinitive endings it may come from:
# Ukrainian builds the passive participle with -н-, -ен- (-єн-) or -т- on the
# verb stem (написати > написаний, бачити > бачений, взяти > взятий;
# urok.osvita.ua / naurok.com.ua, "Творення пасивних дієприкметників"), and
# -ува- verbs show -ова- (збудувати > збудований).
_PARTICIPLE = (
    ("ований", ("увати", "овати")),
    ("єний", ("їти", "іти")),
    ("ений", ("ити", "іти")),
    ("аний", ("ати",)),
    ("яний", ("яти",)),
    ("тий", ("ти",)),
)
# Before -ен- a stem consonant alternates (робити > роблений, носити >
# ношений); each alternant with the consonants it may come from.
_ALTERNATION = (("бл", "б"), ("пл", "п"), ("вл", "в"), ("мл", "м"), ("фл", "ф"),
                ("жд", "д"), ("щ", "ст"), ("ж", "з"), ("ж", "д"), ("ж", "г"),
                ("ч", "т"), ("ч", "к"), ("ш", "с"), ("ш", "х"))


def participle_verb(lemma: str) -> str | None:
    """The infinitive an adjectival passive participle is built on, if simplemma lists it."""
    word = lemma.lower()
    for suffix, endings in _PARTICIPLE:
        if not word.endswith(suffix):
            continue
        stem = word[: -len(suffix)]
        stems = [stem] + [stem[: -len(a)] + b for a, b in _ALTERNATION if stem.endswith(a)]
        for st in stems:
            for ending in endings:
                if _is_lemma(st + ending):
                    return st + ending
        return None
    return None


def check_lemma(form: str, lemma: str, upos: str, feats: str, lang: str) -> str:
    """The lemma to use: Stanza's, unless it is not a real lemma of its kind."""
    if lang == "uk" and upos in ("DET", "PRON") and form.lower() in _TOJ and "PronType=Dem" in (feats or ""):
        return "той"
    if lang != "uk" or upos not in _CHECKED or not lemma:
        return lemma
    # The Ukrainian parser gives a passive participle an adjective lemma
    # ("наділений"), which the dictionary does not list; the Russian parser
    # gives the verb ("наделить"), from which the Interslavic participle is
    # built. The verb is used, where it is a real one.
    if upos == "ADJ" and "VerbForm=Part" in (feats or "") and "Voice=Pass" in (feats or ""):
        verb = participle_verb(lemma) or participle_verb(simplemma.lemmatize(form.lower(), lang="uk"))
        if verb:
            return verb
    # A verb form the tables list belongs to the infinitive they give, even
    # where the model's guess is another real verb: "бреше" -> "брати" (to
    # take) for "брехати" (to lie), and "Том бреше" was "Tom bere". Only an
    # infinitive counts, so a homograph the tables give to another word
    # ("живу" -> "живий", "може") keeps the model's verb; on the fixtures this
    # changes nothing else.
    if upos in ("VERB", "AUX") and simplemma.is_known(form.lower(), lang="uk"):
        listed = simplemma.lemmatize(form.lower(), lang="uk")
        if listed != lemma.lower() and _is_lemma(listed) and _fits(upos, listed):
            return listed
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
