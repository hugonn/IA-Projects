"""Servidor MCP (MVP) — Estratégia genérica para Instagram.

Expõe 8 ferramentas básicas e genéricas, alinhadas às diretrizes do algoritmo
atual do Instagram (DMs e compartilhamentos como alavancas de alcance, SEO em
bio/legenda/alt text e hooks de retenção nos primeiros segundos dos Reels).

Ferramentas de perfil (usam a Instagram Graph API via Business Discovery, para
qualquer conta Profissional pública):
    1. analisar_perfil
    2. mapear_perfil
    3. sugerir_horarios_publicacao
    4. sugerir_melhorias_perfil

Ferramentas de conteúdo (não exigem conta/token):
    5. descobrir_trends_e_musicas
    6. gerar_ganchos_reels
    7. otimizar_legenda_seo
    8. planejar_funil_dm

Execução:
    python server.py            # transporte STDIO (padrão para o Claude Desktop)
"""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from instagram_mcp.analytics import AnalyticsEngine
from instagram_mcp.config import get_settings
from instagram_mcp.graph_client import GraphAPIError, GraphClient
from instagram_mcp.profile_scan import ProfileScanner

app: FastMCP = FastMCP(
    name="instagram-estrategia",
    instructions=(
        "Servidor de estratégia para Instagram. Fornece diagnóstico de perfil, "
        "mapeamento de nicho, melhores horários, auditoria de bio, tendências de "
        "Reels, hooks de retenção, otimização de legenda para SEO e planejamento "
        "de funis de DM. As análises seguem as diretrizes atuais do algoritmo."
    ),
)

_analytics = AnalyticsEngine()
_scanner = ProfileScanner()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _config_incompleta() -> str:
    return (
        "❌ Credenciais da Instagram Graph API não configuradas. Defina "
        "IG_ACCESS_TOKEN e IG_BUSINESS_ACCOUNT_ID no arquivo .env "
        "(consulte o .env.example)."
    )


def _erro_amigavel(exc: GraphAPIError) -> str:
    if exc.is_rate_limit:
        return (
            "⚠️ Limite de requisições da Graph API atingido. Aguarde alguns "
            f"minutos e tente novamente. Detalhe: {exc.message}"
        )
    return f"❌ Erro ao consultar a Graph API: {exc.message}"


def _coletar(username: str) -> tuple[dict[str, Any], list[dict[str, Any]]] | str:
    """Coleta perfil + mídias públicas recentes via Business Discovery."""
    settings = get_settings()
    if not settings.graph_api_configured:
        return _config_incompleta()
    try:
        with GraphClient(settings) as client:
            perfil = client.get_public_profile(username)
            media = client.get_recent_media(username, limit=50)
    except GraphAPIError as exc:
        return _erro_amigavel(exc)
    return perfil, media


def _score_bio(bio: str) -> tuple[int, list[str]]:
    """Pontua legibilidade/clareza da bio (0-100) e gera observações."""
    obs: list[str] = []
    score = 100
    if not bio:
        return 0, ["Bio vazia: perda crítica de SEO e de proposta de valor."]
    if len(bio) > 150:
        score -= 15
        obs.append("Bio longa (>150 caracteres): priorize o essencial.")
    if not any(c in bio for c in "•|/\n"):
        score -= 10
        obs.append("Sem separadores/quebras: baixa escaneabilidade.")
    if not any(cta in bio.lower() for cta in ("link", "clique", "acesse", "👇", "⬇", "dm", "chame")):
        score -= 20
        obs.append("Sem CTA claro: adicione uma chamada para ação (ex.: 'Chame no direct 👇').")
    return max(score, 0), obs


