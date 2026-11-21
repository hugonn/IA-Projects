"""Carregamento e validação tipada das configurações de ambiente.

Como este MVP não usa a Instagram Graph API, a única configuração é a camada
opcional de LLM (Anthropic). Sem ela, o servidor funciona 100% offline com a
heurística interna.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

# Carrega o .env por caminho absoluto (raiz do projeto), independente do
# diretório de trabalho. ``override=False`` mantém a prioridade do ambiente.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=_PROJECT_ROOT / ".env", override=False)

LLMProvider = Literal["anthropic", "none"]


def _get_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True, slots=True)
class Settings:
    """Configuração imutável do servidor."""

    llm_provider: LLMProvider
    anthropic_api_key: str
    anthropic_model: str

    @property
    def llm_configured(self) -> bool:
        """Indica se a camada de LLM externa está utilizável."""
        return self.llm_provider == "anthropic" and bool(self.anthropic_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna a configuração única do processo (memoizada)."""
    provider_raw = _get_str("LLM_PROVIDER", "none").lower()
    provider: LLMProvider = "anthropic" if provider_raw == "anthropic" else "none"
    return Settings(
        llm_provider=provider,
        anthropic_api_key=_get_str("ANTHROPIC_API_KEY"),
        anthropic_model=_get_str("ANTHROPIC_MODEL", "claude-opus-4-8"),
    )
