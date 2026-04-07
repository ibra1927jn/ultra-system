# ─── ULTRA SYSTEM — spaCy NER microservice ──────────────────
# FastAPI wrapper. Loads en + es small models on startup.
# Endpoints:
#   GET  /health      → {ok, models}
#   POST /ner         → {entities: [{text,label,start,end}], lang}
#
# Called from ultra-engine via src/spacy.js. Stateless.
import logging
from typing import Optional

import spacy
from fastapi import FastAPI
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("spacy_ner")

MODELS: dict[str, "spacy.language.Language"] = {}


def _load():
    for code, name in (("en", "en_core_web_sm"), ("es", "es_core_news_sm")):
        log.info("loading %s (%s)", code, name)
        MODELS[code] = spacy.load(name, disable=["lemmatizer"])
    log.info("models ready: %s", list(MODELS.keys()))


_load()

app = FastAPI(title="ultra-spacy-ner", version="1.0.0")


class NerRequest(BaseModel):
    text: str = Field(..., max_length=20000)
    lang: Optional[str] = "en"


@app.get("/health")
def health():
    return {"ok": True, "models": list(MODELS.keys())}


@app.post("/ner")
def ner(req: NerRequest):
    nlp = MODELS.get((req.lang or "en").lower()) or MODELS["en"]
    doc = nlp(req.text[:10000])
    ents = [
        {"text": e.text, "label": e.label_, "start": e.start_char, "end": e.end_char}
        for e in doc.ents
    ]
    return {"entities": ents, "lang": req.lang, "count": len(ents)}
