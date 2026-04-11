# ─── ULTRA SYSTEM — NLP transformers sidecar (B8) ───────────
# FastAPI wrapper around HF transformers with lazy LRU model
# loading. Only the most recently used MAX_MODELS models stay
# in RAM; older ones are evicted to keep peak under ~1GB on a
# 16GB host.
#
# Called from ultra-engine via src/nlp.js for high-score articles.
import asyncio
import logging
import os
import time
from collections import OrderedDict
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ultra_nlp")

# torch CPU defaults — single thread keeps RAM predictable
torch.set_num_threads(int(os.getenv("TORCH_THREADS", "2")))

MAX_MODELS = int(os.getenv("NLP_MAX_MODELS", "2"))

# Model registry. Keys are short ids exposed via the API; values are
# (loader_fn, hf_model_id) so that loaders can be heterogeneous
# (transformers.pipeline vs sentence_transformers).
MODELS: dict[str, dict] = {
    "classify":  {"hf": "valhalla/distilbart-mnli-12-3",                   "kind": "zero-shot"},
    "summarize": {"hf": "sshleifer/distilbart-cnn-12-6",                   "kind": "summarization"},
    "sentiment": {"hf": "cardiffnlp/twitter-xlm-roberta-base-sentiment",   "kind": "sentiment"},
    "embed":     {"hf": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "kind": "sentence"},
    "translate": {"hf": "Helsinki-NLP/opus-mt-mul-en",                     "kind": "translation"},
}

# LRU cache: most-recently-used at the end. Each entry is the loaded
# pipeline / SentenceTransformer instance.
_loaded: "OrderedDict[str, object]" = OrderedDict()
_load_lock = asyncio.Lock()


def _do_load(name: str):
    cfg = MODELS[name]
    hf_id = cfg["hf"]
    kind = cfg["kind"]
    log.info("loading %s (%s, kind=%s)", name, hf_id, kind)
    t0 = time.time()
    if kind == "sentence":
        from sentence_transformers import SentenceTransformer
        obj = SentenceTransformer(hf_id, cache_folder="/models")
    elif kind == "zero-shot":
        from transformers import pipeline
        obj = pipeline("zero-shot-classification", model=hf_id, device=-1)
    elif kind == "summarization":
        from transformers import pipeline
        obj = pipeline("summarization", model=hf_id, device=-1)
    elif kind == "sentiment":
        from transformers import pipeline
        obj = pipeline("sentiment-analysis", model=hf_id, device=-1, top_k=None)
    elif kind == "translation":
        from transformers import pipeline
        obj = pipeline("translation", model=hf_id, device=-1)
    else:
        raise ValueError(f"unknown kind {kind}")
    log.info("loaded %s in %.1fs", name, time.time() - t0)
    return obj


async def get_model(name: str):
    if name not in MODELS:
        raise HTTPException(status_code=404, detail=f"unknown model {name}")
    async with _load_lock:
        if name in _loaded:
            _loaded.move_to_end(name)
            return _loaded[name]
        # Run blocking model load on a thread to keep the event loop
        # responsive (the first load can take 10-30s).
        obj = await asyncio.to_thread(_do_load, name)
        _loaded[name] = obj
        # Evict the LRU until we're back under the cap.
        while len(_loaded) > MAX_MODELS:
            evicted, _ = _loaded.popitem(last=False)
            log.info("evicted %s from cache", evicted)
        return obj


app = FastAPI(title="ultra-nlp", version="1.0.0")


@app.get("/health")
def health():
    return {
        "ok": True,
        "available": list(MODELS.keys()),
        "loaded": list(_loaded.keys()),
        "max_models": MAX_MODELS,
    }


# ──────────────── classify ────────────────
class ClassifyReq(BaseModel):
    text: str = Field(..., max_length=20000)
    labels: list[str] = Field(..., min_length=2, max_length=20)
    multi_label: bool = False


@app.post("/classify")
async def classify(req: ClassifyReq):
    pipe = await get_model("classify")
    out = await asyncio.to_thread(
        pipe, req.text[:4000], candidate_labels=req.labels, multi_label=req.multi_label
    )
    return {
        "labels": out["labels"],
        "scores": [float(s) for s in out["scores"]],
    }


# ──────────────── summarize ────────────────
class SummarizeReq(BaseModel):
    text: str = Field(..., max_length=20000)
    max_length: int = 130
    min_length: int = 30


@app.post("/summarize")
async def summarize(req: SummarizeReq):
    pipe = await get_model("summarize")
    out = await asyncio.to_thread(
        pipe,
        req.text[:4000],
        max_length=req.max_length,
        min_length=req.min_length,
        do_sample=False,
        truncation=True,
    )
    return {"summary": out[0]["summary_text"]}


# ──────────────── sentiment ────────────────
class SentimentReq(BaseModel):
    text: str = Field(..., max_length=5000)


@app.post("/sentiment")
async def sentiment(req: SentimentReq):
    pipe = await get_model("sentiment")
    out = await asyncio.to_thread(pipe, req.text[:1500], truncation=True)
    # top_k=None returns list of dicts per input. Pick the top score.
    scores = out[0] if isinstance(out, list) and isinstance(out[0], list) else out
    if isinstance(scores, list):
        top = max(scores, key=lambda s: s["score"])
    else:
        top = scores
    return {
        "label": top["label"],
        "score": float(top["score"]),
        "all": [{"label": s["label"], "score": float(s["score"])} for s in (scores if isinstance(scores, list) else [scores])],
    }


# ──────────────── embed ────────────────
class EmbedReq(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=64)


@app.post("/embed")
async def embed(req: EmbedReq):
    model = await get_model("embed")
    truncated = [t[:2000] for t in req.texts]
    vecs = await asyncio.to_thread(model.encode, truncated, normalize_embeddings=True)
    return {"vectors": [v.tolist() for v in vecs], "dim": int(vecs.shape[1])}


# ──────────────── translate ────────────────
class TranslateReq(BaseModel):
    text: str = Field(..., max_length=5000)
    src_lang: Optional[str] = None  # ignored — opus-mt-mul-en auto-detects


@app.post("/translate")
async def translate(req: TranslateReq):
    pipe = await get_model("translate")
    out = await asyncio.to_thread(pipe, req.text[:1500], max_length=512, truncation=True)
    return {"translation": out[0]["translation_text"]}
