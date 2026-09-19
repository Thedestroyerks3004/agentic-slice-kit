"""Pre-flight: is the key set, does the model answer, is the content frozen and consistent?"""
from __future__ import annotations

import httpx

from . import config, content


def run() -> int:
    cfg, bad = config.load(), 0
    print(f"mode        {'live' if cfg.live else 'STUB (no OPENAI_API_KEY set)'}   model {cfg.model}")
    for t in content.topics():
        try:
            p = content.load_pool(t)
            print(f"content     {t}: {len(p.usable())} usable questions, graph hash matches")
        except Exception as e:
            bad += 1
            print(f"content     {t}: PROBLEM {e}")
    if cfg.live:
        try:
            r = httpx.post(f"{cfg.base_url}/chat/completions", timeout=30,
                           headers={"Authorization": f"Bearer {cfg.api_key}"},
                           json={"model": cfg.model, "max_tokens": 5,
                                 "messages": [{"role": "user", "content": "Say ok"}]})
            msg = {200: "key works", 401: "key rejected (401)", 429: "rate-limited or out of quota (429)"}.get(
                r.status_code, f"HTTP {r.status_code}: {r.text[:120]}")
            bad += r.status_code != 200
            print(f"api         {msg}")
        except httpx.RequestError as e:
            bad += 1
            print(f"api         unreachable ({e})")
    return 1 if bad else 0
