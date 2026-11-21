"""Camada analítica / de IA.

Responsável por tudo o que a Instagram Graph API **não** expõe publicamente:
    * Tendências globais de áudio do Reels.
    * Geração de hooks de retenção.
    * Copywriting de funis de DM e otimização de legendas para SEO.

Estratégia de implementação:
    1. Se ``LLM_PROVIDER=anthropic`` estiver configurado, delega a geração de
       texto criativo a um LLM (produção real).
    2. Caso contrário, usa uma **heurística estruturada e determinística**
       ("simulação pronta para produção") baseada nas diretrizes atuais do
       algoritmo — de forma que o servidor funcione sem dependências externas.

Também concentra a análise quantitativa dos horários de publicação a partir
das mídias reais coletadas pela Graph API.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Final

from .config import Settings, get_settings

# --------------------------------------------------------------------------- #
# Constantes de domínio (diretrizes do algoritmo atual)
# --------------------------------------------------------------------------- #

# Gatilhos psicológicos modernos usados na geração de hooks.
_HOOK_TEMPLATES: Final[tuple[tuple[str, str], ...]] = (
    ("Curiosidade/Loop aberto", "O que ninguém te conta sobre {tema} (e muda tudo no {nicho})..."),
    ("Erro/Perda (aversão)", "Pare de cometer este erro em {tema} — está te custando resultado no {nicho}."),
    ("Contraintuitivo", "Todo mundo em {nicho} faz {tema} errado. Faça exatamente o oposto:"),
    ("Prova/Resultado", "Como consegui [resultado] com {tema} em {nicho} sem [obstáculo comum]."),
    ("Urgência/Novidade", "A mudança de {tema} que está redefinindo o {nicho} em {ano} — comece hoje."),
)

# Estruturas de vídeo (formatos) que retêm público no Reels.
_RETENTION_FORMATS: Final[tuple[str, ...]] = (
    "Listicle rápido (\"3 formas de...\"): entrega numerada com corte seco a "
    "cada item para manter o ritmo e a rebobinagem (rewatch).",
    "Antes → Depois com payoff no final: mostra o resultado nos 3s iniciais e "
    "só revela o \"como\" ao longo do vídeo, segurando a retenção até o fim.",
    "POV/Narrativa em 1ª pessoa: encena uma situação específica do nicho, "
    "gerando identificação e alto índice de compartilhamento em DM.",
)

# Áudios em alta — simulação estruturada (a API oficial não expõe trends globais).
# Em produção, esta função pode ser plugada a um provedor de dados de trends.
_SIMULATED_TRENDING_AUDIO: Final[tuple[dict[str, str], ...]] = (
    {"faixa": "Áudio original acelerado (sped-up)", "crescimento": "alto", "uso": "transições e reveal"},
    {"faixa": "Batida lo-fi/ambiente", "crescimento": "médio-alto", "uso": "vídeos de bastidores e rotina"},
    {"faixa": "Trend de diálogo/áudio de filme", "crescimento": "explosivo", "uso": "POV e humor de nicho"},
)


class AnalyticsEngine:
    """Motor de análise e geração de conteúdo estratégico."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    # ------------------------------------------------------------------ #
    # 0) Métricas de engajamento (dados reais)
    # ------------------------------------------------------------------ #
    def metricas_perfil(
        self, perfil: dict[str, Any], media: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Calcula métricas de crescimento/engajamento a partir de dados reais.

        Returns:
            Dicionário com seguidores, taxa de engajamento (%), engajamento médio
            por post, frequência semanal de publicação e o benchmark textual.
        """
        seguidores = int(perfil.get("followers_count", 0))
        seguindo = int(perfil.get("follows_count", 0))
        posts_total = int(perfil.get("media_count", 0))

        engajamentos = [
            int(m.get("like_count", 0)) + int(m.get("comments_count", 0))
            for m in media
        ]
        media_engaj = round(sum(engajamentos) / len(engajamentos), 1) if engajamentos else 0.0
        taxa = round(media_engaj / seguidores * 100, 2) if seguidores else 0.0

        return {
            "seguidores": seguidores,
            "seguindo": seguindo,
            "posts_total": posts_total,
            "engajamento_medio": media_engaj,
            "taxa_engajamento": taxa,
            "benchmark": self._benchmark_engajamento(taxa),
            "frequencia_semanal": self._frequencia_semanal(media),
            "ratio_seguidores": round(seguidores / seguindo, 1) if seguindo else None,
        }

    @staticmethod
    def _benchmark_engajamento(taxa: float) -> str:
        """Classifica a taxa de engajamento segundo faixas usuais do Instagram."""
        if taxa <= 0:
            return "sem dados"
        if taxa < 1:
            return "abaixo da média (<1%)"
        if taxa < 3:
            return "na média (1–3%)"
        if taxa < 6:
            return "bom (3–6%)"
        return "excelente (>6%)"

    @staticmethod
    def _frequencia_semanal(media: list[dict[str, Any]]) -> float:
        """Estima quantos posts por semana a conta publica (janela recente)."""
        datas: list[datetime] = []
        for m in media:
            ts = m.get("timestamp")
            if not ts:
                continue
            try:
                datas.append(datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z"))
            except (ValueError, TypeError):
                continue
        if len(datas) < 2:
            return 0.0
        datas.sort()
        dias_span = max((datas[-1] - datas[0]).days, 1)
        return round(len(datas) / (dias_span / 7), 1)

    # ------------------------------------------------------------------ #
    # 1) Análise quantitativa de horários (dados reais da Graph API)
    # ------------------------------------------------------------------ #
    def melhores_blocos_horario(
        self, media: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Identifica os 3 melhores blocos de horário a partir do engajamento.

        Cruza ``timestamp`` de cada mídia com (likes + comentários) e agrega por
        faixa de 3 horas e por dia da semana. Retorna os 3 blocos com maior
        engajamento médio.

        Args:
            media: lista de mídias no formato retornado pela Graph API.

        Returns:
            Lista (até 3) de dicionários com dia, faixa horária e engajamento médio.
        """
        buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
        dias = ("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")

        for item in media:
            ts = item.get("timestamp")
            if not ts:
                continue
            try:
                # Formato ISO 8601 com offset, ex.: 2025-01-30T18:45:12+0000
                dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z")
            except (ValueError, TypeError):
                continue

            engajamento = int(item.get("like_count", 0)) + int(item.get("comments_count", 0))
            bloco = (dt.hour // 3) * 3  # faixas: 0-3, 3-6, ... 21-24
            buckets[(dt.weekday(), bloco)].append(engajamento)

        if not buckets:
            return []

        rankeados = sorted(
            (
                {
                    "dia": dias[dia],
                    "faixa": f"{bloco:02d}h–{bloco + 3:02d}h",
                    "engajamento_medio": round(sum(vals) / len(vals), 1),
                    "amostras": len(vals),
                }
                for (dia, bloco), vals in buckets.items()
            ),
            key=lambda b: b["engajamento_medio"],
            reverse=True,
        )
        return rankeados[:3]

    # ------------------------------------------------------------------ #
    # 2) Geração de hooks de retenção
    # ------------------------------------------------------------------ #
    def gerar_hooks(self, tema: str, nicho: str) -> list[dict[str, str]]:
        """Gera 5 hooks de retenção para os 3 primeiros segundos do Reels."""
        if self._settings.llm_configured:
            gerado = self._hooks_via_llm(tema, nicho)
            if gerado:
                return gerado
        # Fallback determinístico baseado em gatilhos psicológicos.
        ano = datetime.now(timezone.utc).year  # sempre o ano corrente
        return [
            {"gatilho": gatilho, "hook": template.format(tema=tema, nicho=nicho, ano=ano)}
            for gatilho, template in _HOOK_TEMPLATES
        ]

    # ------------------------------------------------------------------ #
    # 3) Tendências e áudios (simulação estruturada)
    # ------------------------------------------------------------------ #
    def trends_e_formatos(self) -> dict[str, Any]:
        """Retorna áudios em alta e formatos de retenção do momento."""
        return {
            "audios": list(_SIMULATED_TRENDING_AUDIO),
            "formatos": list(_RETENTION_FORMATS),
            "gerado_em": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        }

    # ------------------------------------------------------------------ #
    # 4) Otimização de legenda para SEO
    # ------------------------------------------------------------------ #
    def otimizar_legenda(
        self, rascunho: str, palavras_chave: list[str]
    ) -> dict[str, str]:
        """Reescreve a legenda integrando SEO + CTA e sugere Alt Text."""
        if self._settings.llm_configured:
            gerado = self._legenda_via_llm(rascunho, palavras_chave)
            if gerado:
                return gerado
        return self._legenda_heuristica(rascunho, palavras_chave)

    # ------------------------------------------------------------------ #
    # Implementações heurísticas (fallback local)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _legenda_heuristica(rascunho: str, palavras_chave: list[str]) -> dict[str, str]:
        chaves = [k.strip() for k in palavras_chave if k.strip()]
        principal = chaves[0] if chaves else "seu tema principal"

        # Primeira linha (gancho) carrega a palavra-chave principal para SEO.
        primeira_linha = (
            f"{principal.capitalize()}: {rascunho.strip().rstrip('.')}."
            if rascunho.strip()
            else f"Tudo sobre {principal}."
        )
        secundarias = ", ".join(chaves[1:4]) if len(chaves) > 1 else ""
        corpo_seo = (
            f"\n\nNeste conteúdo você aprende sobre {secundarias}."
            if secundarias
            else ""
        )
        cta = (
            "\n\n💬 Comente \"EU QUERO\" para receber mais e SALVE este post "
            "para não perder. Marque alguém que precisa ver isso."
        )
        alt_text = (
            f"Imagem sobre {principal}"
            + (f", abordando {secundarias}" if secundarias else "")
            + "."
        )
        return {
            "legenda_otimizada": primeira_linha + corpo_seo + cta,
            "alt_text": alt_text[:100],  # boa prática: alt text curto e objetivo
        }

    # ------------------------------------------------------------------ #
    # Integração opcional com LLM (Anthropic) — produção
    # ------------------------------------------------------------------ #
    def _call_llm(self, system: str, user: str) -> str | None:
        """Chama o LLM configurado. Retorna None em qualquer falha (fail-safe)."""
        try:
            import anthropic  # import tardio: dependência opcional
        except ImportError:
            return None
        try:
            client = anthropic.Anthropic(api_key=self._settings.anthropic_api_key)
            resp = client.messages.create(
                model=self._settings.anthropic_model,
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            parts = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
            return "\n".join(parts).strip() or None
        except Exception:
            # Nunca deixa a falha do LLM derrubar a tool — cai para a heurística.
            return None

    def _hooks_via_llm(self, tema: str, nicho: str) -> list[dict[str, str]] | None:
        texto = self._call_llm(
            system=(
                "Você é um especialista em retenção de Reels no Instagram. "
                "Gere hooks para os 3 primeiros segundos usando gatilhos "
                "psicológicos. Responda em linhas no formato 'Gatilho: hook'."
            ),
            user=f"Tema: {tema}. Nicho: {nicho}. Gere 5 hooks.",
        )
        if not texto:
            return None
        hooks: list[dict[str, str]] = []
        for linha in texto.splitlines():
            if ":" in linha:
                gatilho, hook = linha.split(":", 1)
                hooks.append({"gatilho": gatilho.strip("-• ").strip(), "hook": hook.strip()})
        return hooks or None

    def _legenda_via_llm(
        self, rascunho: str, palavras_chave: list[str]
    ) -> dict[str, str] | None:
        texto = self._call_llm(
            system=(
                "Você é um redator de SEO para Instagram. Reescreva a legenda "
                "integrando as palavras-chave de forma natural, com uma CTA de "
                "salvamento/comentário. Ao final, adicione uma linha 'ALT: ...' "
                "com o alt text (máx. 100 caracteres)."
            ),
            user=f"Rascunho: {rascunho}\nPalavras-chave: {', '.join(palavras_chave)}",
        )
        if not texto:
            return None
        legenda, alt = texto, ""
        if "ALT:" in texto:
            legenda, _, alt = texto.partition("ALT:")
        return {
            "legenda_otimizada": legenda.strip(),
            "alt_text": alt.strip()[:100] or self._legenda_heuristica(rascunho, palavras_chave)["alt_text"],
        }
