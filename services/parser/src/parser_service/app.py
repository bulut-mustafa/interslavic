"""
Universal Dependencies parsing service for the Interslavic translator.

Deliberately thin: it tokenizes, lemmatizes, tags and dependency-parses, and
nothing else. Every translation decision lives in the TypeScript engine, so this
process stays swappable and the interesting logic stays in one testable place.

The wire format mirrors the engine's `UdToken` exactly, so no translation layer
is needed on either side.
"""

from __future__ import annotations

import logging
from typing import Literal

import stanza
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.getLogger("stanza").setLevel(logging.WARNING)

Lang = Literal["en", "ru", "uk", "pl", "sh"]

PROCESSORS = "tokenize,pos,lemma,depparse"

app = FastAPI(
    title="Interslavic parser",
    version="0.1.0",
    description="UD parsing only. All transfer logic lives in the TS engine.",
)

# Pipelines are expensive to build, so they are created once on first use and
# then reused. A cold request therefore takes several seconds.
_pipelines: dict[str, stanza.Pipeline] = {}


def pipeline(lang: str) -> stanza.Pipeline:
    if lang not in _pipelines:
        try:
            _pipelines[lang] = stanza.Pipeline(
                lang=lang,
                processors=PROCESSORS,
                download_method=None,  # fail loudly rather than download at request time
                verbose=False,
            )
        except Exception as exc:  # noqa: BLE001 - surface the real cause to the caller
            raise HTTPException(
                status_code=503,
                detail=(
                    f"could not load the {lang} model: {exc}. "
                    f"Run: python -m stanza.download {lang}"
                ),
            ) from exc
    return _pipelines[lang]


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    lang: Lang


class Token(BaseModel):
    id: int
    form: str
    lemma: str
    upos: str
    xpos: str = ""
    feats: dict[str, str] = Field(default_factory=dict)
    head: int
    deprel: str


class Sentence(BaseModel):
    text: str
    lang: Lang
    tokens: list[Token]


class ParseResponse(BaseModel):
    sentences: list[Sentence]


def parse_feats(raw: str | None) -> dict[str, str]:
    """Turn a CoNLL-U FEATS string into a dict; "_" and None mean no features."""
    if not raw or raw == "_":
        return {}
    out: dict[str, str] = {}
    for item in raw.split("|"):
        key, _, value = item.partition("=")
        if key and value:
            out[key] = value
    return out


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "loaded": sorted(_pipelines)}


SENTENCE_FINAL = ".!?…"


def with_terminator(text: str) -> tuple[str, bool]:
    """
    Stanza's Russian model mis-tokenises a sentence that does not end in
    punctuation: it splits the final vowel off as its own token, because `у`,
    `а`, `и` and `о` are words in their own right.

        "Я читаю книгу"   ->  Я  читаю  книг  у     (`у` tagged ADP)
        "Я читаю книгу."  ->  Я  читаю  книгу  .

    English is unaffected, but the fix is applied to both: a period is appended
    for parsing and the synthetic token is dropped from the result, so the
    caller sees exactly the sentence it sent. Without this, anyone typing
    Russian without a full stop got garbage.
    """
    stripped = text.rstrip()
    if stripped and stripped[-1] in SENTENCE_FINAL:
        return text, False
    return stripped + ".", True


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest) -> ParseResponse:
    text, added_terminator = with_terminator(req.text)
    doc = pipeline(req.lang)(text)

    sentences: list[Sentence] = []
    for sent in doc.sentences:
        tokens: list[Token] = []
        for word in sent.words:
            tokens.append(
                Token(
                    id=int(word.id),
                    form=word.text,
                    # Stanza can leave the lemma unset; fall back to the surface
                    # form so the engine always has something to look up.
                    lemma=word.lemma or word.text,
                    upos=word.upos or "X",
                    xpos=word.xpos or "",
                    feats=parse_feats(word.feats),
                    # The root's head is 0 in CoNLL-U, which Stanza preserves.
                    head=int(word.head),
                    deprel=word.deprel or "dep",
                )
            )
        if added_terminator and tokens and tokens[-1].upos == "PUNCT":
            # Drop the terminator we added, so the caller gets its own sentence
            # back. Anything depending on it (the engine carries sentence-final
            # punctuation over to the output) then behaves as before.
            tokens.pop()
        sentences.append(
            Sentence(
                text=sent.text[:-1] if added_terminator else sent.text,
                lang=req.lang,
                tokens=tokens,
            )
        )

    return ParseResponse(sentences=sentences)
