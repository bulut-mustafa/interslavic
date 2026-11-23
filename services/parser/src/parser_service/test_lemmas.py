"""
Checks of the Ukrainian lemma repair (lemmas.py), runnable without a test
framework:  npm run parser:test

Each case is a lemma Stanza's Ukrainian model was seen to produce on the
fixtures, with the lemma the dictionary needs.
"""

from __future__ import annotations

from .lemmas import check_lemma

CASES = [
    # form, Stanza's lemma, upos, feats, expected
    ("мию", "мияти", "VERB", "", "мити"),
    ("вірю", "вірти", "VERB", "", "вірити"),
    ("Відчини", "відчити", "VERB", "", "відчинити"),
    ("правах", "правох", "NOUN", "", "право"),
    ("дзеркалі", "дзеркаль", "NOUN", "", "дзеркало"),
    ("тривала", "тривалий", "VERB", "Tense=Past", "тривати"),
    ("римлянами", "римлян", "NOUN", "", "римлянин"),
    ("Ізраїлі", "Ізраїлі", "PROPN", "", "Ізраїль"),
    # A passive participle gets its verb.
    ("наділені", "наділений", "ADJ", "VerbForm=Part|Voice=Pass", "наділити"),
    ("зроблений", "зроблений", "ADJ", "VerbForm=Part|Voice=Pass", "зробити"),
    # The synthetic future, reflexive too, is its infinitive.
    ("запізнюватимусь", "запізнюватимусь", "VERB", "Tense=Fut", "запізнюватися"),
    ("читатиму", "читатиму", "VERB", "Tense=Fut", "читати"),
    # A form of the demonstrative "той".
    ("та", "та", "DET", "PronType=Dem", "той"),
    ("тим", "тим", "PRON", "PronType=Dem", "той"),
    # A listed verb form takes its own infinitive over another real verb.
    ("бреше", "брати", "VERB", "", "брехати"),
    # A real lemma is kept.
    ("книгу", "книга", "NOUN", "", "книга"),
    ("брати", "брат", "NOUN", "", "брат"),
    ("зустрілися", "зустрітися", "VERB", "Tense=Past", "зустрітися"),
    ("живу", "жити", "VERB", "", "жити"),
    ("може", "могти", "VERB", "", "могти"),
    # A lemma the dictionary lacks is replaced by one it has (lemmas.dictionary_repair).
    ("п'яна", "п’янути", "VERB", "", "п'яний"),
    ("полийте", "полийти", "VERB", "", "полити"),
]


def main() -> None:
    failures = []
    for form, lemma, upos, feats, want in CASES:
        got = check_lemma(form, lemma, upos, feats, "uk")
        if got != want:
            failures.append(f"{form}: {lemma} -> {got}, expected {want}")
    # A bare clitic must not crash the request (simplemma raises on "").
    for upos in ("VERB", "NOUN"):
        check_lemma("ся", "ся", upos, "", "uk")
    # Russian: only an invented verb lemma is replaced, by the listed infinitive.
    for form, lemma, upos, feats, want in [
        ("цветы", "цветы", "NOUN", "", "цветок"),  # the dictionary lacks "цветы"
        ("осы", "осы", "NOUN", "", "оса"),
        ("ребёнку", "рекенок", "NOUN", "", "ребенок"),
        ("Удали", "удать", "VERB", "Mood=Imp", "удалить"),  # an imperative
        ("Опусти", "опусти", "VERB", "Mood=Imp", "опустить"),
        ("лжёт", "листить", "VERB", "", "лгать"),
        ("шёл", "ийти", "VERB", "", "идти"),
        ("читаю", "читать", "VERB", "", "читать"),  # a real lemma is kept
        ("стекло", "стечь", "VERB", "", "стечь"),  # a real verb is kept, homograph or not
        ("мою", "мой", "DET", "", "мой"),  # only verbs are checked
        ("цветок", "цветок", "NOUN", "", "цветок"),  # a lemma the dictionary has is never changed
    ]:
        if check_lemma(form, lemma, upos, feats, "ru") != want:
            failures.append(f"ru {form}: {lemma} -> {check_lemma(form, lemma, upos, feats, 'ru')}, expected {want}")
    for f in failures:
        print("FAIL", f)
    print(f"{len(CASES) + 11 - len(failures)} / {len(CASES) + 11} passed")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
