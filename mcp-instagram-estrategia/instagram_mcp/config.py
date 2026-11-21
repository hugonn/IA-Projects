"""Carregamento e validação tipada das configurações de ambiente.

Todas as variáveis são lidas de um arquivo ``.env`` (ver ``.env.example``) e
expostas por meio de um objeto ``Settings`` imutável. Assim, o restante do
código nunca acessa ``os.environ`` diretamente — o que facilita testes,
mocks e a garantia de tipagem estática.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

# Carrega o .env por caminho ABSOLUTO (raiz do projeto, ao lado de server.py),
# independente do diretório de trabalho — essencial quando o servidor é iniciado
# pelo Claude Desktop, cujo cwd não é a pasta do projeto. ``override=False``
# mantém a prioridade de variáveis já definidas no ambiente do SO.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=_PROJECT_ROOT / ".env", override=False)

LLMProvider = Literal["anthropic", "none"]


def _get_str(name: str, default: str = "") -> str:
    """Lê uma variável de ambiente como string, com valor padrão."""
    return os.getenv(name, default).strip()


def _get_int(name: str, default: int) -> int:
    """Lê uma variável de ambiente como inteiro, tolerando valores inválidos."""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


@dataclass(frozen=True, slots=True)
class Settings:
    """Configuração imutável do servidor, montada a partir do ambiente."""

    # --- Instagram Graph API ---
    ig_access_token: str
    ig_business_account_id: str
    ig_app_secret: str
    graph_api_version: str

    # --- Camada de IA / analítica ---
    llm_provider: LLMProvider
    anthropic_api_key: str
    anthropic_model: str

    # --- Resiliência HTTP ---
    http_timeout_seconds: int
    http_max_retries: int

    # Campos derivados (não vêm diretamente do ambiente).
    graph_base_url: str = field(init=False)

    def __post_init__(self) -> None:
        # ``object.__setattr__`` é necessário porque o dataclass é frozen.
        object.__setattr__(
            self,
            "graph_base_url",
            f"https://graph.facebook.com/{self.graph_api_version}",
        )

    @property
    def graph_api_configured(self) -> bool:
        """Indica se há credenciais suficientes para chamar a Graph API."""
        return bool(self.ig_access_token and self.ig_business_account_id)

    @property
    def llm_configured(self) -> bool:
        """Indica se a camada de LLM externa está utilizável."""
        return self.llm_provider == "anthropic" and bool(self.anthropic_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retorna a configuração única do processo (memoizada).

    A memoização garante que o ``.env`` seja lido apenas uma vez e que todos
    os módulos compartilhem a mesma instância de configuração.
    """
    provider_raw = _get_str("LLM_PROVIDER", "none").lower()
    provider: LLMProvider = "anthropic" if provider_raw == "anthropic" else "none"

    return Settings(
        ig_access_token=_get_str("IG_ACCESS_TOKEN"),
        ig_business_account_id=_get_str("IG_BUSINESS_ACCOUNT_ID"),
        ig_app_secret=_get_str("IG_APP_SECRET"),
        graph_api_version=_get_str("IG_GRAPH_API_VERSION", "v25.0"),
        llm_provider=provider,
        anthropic_api_key=_get_str("ANTHROPIC_API_KEY"),
        anthropic_model=_get_str("ANTHROPIC_MODEL", "claude-opus-4-8"),
        http_timeout_seconds=_get_int("HTTP_TIMEOUT_SECONDS", 30),
        http_max_retries=_get_int("HTTP_MAX_RETRIES", 4),
    )
