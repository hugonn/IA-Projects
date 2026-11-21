"""Cliente da Instagram Graph API oficial.

Encapsula:
    * Autenticação por token (com ``appsecret_proof`` opcional).
    * Resolução de @username -> Instagram Business Account ID via Business
      Discovery (o único caminho oficial para inspecionar contas de terceiros).
    * Tratamento robusto de erros e **rate limiting** (retry com backoff
      exponencial em 429/5xx, respeitando o header/cabeçalho quando presente).

Nota de escopo (importante):
    A Graph API só permite consultar dados de contas *profissionais públicas*
    via Business Discovery, e insights detalhados (impressões, alcance, etc.)
    apenas da SUA própria conta. Isso está refletido nos métodos abaixo.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Final

import httpx

from .config import Settings, get_settings

# Campos públicos disponíveis via Business Discovery para qualquer conta
# profissional (não exige que o dono autorize seu app).
#
# IMPORTANTE: estes seletores contêm chaves literais da sintaxe de field
# expansion da Graph API ({campo1,campo2,...}). Por isso NUNCA use str.format()
# sobre eles — apenas concatenação/f-string interpolando o username, senão o
# Python trata "{username,name,...}" como placeholder e levanta KeyError.
_PROFILE_FIELDS: Final[str] = (
    "{username,name,biography,website,followers_count,"
    "follows_count,media_count,profile_picture_url}"
)
_MEDIA_FIELDS: Final[str] = (
    "{id,caption,media_type,media_product_type,like_count,"
    "comments_count,timestamp,permalink}"
)

# Códigos de erro da Graph API que indicam esgotamento de cota / throttling.
_RATE_LIMIT_ERROR_CODES: Final[frozenset[int]] = frozenset({4, 17, 32, 613})


class GraphAPIError(RuntimeError):
    """Erro de negócio/protocolo retornado pela Graph API.

    Attributes:
        message: Mensagem legível para o usuário final.
        code:    Código de erro numérico da Graph API (quando disponível).
        is_rate_limit: True se o erro decorre de limite de requisições.
    """

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        is_rate_limit: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.is_rate_limit = is_rate_limit


class GraphClient:
    """Wrapper síncrono e resiliente sobre a Instagram Graph API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = httpx.Client(
            base_url=self._settings.graph_base_url,
            timeout=self._settings.http_timeout_seconds,
        )

    # ------------------------------------------------------------------ #
    # Ciclo de vida
    # ------------------------------------------------------------------ #
    def close(self) -> None:
        """Fecha o pool de conexões HTTP subjacente."""
        self._client.close()

    def __enter__(self) -> "GraphClient":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------ #
    # Infraestrutura de requisição
    # ------------------------------------------------------------------ #
    def _base_params(self) -> dict[str, str]:
        """Parâmetros de autenticação comuns a toda requisição."""
        params: dict[str, str] = {"access_token": self._settings.ig_access_token}

        # appsecret_proof aumenta a segurança das chamadas (recomendado pelo Meta).
        if self._settings.ig_app_secret:
            proof = hmac.new(
                key=self._settings.ig_app_secret.encode("utf-8"),
                msg=self._settings.ig_access_token.encode("utf-8"),
                digestmod=hashlib.sha256,
            ).hexdigest()
            params["appsecret_proof"] = proof
        return params

    def _request(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        """Executa um GET com retry/backoff exponencial para erros transitórios.

        Levanta ``GraphAPIError`` em falhas definitivas (incluindo rate limit
        após esgotar as tentativas).
        """
        merged = {**self._base_params(), **params}
        last_error: GraphAPIError | None = None

        for attempt in range(self._settings.http_max_retries + 1):
            try:
                response = self._client.get(path, params=merged)
            except httpx.TimeoutException as exc:
                last_error = GraphAPIError(
                    f"Tempo de resposta excedido ao chamar a Graph API: {exc}"
                )
                self._sleep_backoff(attempt)
                continue
            except httpx.HTTPError as exc:
                # Erro de transporte (DNS, conexão, TLS...). Geralmente transitório.
                last_error = GraphAPIError(f"Falha de conexão com a Graph API: {exc}")
                self._sleep_backoff(attempt)
                continue

            # HTTP 200 -> sucesso.
            if response.status_code == 200:
                return response.json()

            # Trata erros HTTP com base no corpo da resposta da Graph API.
            error = self._parse_error(response)

            # Rate limit ou erro de servidor -> vale a pena tentar de novo.
            if error.is_rate_limit or response.status_code >= 500:
                last_error = error
                self._sleep_backoff(attempt, retry_after=response.headers.get("Retry-After"))
                continue

            # Erro definitivo (400/401/403 de credencial, permissão, etc.).
            raise error

        # Esgotou as tentativas.
        raise last_error or GraphAPIError("Falha desconhecida ao chamar a Graph API.")

    @staticmethod
    def _parse_error(response: httpx.Response) -> GraphAPIError:
        """Converte uma resposta de erro da Graph API em ``GraphAPIError``."""
        try:
            payload = response.json().get("error", {})
        except ValueError:
            payload = {}

        code = payload.get("code")
        message = payload.get("message", f"HTTP {response.status_code} sem detalhes.")
        is_rate_limit = (
            response.status_code == 429
            or (isinstance(code, int) and code in _RATE_LIMIT_ERROR_CODES)
        )
        return GraphAPIError(message, code=code, is_rate_limit=is_rate_limit)

    def _sleep_backoff(self, attempt: int, retry_after: str | None = None) -> None:
        """Aguarda antes da próxima tentativa (backoff exponencial + jitter leve).

        Se a Graph API informar ``Retry-After``, ele é respeitado.
        """
        if retry_after and retry_after.isdigit():
            time.sleep(min(int(retry_after), 60))
            return
        # 1s, 2s, 4s, 8s... limitado a 30s.
        delay = min(2 ** attempt, 30)
        time.sleep(delay)

    # ------------------------------------------------------------------ #
    # Endpoints de alto nível
    # ------------------------------------------------------------------ #
    def get_public_profile(self, username: str) -> dict[str, Any]:
        """Retorna dados públicos de uma conta profissional via Business Discovery.

        Args:
            username: @username SEM o "@".

        Returns:
            Dicionário com os campos públicos (nome, bio, seguidores, etc.).

        Raises:
            GraphAPIError: se a conta não existir, não for profissional/pública,
                ou se as credenciais forem inválidas.
        """
        clean = username.lstrip("@").strip()
        # Só o username é interpolado; os seletores de campo ficam literais.
        fields = f"business_discovery.username({clean})" + _PROFILE_FIELDS
        data = self._request(
            f"/{self._settings.ig_business_account_id}", {"fields": fields}
        )

        discovery = data.get("business_discovery")
        if not discovery:
            raise GraphAPIError(
                f"Não foi possível obter dados públicos de @{clean}. "
                "A conta precisa ser Profissional (Business/Creator) e pública."
            )
        return discovery

    def get_recent_media(self, username: str, limit: int = 25) -> list[dict[str, Any]]:
        """Retorna as mídias públicas recentes de uma conta via Business Discovery.

        Usado para inferir padrões de engajamento e horários. Campos de insights
        aprofundados (impressões/alcance) só existem para a própria conta e não
        são retornados aqui.
        """
        clean = username.lstrip("@").strip()
        # Monta: business_discovery.username(X){media.limit(N){id,caption,...}}
        fields = (
            f"business_discovery.username({clean})"
            + "{media.limit(" + str(int(limit)) + ")" + _MEDIA_FIELDS + "}"
        )
        data = self._request(
            f"/{self._settings.ig_business_account_id}", {"fields": fields}
        )
        discovery = data.get("business_discovery", {})
        media = discovery.get("media", {}).get("data", [])
        if not isinstance(media, list):
            return []
        return media