# --------------------------------------------------------------------------- #
# 1) analisar_perfil
# --------------------------------------------------------------------------- #
@app.tool()
def analisar_perfil(username: str) -> str:
    """Diagnostica posicionamento, proposta de valor e legibilidade da bio.

    Coleta dados públicos reais da conta via Instagram Graph API (Business
    Discovery) e produz um diagnóstico estratégico.

    Args:
        username: @username da conta profissional pública a analisar.

    Returns:
        Relatório textual com métricas de posicionamento e clareza da bio.
    """
    settings = get_settings()
    if not settings.graph_api_configured:
        return _config_incompleta()
    try:
        with GraphClient(settings) as client:
            perfil = client.get_public_profile(username)
    except GraphAPIError as exc:
        return _erro_amigavel(exc)

    nome = perfil.get("name", "—")
    bio = perfil.get("biography", "") or ""
    seguidores = int(perfil.get("followers_count", 0))
    seguindo = int(perfil.get("follows_count", 0))
    posts = int(perfil.get("media_count", 0))
    site = perfil.get("website", "") or "—"
    score, observacoes = _score_bio(bio)
    ratio = f"{seguidores / seguindo:.1f}x" if seguindo else "n/d"

    linhas = [
        f"# 📊 Diagnóstico de Perfil — @{username.lstrip('@')}",
        "",
        f"**Nome de exibição:** {nome}",
        f"**Seguidores:** {seguidores:,}  |  **Seguindo:** {seguindo:,}  (proporção {ratio})",
        f"**Publicações:** {posts:,}  |  **Site na bio:** {site}",
        "",
        "## Proposta de valor & posicionamento",
        f"> {bio or '(bio vazia)'}",
        "",
        f"**Clareza/legibilidade da bio:** {score}/100",
    ]
    if observacoes:
        linhas += ["", "### Observações de otimização", *[f"- {o}" for o in observacoes]]
    linhas += [
        "",
        "## Leitura estratégica",
        "- A bio é o principal ativo de **SEO interno**: garanta ao menos 1 "
        "palavra-chave de busca já na 1ª linha.",
        "- Direcione o tráfego da bio para **DM**, que hoje pesa mais para alcance "
        "do que cliques externos.",
    ]
    return "\n".join(linhas)


# --------------------------------------------------------------------------- #
# 2) mapear_perfil
# --------------------------------------------------------------------------- #
@app.tool()
def mapear_perfil(username: str) -> str:
    """Faz a varredura do perfil e descobre nicho, temas e formato dominante.

    Lê a bio e os posts públicos recentes (dados reais da Graph API) e infere o
    contexto estratégico da conta.

    Args:
        username: @username da conta profissional pública a mapear.

    Returns:
        Relatório com nicho inferido, temas recorrentes, hashtags, formato
        dominante e os temas dos posts de maior engajamento.
    """
    dados = _coletar(username)
    if isinstance(dados, str):
        return dados
    perfil, media = dados
    ctx = _scanner.escanear(perfil, media)

    return "\n".join([
        f"# 🔎 Mapeamento de perfil — @{ctx.username or username.lstrip('@')}",
        f"_Baseado em {ctx.posts_analisados} posts recentes + bio._",
        "",
        f"## 🎯 Nicho inferido\n**{ctx.nicho}**",
        "",
        "## Temas recorrentes",
        (", ".join(ctx.temas) if ctx.temas else "_(poucos dados textuais)_"),
        "",
        "## Hashtags mais usadas",
        (" ".join(ctx.hashtags) if ctx.hashtags else "_(nenhuma hashtag detectada)_"),
        "",
        f"## Formato dominante\n{ctx.formato_dominante}",
        "",
        "## Temas que mais engajaram (dados reais)",
        (", ".join(ctx.melhores_temas) if ctx.melhores_temas else "_(sem dados suficientes)_"),
    ])


# --------------------------------------------------------------------------- #
# 3) sugerir_horarios_publicacao
# --------------------------------------------------------------------------- #
@app.tool()
def sugerir_horarios_publicacao(username: str) -> str:
    """Sugere os 3 melhores blocos de horário com base no engajamento histórico.

    Coleta as mídias públicas recentes e cruza o horário de publicação com
    (curtidas + comentários) para identificar os picos.

    Args:
        username: @username da conta profissional pública.

    Returns:
        Relatório com os 3 blocos de horário de maior engajamento.
    """
    dados = _coletar(username)
    if isinstance(dados, str):
        return dados
    _, media = dados
    if not media:
        return (
            f"ℹ️ Não há mídias públicas recentes suficientes em @{username.lstrip('@')} "
            "para inferir horários."
        )
    blocos = _analytics.melhores_blocos_horario(media)
    if not blocos:
        return "ℹ️ Não foi possível extrair horários válidos das mídias coletadas."

    linhas = [
        f"# ⏰ Melhores horários — @{username.lstrip('@')}",
        f"_Baseado em {len(media)} publicações recentes (curtidas + comentários)._",
        "",
    ]
    for i, b in enumerate(blocos, start=1):
        linhas.append(
            f"**{i}º) {b['dia']}, {b['faixa']}** — engajamento médio "
            f"{b['engajamento_medio']:,} ({b['amostras']} amostra(s))"
        )
    linhas += [
        "",
        "> 💡 Publique o **Reel** 15–30 min antes do pico para acumular retenção "
        "inicial e responda comentários/DMs na primeira hora.",
    ]
    return "\n".join(linhas)


