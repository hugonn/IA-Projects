"""Assistente de configuração de credenciais da Instagram Graph API (2026).

O que este script faz (caminho "Facebook Login", usado pelo servidor):
    1. Recebe seu App ID, App Secret e um token de CURTA duração.
    2. Troca o token curto por um de LONGA duração (~60 dias).
    3. Descobre automaticamente o Instagram Business Account ID a partir das
       Páginas do Facebook vinculadas à sua conta.
    4. Grava IG_ACCESS_TOKEN e IG_BUSINESS_ACCOUNT_ID no arquivo .env,
       preservando as demais variáveis já existentes.

Como usar:
    1. Gere um token de CURTA duração no Graph API Explorer:
         https://developers.facebook.com/tools/explorer/
       selecionando seu App e as permissões:
         instagram_basic, instagram_manage_insights,
         pages_read_engagement, pages_show_list, business_management
    2. Rode:  python setup_token.py
    3. Cole os valores quando solicitado.

Nenhum dado é enviado para lugar nenhum além da própria API oficial do Meta.
Os segredos são digitados localmente e gravados apenas no seu .env local.
"""

from __future__ import annotations

import sys
from getpass import getpass
from pathlib import Path
from typing import Any

import httpx

# Versão atual da Graph API (mantida em sincronia com o servidor — 2026).
GRAPH_API_VERSION = "v25.0"
BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

ENV_PATH = Path(__file__).with_name(".env")


# --------------------------------------------------------------------------- #
# Utilitários de entrada
# --------------------------------------------------------------------------- #
def _pedir(rotulo: str, *, segredo: bool = False) -> str:
    """Solicita um valor ao usuário no terminal, repetindo se vier vazio."""
    prompt = f"{rotulo}: "
    while True:
        valor = (getpass(prompt) if segredo else input(prompt)).strip()
        if valor:
            return valor
        print("  ⚠️  Valor obrigatório. Tente novamente.")


# --------------------------------------------------------------------------- #
# Chamadas à Graph API
# --------------------------------------------------------------------------- #
def trocar_por_token_longo(
    client: httpx.Client, app_id: str, app_secret: str, token_curto: str
) -> str:
    """Troca um token de curta duração por um de longa duração (~60 dias)."""
    resp = client.get(
        "/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": token_curto,
        },
    )
    dados = _tratar_resposta(resp, contexto="troca de token")
    token = dados.get("access_token")
    if not token:
        _abortar("A resposta não continha um access_token de longa duração.")
    expira = dados.get("expires_in")
    if expira:
        print(f"  ✔ Token de longa duração gerado (expira em ~{int(expira) // 86400} dias).")
    else:
        print("  ✔ Token de longa duração gerado.")
    return token


def descobrir_business_account_id(client: httpx.Client, token: str) -> str:
    """Descobre o Instagram Business Account ID via Páginas do Facebook.

    Percorre as Páginas vinculadas ao usuário e, para cada uma, verifica se há
    uma conta profissional do Instagram associada. Se houver mais de uma, deixa
    o usuário escolher.
    """
    resp = client.get(
        "/me/accounts",
        params={
            "fields": "name,instagram_business_account{id,username}",
            "access_token": token,
        },
    )
    dados = _tratar_resposta(resp, contexto="listagem de Páginas")
    paginas: list[dict[str, Any]] = dados.get("data", [])

    # Filtra apenas Páginas que têm uma conta de Instagram vinculada.
    contas = [
        {
            "pagina": p.get("name", "(sem nome)"),
            "ig_id": p["instagram_business_account"]["id"],
            "ig_user": p["instagram_business_account"].get("username", "?"),
        }
        for p in paginas
        if p.get("instagram_business_account")
    ]

    if not contas:
        # Fallback: no "novo modelo de Páginas" (2026), /me/accounts costuma vir
        # vazio mesmo com tudo certo. Buscamos então direto pelo ID da Página.
        print(
            "  ⚠ /me/accounts veio vazio (comum no novo modelo de Páginas).\n"
            "  Vamos buscar direto pela Página."
        )
        return _business_account_id_via_pagina(client, token)

    if len(contas) == 1:
        c = contas[0]
        print(f"  ✔ Conta encontrada: @{c['ig_user']} (Página: {c['pagina']})")
        return c["ig_id"]

    # Múltiplas contas: deixa o usuário escolher.
    print("\n  Foram encontradas várias contas. Escolha uma:")
    for i, c in enumerate(contas, start=1):
        print(f"   [{i}] @{c['ig_user']}  —  Página: {c['pagina']}")
    while True:
        escolha = input("  Número da conta desejada: ").strip()
        if escolha.isdigit() and 1 <= int(escolha) <= len(contas):
            return contas[int(escolha) - 1]["ig_id"]
        print("  ⚠️  Opção inválida.")


