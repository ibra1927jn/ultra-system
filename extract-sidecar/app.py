# ─── ULTRA SYSTEM — HTML article extractor sidecar ──────────
# Trafilatura-based fallback for sites where rss-parser cannot
# extract content (SPAs, JS-rendered, broken RSS, etc).
#
# Called from ultra-engine optionally, NOT in the happy path.
# rss.js continues using its existing rss-parser + puppeteer
# fallback chain. This sidecar adds a third option: "give me
# the URL and I'll extract the article cleanly".
import logging
from typing import Optional

import httpx
import trafilatura
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ultra_extract")

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
TIMEOUT = httpx.Timeout(20.0, connect=8.0)

app = FastAPI(title="ultra-extract", version="1.0.0")


class ExtractReq(BaseModel):
    url: str = Field(..., max_length=2000)
    include_links: bool = False
    include_images: bool = False
    target_language: Optional[str] = None  # ISO 639-1 hint


@app.get("/health")
def health():
    return {"ok": True, "trafilatura": trafilatura.__version__}


@app.post("/extract")
async def extract(req: ExtractReq):
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url must be http(s)")
    try:
        async with httpx.AsyncClient(headers={"User-Agent": UA}, timeout=TIMEOUT, follow_redirects=True) as client:
            r = await client.get(req.url)
            r.raise_for_status()
            html = r.text
            final_url = str(r.url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"fetch_error: {e}")

    # trafilatura.extract returns the article text. metadata=True
    # returns a python dict with title/author/date/sitename/etc.
    meta = trafilatura.extract_metadata(html)
    text = trafilatura.extract(
        html,
        include_links=req.include_links,
        include_images=req.include_images,
        target_language=req.target_language,
        favor_recall=True,
    )

    if not text and not (meta and getattr(meta, "title", None)):
        raise HTTPException(status_code=422, detail="no article content extracted")

    return {
        "url": final_url,
        "title": getattr(meta, "title", None) if meta else None,
        "author": getattr(meta, "author", None) if meta else None,
        "date": getattr(meta, "date", None) if meta else None,
        "sitename": getattr(meta, "sitename", None) if meta else None,
        "language": getattr(meta, "language", None) if meta else None,
        "categories": getattr(meta, "categories", None) if meta else None,
        "tags": getattr(meta, "tags", None) if meta else None,
        "text": text,
        "text_length": len(text) if text else 0,
    }