# --------------------------------------------------------------------------- #
# 4) sugerir_melhorias_perfil
# --------------------------------------------------------------------------- #
@app.tool()
def sugerir_melhorias_perfil(username: str) -> str:
    """Auditoria de conversão: Bio, CTA e alinhamento de SEO para busca interna.

    Args:
        username: @username da conta profissional pública.

    Returns:
        Checklist priorizado de melhorias de conversão e SEO.
    """
    settings = get_settings()
    if not settings.graph_api_configured:
        return _config_incompleta()
    try:
        with GraphClient(settings) as client:
            perfil = client.get_public_profile(username)
    except GraphAPIError as exc:
        return _erro_amigavel(exc)

    bio = perfil.get("biography", "") or ""
    nome = perfil.get("name", "") or ""
    site = perfil.get("website", "") or ""
    score, observacoes = _score_bio(bio)
    recomendacoes: list[str] = []

    if not nome or nome.lower() == username.lstrip("@").lower():
        recomendacoes.append(
            "**SEO (Nome):** use o campo *Nome* como '[Nome] | [Palavra-chave de busca]'. "
            "Ele é indexado pela busca interna, diferente do @username."
        )
    if not any(cta in bio.lower() for cta in ("dm", "direct", "chame", "👇", "clique", "link")):
        recomendacoes.append(
            "**CTA:** finalize a bio com uma chamada para **DM** (ex.: "
            "'Comente PALAVRA e receba no direct 👇')."
        )
    if not site:
        recomendacoes.append(
            "**Conversão:** adicione um link na bio para capturar quem chega pela busca."
        )
    recomendacoes.append(
        "**SEO (Bio):** inclua 2–3 palavras-chave que seu público pesquisa, "
        "de forma natural na 1ª e 2ª linhas."
    )
    recomendacoes.extend(f"**Legibilidade:** {o}" for o in observacoes)

    linhas = [
        f"# 🛠️ Auditoria de conversão — @{username.lstrip('@')}",
        f"**Score atual da bio:** {score}/100",
        "",
        "## Ações priorizadas",
    ]
    linhas.extend(f"{i}. {r}" for i, r in enumerate(recomendacoes, start=1))
    return "\n".join(linhas)


# --------------------------------------------------------------------------- #
# 5) descobrir_trends_e_musicas
# --------------------------------------------------------------------------- #
@app.tool()
def descobrir_trends_e_musicas() -> str:
    """Sugere áudios em alta e 3 formatos de vídeo que retêm público.

    Returns:
        Relatório com áudios em ascensão e formatos de Reels recomendados.
    """
    dados: dict[str, Any] = _analytics.trends_e_formatos()
    linhas = ["# 🎵 Trends & Áudios em alta (Reels)", "", "## Áudios em ascensão (por velocidade de crescimento)"]
    for a in dados["audios"]:
        linhas.append(f"- **{a['faixa']}** — crescimento *{a['crescimento']}*; ideal para {a['uso']}.")
    linhas += ["", "## Formatos/estruturas que estão retendo público"]
    for i, fmt in enumerate(dados["formatos"], start=1):
        linhas.append(f"{i}. {fmt}")
    linhas += [
        "",
        f"_Atualizado em {dados['gerado_em']}._",
        "> ⚠️ Tendências de áudio não são expostas pela API oficial; esta é uma "
        "camada analítica. Valide na aba **Reels em alta** do app antes de gravar.",
    ]
    return "\n".join(linhas)


# --------------------------------------------------------------------------- #
# 6) gerar_ganchos_reels
# --------------------------------------------------------------------------- #
@app.tool()
def gerar_ganchos_reels(tema: str, nicho: str) -> str:
    """Cria 5 hooks de retenção para os 3 primeiros segundos de um Reel.

    Usa gatilhos psicológicos (curiosidade, aversão à perda, contraintuição,
    prova, urgência) específicos para o nicho, para elevar a taxa de completude.

    Args:
        tema: assunto central do vídeo (ex.: 'organização financeira').
        nicho: nicho/segmento do público (ex.: 'mães empreendedoras').

    Returns:
        Lista de 5 hooks, cada um com o gatilho psicológico correspondente.
    """
    tema, nicho = tema.strip(), nicho.strip()
    if not tema or not nicho:
        return "❌ Informe 'tema' e 'nicho' para gerar os hooks."
    hooks = _analytics.gerar_hooks(tema, nicho)
    linhas = [
        f"# 🪝 5 Hooks de retenção — {tema} ({nicho})",
        "_Fale o hook nos primeiros 3s, com corte seco e legenda na tela._",
        "",
    ]
    for i, h in enumerate(hooks[:5], start=1):
        linhas += [f"**{i}. [{h['gatilho']}]**", f"> {h['hook']}", ""]
    linhas.append(
        "> 💡 Teste 2–3 hooks diferentes para o mesmo conteúdo e mantenha o que "
        "gera mais **rewatch** e **compartilhamento em DM**."
    )
    return "\n".join(linhas)


