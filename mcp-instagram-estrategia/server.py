"""Servidor MCP (MVP) — Ferramentas genéricas de conteúdo para Instagram.

Expõe 4 ferramentas que funcionam **sem nenhuma configuração** (não exigem
conta, token, Facebook ou Instagram API), alinhadas às diretrizes do algoritmo
atual (DMs e compartilhamentos como alavancas de alcance, SEO em legendas e
hooks de retenção nos primeiros segundos dos Reels):

    1. descobrir_trends_e_musicas
    2. gerar_ganchos_reels
    3. otimizar_legenda_seo
    4. planejar_funil_dm

Execução:
    python server.py            # transporte STDIO (padrão para o Claude Desktop)
"""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from instagram_mcp.analytics import AnalyticsEngine

app: FastMCP = FastMCP(
    name="instagram-estrategia",
    instructions=(
        "Servidor de estratégia para Instagram. Fornece tendências de Reels, "
        "hooks de retenção, otimização de legenda para SEO e planejamento de "
        "funis de DM. As análises seguem as diretrizes atuais do algoritmo "
        "(DMs, compartilhamentos, SEO e hooks). Nenhuma ferramenta exige conta "
        "ou token."
    ),
)

_analytics = AnalyticsEngine()


# --------------------------------------------------------------------------- #
# 1) descobrir_trends_e_musicas
# --------------------------------------------------------------------------- #
@app.tool()
def descobrir_trends_e_musicas() -> str:
    """Sugere áudios em alta e 3 formatos de vídeo que retêm público.

    Returns:
        Relatório com áudios em ascensão e formatos de Reels recomendados.
    """
    dados: dict[str, Any] = _analytics.trends_e_formatos()
    linhas = [
        "# 🎵 Trends & Áudios em alta (Reels)",
        "",
        "## Áudios em ascensão (por velocidade de crescimento)",
    ]
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
# 2) gerar_ganchos_reels
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
# 3) otimizar_legenda_seo
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
# 4) planejar_funil_dm
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