def _business_account_id_via_pagina(client: httpx.Client, token: str) -> str:
    """Descobre o IG Business Account ID a partir de um ID informado pelo usuário.

    Aceita tanto o ID da **Página** do Facebook quanto o ID da própria **conta
    do Instagram** (padrão 17841...), ambos copiáveis do Depurador de Token.
    Usado quando /me/accounts não lista a Página (novo modelo de Páginas).
    """
    print(
        "\n  Cole o ID da Página do Facebook OU o ID da conta do Instagram\n"
        "  (o número que começa com 17841...), ambos disponíveis no\n"
        "  Depurador de Token."
    )
    node_id = _pedir("ID da Página ou da conta IG").strip()

    # 1ª tentativa: tratar como Página -> extrair instagram_business_account.
    corpo = _get_soft(
        client,
        node_id,
        fields="name,instagram_business_account{id,username}",
        token=token,
    )
    iba = corpo.get("instagram_business_account")
    if iba and iba.get("id"):
        print(f"  ✔ Conta encontrada: @{iba.get('username', '?')} (Página: {corpo.get('name', '?')})")
        return iba["id"]

    # 2ª tentativa: o ID já é a própria conta do Instagram (nó IG User).
    conta = _get_soft(client, node_id, fields="username,name", token=token)
    if conta.get("username"):
        print(f"  ✔ Conta do Instagram confirmada: @{conta['username']}")
        return node_id

    _abortar(
        "Não foi possível resolver esse ID para uma conta profissional do "
        "Instagram.\n"
        "  Verifique se @seu_usuario é Profissional (Business/Creator) e se o ID "
        "colado é o da Página ou o da conta IG (17841...)."
    )


def _get_soft(
    client: httpx.Client, node_id: str, *, fields: str, token: str
) -> dict[str, Any]:
    """GET tolerante: retorna o JSON (ou {} em erro), SEM abortar o script.

    Útil para tentar múltiplas estratégias de descoberta sem interromper o fluxo.
    """
    resp = client.get(
        f"/{node_id}", params={"fields": fields, "access_token": token}
    )
    try:
        corpo = resp.json()
    except ValueError:
        return {}
    if resp.status_code != 200 or "error" in corpo:
        return {}
    return corpo


# --------------------------------------------------------------------------- #
# Tratamento de resposta / erros
# --------------------------------------------------------------------------- #
def _tratar_resposta(resp: httpx.Response, *, contexto: str) -> dict[str, Any]:
    """Valida a resposta HTTP e retorna o JSON, ou aborta com mensagem clara."""
    try:
        corpo = resp.json()
    except ValueError:
        _abortar(f"Resposta inválida da API durante {contexto} (HTTP {resp.status_code}).")

    if resp.status_code != 200 or "error" in corpo:
        erro = corpo.get("error", {})
        msg = erro.get("message", f"HTTP {resp.status_code}")
        _abortar(f"Falha na {contexto}: {msg}")
    return corpo


def _abortar(mensagem: str) -> None:
    """Encerra o script com uma mensagem de erro amigável."""
    print(f"\n❌ {mensagem}")
    sys.exit(1)


# --------------------------------------------------------------------------- #
# Gravação no .env (preservando o que já existe)
# --------------------------------------------------------------------------- #
def atualizar_env(valores: dict[str, str]) -> None:
    """Atualiza/insere chaves no .env sem apagar as demais variáveis."""
    linhas: list[str] = []
    if ENV_PATH.exists():
        linhas = ENV_PATH.read_text(encoding="utf-8").splitlines()

    restantes = dict(valores)
    novas_linhas: list[str] = []
    for linha in linhas:
        chave = linha.split("=", 1)[0].strip() if "=" in linha else ""
        if chave in restantes:
            novas_linhas.append(f"{chave}={restantes.pop(chave)}")
        else:
            novas_linhas.append(linha)

    # Chaves que ainda não existiam no arquivo são adicionadas ao final.
    for chave, valor in restantes.items():
        novas_linhas.append(f"{chave}={valor}")

    ENV_PATH.write_text("\n".join(novas_linhas) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# Fluxo principal
# --------------------------------------------------------------------------- #
def main() -> None:
    print("=" * 70)
    print(" Assistente de configuração — Instagram Graph API (v25.0 / 2026)")
    print("=" * 70)
    print(
        "\nAntes de começar, gere um token de CURTA duração no Graph API Explorer:\n"
        "  https://developers.facebook.com/tools/explorer/\n"
        "com as permissões: instagram_basic, instagram_manage_insights,\n"
        "pages_read_engagement, pages_show_list, business_management.\n"
    )

    app_id = _pedir("App ID")
    app_secret = _pedir("App Secret", segredo=True)
    token_curto = _pedir("Token de CURTA duração", segredo=True)

    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        print("\n[1/2] Trocando por token de longa duração...")
        token_longo = trocar_por_token_longo(client, app_id, app_secret, token_curto)

        print("[2/2] Descobrindo seu Instagram Business Account ID...")
        ig_id = descobrir_business_account_id(client, token_longo)

    atualizar_env(
        {
            "IG_ACCESS_TOKEN": token_longo,
            "IG_BUSINESS_ACCOUNT_ID": ig_id,
            "IG_APP_SECRET": app_secret,
            "IG_GRAPH_API_VERSION": GRAPH_API_VERSION,
        }
    )

    print("\n" + "=" * 70)
    print("✅ Pronto! Credenciais gravadas em .env:")
    print(f"   IG_BUSINESS_ACCOUNT_ID = {ig_id}")
    print("   IG_ACCESS_TOKEN        = (gravado, oculto por segurança)")
    print("=" * 70)
    print(
        "\nPróximos passos:\n"
        "  1. Reinicie o Claude Desktop.\n"
        "  2. Peça: \"Analise o perfil @seu_user\".\n"
        "\nObs.: o token de longa duração expira em ~60 dias. Rode este script\n"
        "novamente quando precisar renová-lo.\n"
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelado pelo usuário.")
        sys.exit(130)