# --------------------------------------------------------------------------- #
# 7) otimizar_legenda_seo
# --------------------------------------------------------------------------- #
@app.tool()
def otimizar_legenda_seo(texto_rascunho: str, palavras_chave: list[str]) -> str:
    """Reescreve a legenda para SEO orgânico, adiciona CTA e sugere Alt Text.

    Integra as palavras-chave de forma natural (busca interna do Instagram),
    inclui uma CTA de salvamento/comentário e propõe um Alt Text acessível.

    Args:
        texto_rascunho: rascunho original da legenda.
        palavras_chave: lista de palavras-chave-alvo para SEO.

    Returns:
        Legenda otimizada + Alt Text sugerido.
    """
    if not texto_rascunho.strip():
        return "❌ Forneça um 'texto_rascunho' para otimizar."
    chaves = [k for k in (palavras_chave or []) if k.strip()]
    if not chaves:
        return "❌ Forneça ao menos uma palavra-chave em 'palavras_chave'."
    resultado = _analytics.otimizar_legenda(texto_rascunho, chaves)
    return "\n".join([
        "# ✍️ Legenda otimizada para SEO",
        f"_Palavras-chave usadas: {', '.join(chaves)}_",
        "",
        "## Legenda",
        resultado["legenda_otimizada"],
        "",
        "## Alt Text sugerido (acessibilidade + algoritmo)",
        f"> {resultado['alt_text']}",
        "",
        "> 💡 A CTA prioriza **salvamento** e **comentário** — sinais que hoje "
        "pesam mais que a curtida.",
    ])


# --------------------------------------------------------------------------- #
# 8) planejar_funil_dm
# --------------------------------------------------------------------------- #
@app.tool()
def planejar_funil_dm(objetivo_campanha: str) -> str:
    """Desenha um funil de automação de DM (estilo ManyChat) para conversão.

    Define a palavra-chave de gatilho no comentário e a sequência de mensagens
    que o usuário recebe na DM até a conversão.

    Args:
        objetivo_campanha: meta da campanha (ex.: 'vender ebook', 'captar leads').

    Returns:
        Estrutura completa do funil: gatilho, fluxo de mensagens e métricas.
    """
    objetivo = objetivo_campanha.strip()
    if not objetivo:
        return "❌ Descreva o 'objetivo_campanha' (ex.: 'captar leads para mentoria')."
    base = "".join(ch for ch in objetivo.upper() if ch.isalnum() or ch == " ").split()
    gatilho = (base[0] if base else "QUERO")[:12]

    return "\n".join([
        f"# 🔁 Funil de DM — objetivo: {objetivo}",
        "",
        "## 1) Gatilho (comentário no post/Reel)",
        f"Peça no vídeo e na legenda: **\"Comente {gatilho} que eu te envio no direct\"**.",
        "Comentar aumenta o engajamento do post e dispara a automação.",
        "",
        "## 2) Fluxo de mensagens na DM (copie no ManyChat/automação)",
        "",
        "**DM 1 — Entrega imediata (0 min)**",
        f"> Oi! Vi que você comentou *{gatilho}* 🙌 Aqui está o que prometi: [LINK/RECURSO].",
        "",
        "**DM 2 — Quebra de objeção (após resposta ou +10 min)**",
        "> A dúvida nº1 de quem começa é [OBJEÇÃO COMUM]. A boa notícia: [SOLUÇÃO CURTA].",
        "",
        "**DM 3 — Oferta / conversão**",
        f"> Se você quer [RESULTADO ligado a: {objetivo}], o próximo passo é [OFERTA/CTA].",
        "",
        "## 3) Boas práticas",
        "- Personalize a DM 1 com o nome quando disponível.",
        "- Aguarde interação real antes de enviar link de venda (evita bloqueio por spam).",
        "- Ofereça sempre uma saída ('responda SAIR').",
        "",
        "## 4) Métricas para acompanhar",
        "- Taxa de comentário→DM aberta | DM→clique no link | clique→conversão.",
    ])


if __name__ == "__main__":
    app.run()
