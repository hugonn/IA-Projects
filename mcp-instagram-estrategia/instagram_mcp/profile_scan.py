"""Varredura (scan) de perfil para inferência de nicho e temas.

Faz uma leitura dos dados públicos reais do perfil (bio + posts recentes via
Graph API) e infere, de forma estruturada:
    * nicho    -> rótulo curto do segmento (ex.: "saúde e lifestyle")
    * temas    -> palavras-chave mais recorrentes no conteúdo
    * hashtags -> hashtags mais usadas
    * formato_dominante -> tipo de mídia que a conta mais publica
    * melhores_temas    -> temas dos posts que MAIS engajaram (dados reais)

Essa camada permite que as ferramentas de estratégia (hooks, legendas, trends,
funil de DM) fiquem **alinhadas ao que o perfil realmente publica**, em vez de
genéricas. Se um LLM estiver configurado, o rótulo do nicho é refinado por IA;
caso contrário, usa-se uma heurística determinística.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Final

from .config import Settings, get_settings

# Stopwords em português (+ ruído típico de legendas) para não poluir os temas.
_STOPWORDS: Final[frozenset[str]] = frozenset(
    """
    a o e de da do das dos em no na nos nas um uma uns umas que se por para com
    como mais mas ao aos à às pelo pela pelos pelas sem sob sobre entre até desde
    eu tu ele ela nos vos eles elas voce você vocês meu minha seu sua seus suas
    nosso nossa este esta esse essa isso isto aquele aquela ser estar tem ter foi
    são está estão vai vou quando onde qual quais quem porque então assim agora
    aqui ali hoje ja já não sim muito pouco todo toda todos todas cada ne né pra
    pro dia dias vida gente coisa coisas fazer feito bem melhor sempre nunca
    link bio comenta comente salva salve salvar compartilha compartilhe segue
    siga marca marque perfil post reels story stories foto video vídeo
    vamos bora então entao vem tá está agora cara pessoal galera olha vlw
    quero quer fica ficar deixa deixar sobre nova novo super mega toda todo
    """.split()
)

# Mapeia o tipo de mídia da API para um rótulo amigável de formato.
_FORMATO_LABEL: Final[dict[str, str]] = {
    "REELS": "Reels",
    "VIDEO": "Vídeo",
    "CAROUSEL_ALBUM": "Carrossel",
    "IMAGE": "Imagem única",
    "FEED": "Feed",
}

_HASHTAG_RE: Final[re.Pattern[str]] = re.compile(r"#(\w+)", re.UNICODE)
_WORD_RE: Final[re.Pattern[str]] = re.compile(r"[a-zà-ÿ]{4,}", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class PerfilContexto:
    """Resultado estruturado da varredura de um perfil."""

    username: str
    nicho: str
    temas: list[str] = field(default_factory=list)
    hashtags: list[str] = field(default_factory=list)
    formato_dominante: str = "—"
    melhores_temas: list[str] = field(default_factory=list)
    posts_analisados: int = 0

    @property
    def tema_principal(self) -> str:
        """Melhor palpite de tema central para alimentar geração de conteúdo.

        Prioriza o tema recorrente mais forte (``temas``), que reflete o nicho de
        forma mais estável do que a 1ª palavra do post campeão (``melhores_temas``,
        às vezes ruidosa, ex.: "primeira", "segredo").
        """
        if self.temas:
            return self.temas[0]
        if self.melhores_temas:
            return self.melhores_temas[0]
        return self.nicho


class ProfileScanner:
    """Executa a varredura de um perfil e infere seu contexto estratégico."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def escanear(
        self, perfil: dict[str, Any], media: list[dict[str, Any]]
    ) -> PerfilContexto:
        """Infere o contexto do perfil a partir dos dados já coletados na API.

        Args:
            perfil: dados de get_public_profile (name, biography, ...).
            media:  lista de mídias recentes (caption, media_type, engajamento).

        Returns:
            PerfilContexto com nicho, temas, hashtags e formato dominante.
        """
        username = perfil.get("username", "") or ""
        bio = perfil.get("biography", "") or ""

        legendas = [m.get("caption", "") or "" for m in media]
        corpus = " ".join([bio, *legendas])

        temas = self._top_palavras(corpus, limite=8)
        hashtags = self._top_hashtags(corpus, limite=8)
        formato = self._formato_dominante(media)
        melhores = self._temas_dos_melhores_posts(media)
        nicho = self._inferir_nicho(bio, temas, hashtags)

        return PerfilContexto(
            username=username,
            nicho=nicho,
            temas=temas,
            hashtags=hashtags,
            formato_dominante=formato,
            melhores_temas=melhores,
            posts_analisados=len(media),
        )

    # ------------------------------------------------------------------ #
    # Heurísticas de extração
    # ------------------------------------------------------------------ #
    @staticmethod
    def _tokenizar(texto: str) -> list[str]:
        """Extrai palavras significativas (min. 4 letras), sem stopwords."""
        palavras = _WORD_RE.findall(texto.lower())
        return [p for p in palavras if p not in _STOPWORDS]

    def _top_palavras(self, corpus: str, *, limite: int) -> list[str]:
        contagem = Counter(self._tokenizar(corpus))
        return [palavra for palavra, _ in contagem.most_common(limite)]

    @staticmethod
    def _top_hashtags(corpus: str, *, limite: int) -> list[str]:
        tags = [t.lower() for t in _HASHTAG_RE.findall(corpus)]
        contagem = Counter(tags)
        return [f"#{tag}" for tag, _ in contagem.most_common(limite)]

    @staticmethod
    def _formato_dominante(media: list[dict[str, Any]]) -> str:
        """Descobre qual formato de mídia a conta mais publica."""
        tipos: Counter[str] = Counter()
        for m in media:
            # media_product_type distingue REELS/FEED; media_type é o fallback.
            bruto = (m.get("media_product_type") or m.get("media_type") or "").upper()
            if bruto:
                tipos[bruto] += 1
        if not tipos:
            return "—"
        dominante, _ = tipos.most_common(1)[0]
        return _FORMATO_LABEL.get(dominante, dominante.title())

    def _temas_dos_melhores_posts(self, media: list[dict[str, Any]]) -> list[str]:
        """Extrai temas dos 3 posts de maior engajamento (dados reais)."""
        def engajamento(m: dict[str, Any]) -> int:
            return int(m.get("like_count", 0)) + int(m.get("comments_count", 0))

        top = sorted(media, key=engajamento, reverse=True)[:3]
        temas: list[str] = []
        for m in top:
            palavras = self._tokenizar(m.get("caption", "") or "")
            if palavras:
                # Usa a palavra mais "forte" (primeira significativa) como tema.
                temas.append(palavras[0])
        # Remove duplicatas preservando a ordem.
        return list(dict.fromkeys(temas))

    def _inferir_nicho(
        self, bio: str, temas: list[str], hashtags: list[str]
    ) -> str:
        """Deduz um rótulo curto de nicho (via LLM se disponível; senão heurística)."""
        if self._settings.llm_configured:
            rotulo = self._nicho_via_llm(bio, temas, hashtags)
            if rotulo:
                return rotulo
        # Heurística: combina os 2–3 sinais mais fortes num rótulo legível.
        sinais = temas[:3] or [h.lstrip("#") for h in hashtags[:3]]
        if not sinais:
            return "nicho não identificado (poucos dados públicos)"
        return " / ".join(sinais)

    def _nicho_via_llm(
        self, bio: str, temas: list[str], hashtags: list[str]
    ) -> str | None:
        """Refina o rótulo do nicho usando o LLM configurado (opcional)."""
        try:
            import anthropic
        except ImportError:
            return None
        try:
            client = anthropic.Anthropic(api_key=self._settings.anthropic_api_key)
            resp = client.messages.create(
                model=self._settings.anthropic_model,
                max_tokens=60,
                system=(
                    "Você classifica perfis do Instagram. Responda APENAS com um "
                    "rótulo curto de nicho (2 a 4 palavras), sem pontuação extra."
                ),
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Bio: {bio}\nTemas: {', '.join(temas)}\n"
                            f"Hashtags: {', '.join(hashtags)}\nQual o nicho?"
                        ),
                    }
                ],
            )
            partes = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
            return " ".join(partes).strip().strip(".") or None
        except Exception:
            return None
