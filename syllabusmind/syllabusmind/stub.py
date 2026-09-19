"""Canned model responses: the whole session runs with no key, no network, no tokens.
Same keyword signature as slice.llm.complete."""
from __future__ import annotations

import re
from typing import Any, Type

from pydantic import BaseModel


class Stub:
    def __init__(self, fabricate: bool = False) -> None:
        self.calls: list[str] = []
        self.fabricate = fabricate           # test hook: cite something that was never retrieved

    def __call__(self, *, settings=None, budget=None, messages, schema: Type[BaseModel] | None = None,
                 model: str | None = None, step: str = "call", timeout: float = 60.0) -> Any:
        self.calls.append(step)
        user = messages[-1]["content"]
        if step == "diagnose":
            body = user.split("Passages:" + chr(10))[-1]
            m = re.search(r"\[([^\]]+)\] (.*?)(?=" + chr(10) + r"\[[^\]]+\] |\Z)", body, re.S)
            cite, text = (m.group(1), m.group(2)) if m else ("none#0", "")
            sents = [x.strip() for x in re.split(r"(?<=\.)\s+", text) if len(x.strip()) >= 30 and x.strip().endswith(".")]
            quote = sents[0] if sents else text[:40]
            if self.fabricate:
                cite, quote = "invented.md#9", "a sentence that is nowhere in any passage"
            return schema.model_validate({"statement": "The student holds a mistaken rule about this topic.",
                                          "cite": cite, "quote": quote})
        raise NotImplementedError(f"stub has no canned reply for step {step!r}")
