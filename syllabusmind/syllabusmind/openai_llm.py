"""OpenAI adapter with the same signature as slice.llm.complete, so any flow
takes `call=` and does not care about the provider.

Token discipline: small output ceiling, temperature 0, JSON mode, ONE repair
pass, budget checked before every request. Errors map to the spine's classes so
runner.advance handles them unchanged.
"""
from __future__ import annotations

import json
from typing import Any, Type

import httpx
from pydantic import BaseModel, ValidationError

from slice.llm import CapExhausted, ModelError, SchemaFailure, Truncated

from . import config


def _post(cfg, body, timeout):
    try:
        r = httpx.post(f"{cfg.base_url}/chat/completions", json=body, timeout=timeout,
                       headers={"Authorization": f"Bearer {cfg.api_key}"})
    except httpx.RequestError as e:
        raise ModelError(f"unreachable ({e}); run `python -m syllabusmind doctor`") from e
    if r.status_code == 401:
        raise ModelError("401: the API key was rejected")
    if r.status_code == 429 and "quota" in r.text.lower():
        raise CapExhausted("quota exhausted on this key")
    if r.status_code != 200:
        raise ModelError(f"HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def _parse(text: str, schema):
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("```")[1].removeprefix("json").strip()
    try:
        return schema.model_validate_json(t)
    except (ValidationError, ValueError):
        return None


def complete(*, settings, budget, messages: list[dict], schema: Type[BaseModel] | None = None,
             model: str | None = None, step: str = "call", timeout: float = 60.0) -> Any:
    cfg = config.load()
    budget.check_tokens()
    body = {"model": model or cfg.model, "temperature": 0, "messages": messages,
            "max_completion_tokens" if cfg.model.startswith(("o", "gpt-5")) else "max_tokens": cfg.max_out}
    body.pop("temperature") if cfg.model.startswith(("o1", "o3", "gpt-5")) else None
    if schema is not None:
        body["response_format"] = {"type": "json_object"}
        body["messages"] = messages + [{"role": "system", "content":
            "Reply with one JSON object matching: " + json.dumps(schema.model_json_schema()["properties"])[:900]}]
    data = _post(cfg, body, timeout)
    budget.record_tokens((data.get("usage") or {}).get("total_tokens", 0))
    ch = data["choices"][0]
    text = ch["message"]["content"] or ""
    if ch.get("finish_reason") == "length":
        raise Truncated(f"cut off at {cfg.max_out} tokens: raise SYLLABUS_MAX_OUT or ask for less")
    if schema is None:
        return text
    got = _parse(text, schema)
    if got is not None:
        return got
    budget.check_tokens()
    fix = body["messages"] + [{"role": "assistant", "content": text[:1200]},
                              {"role": "user", "content": "Invalid against the schema. Reply with corrected JSON only."}]
    data = _post(cfg, {**body, "messages": fix}, timeout)
    budget.record_tokens((data.get("usage") or {}).get("total_tokens", 0))
    got = _parse(data["choices"][0]["message"]["content"] or "", schema)
    if got is None:
        raise SchemaFailure(f"{step}: no valid {schema.__name__} after one repair pass")
    return got
