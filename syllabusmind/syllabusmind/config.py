"""Settings for SyllabusMind. Reads .env through the spine's loader; no other
os.environ reads anywhere."""
from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from slice import config as spine

ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Cfg:
    spine: spine.Settings
    api_key: str
    base_url: str
    model: str
    fallback_model: str
    db: str
    memory_dir: str
    max_out: int                      # output tokens per call: kept small on purpose

    @property
    def live(self) -> bool:
        k = self.api_key
        return bool(k) and not k.startswith("PASTE")


def load() -> Cfg:
    spine.load_env(str(ROOT.parent / ".env"))
    s = spine.settings()
    g = os.environ.get
    model = g("SYLLABUS_MODEL", "gpt-4o-mini").strip()
    return Cfg(
        spine=replace(s, model=model),
        api_key=g("OPENAI_API_KEY", "").strip(),
        base_url=g("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        model=model,
        fallback_model=g("SYLLABUS_FALLBACK_MODEL", model).strip(),
        db=g("SYLLABUS_DB", "run.db"),
        memory_dir=g("SYLLABUS_MEMORY_DIR", "memory"),
        max_out=int(g("SYLLABUS_MAX_OUT", "500")),
    )
