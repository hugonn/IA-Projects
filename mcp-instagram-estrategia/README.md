# MCP Instagram Estratégia (MVP)

Servidor **MCP nativo em Python** (via [`fastmcp`](https://github.com/jlowin/fastmcp)) que expõe **8 ferramentas genéricas** de análise e estratégia para Instagram, alinhadas às diretrizes do algoritmo atual (DMs e compartilhamentos como alavancas de alcance, SEO em bio/legenda/alt text e hooks de retenção nos Reels).

É um MVP: funciona com qualquer conta Profissional pública e também oferece ferramentas de conteúdo que rodam sem nenhuma configuração.

## Ferramentas

| Ferramenta | O que faz | Precisa de token |
|---|---|---|
| `analisar_perfil(username)` | Diagnóstico de posicionamento, proposta de valor e legibilidade da bio | Sim |
| `mapear_perfil(username)` | Infere nicho, temas, hashtags e formato dominante a partir da bio e dos posts | Sim |
| `sugerir_horarios_publicacao(username)` | 3 melhores blocos de horário por engajamento histórico | Sim |
| `sugerir_melhorias_perfil(username)` | Auditoria de bio, CTA e SEO de busca interna | Sim |
| `descobrir_trends_e_musicas()` | Áudios em alta e formatos de vídeo que retêm público | Não |
| `gerar_ganchos_reels(tema, nicho)` | 5 hooks de retenção baseados em gatilhos psicológicos | Não |
| `otimizar_legenda_seo(texto_rascunho, palavras_chave)` | Legenda com SEO, CTA e Alt Text | Não |
| `planejar_funil_dm(objetivo_campanha)` | Fluxo de automação de Direct (estilo ManyChat) | Não |

As ferramentas de perfil usam a **Instagram Graph API oficial** via Business Discovery e inspecionam qualquer conta **Profissional (Business ou Creator) pública**. As ferramentas de conteúdo usam uma camada analítica interna e **não exigem token**.

## Requisitos

- **Python 3.10 ou superior**
- Para as 4 ferramentas de perfil: um token da Instagram Graph API (veja abaixo)

## Instalação

```bash
pip install -r requirements.txt
```

## Configuração

Para as 4 ferramentas de perfil, copie o arquivo de exemplo e preencha suas credenciais:

```bash
cp .env.example .env
```

Preencha no `.env`:

```env
IG_ACCESS_TOKEN=seu_token_de_longa_duracao
IG_BUSINESS_ACCOUNT_ID=id_numerico_da_sua_conta
```

### Como obter o token (passo a passo)

O Instagram só libera dados via API para contas Profissionais. O caminho oficial usado aqui é o **Facebook Login** (Business Discovery), que exige uma conta Profissional ligada a uma Página do Facebook.

1. Converta seu Instagram para conta **Profissional** (Business ou Creator) e vincule a uma **Página do Facebook**.
2. Crie um app em [Meta for Developers](https://developers.facebook.com/apps) e adicione o produto **Instagram** com **Facebook Login**.
3. No **Graph API Explorer**, gere um token com as permissões: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
4. Troque o token curto por um de **longa duração** (cerca de 60 dias).
5. Descubra o **Instagram Business Account ID** (número que começa com 17841...).

O arquivo [`.env.example`](.env.example) traz o detalhamento de cada etapa. Há também um assistente que automatiza a troca do token e a descoberta do ID:

```bash
python setup_token.py
```

> As ferramentas de conteúdo (`descobrir_trends_e_musicas`, `gerar_ganchos_reels`, `otimizar_legenda_seo`, `planejar_funil_dm`) funcionam sem token. Para testar o servidor rapidamente, você pode pular a configuração e usar só essas.

## Executar

```bash
python server.py
```

O servidor usa transporte **STDIO**, padrão para o Claude Desktop.

## Registrar no Claude Desktop

Edite o arquivo de configuração do Claude Desktop:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Adicione o servidor (ajuste o caminho absoluto para a pasta onde você clonou este projeto):

```json
{
  "mcpServers": {
    "instagram-estrategia": {
      "command": "python",
      "args": ["CAMINHO_ABSOLUTO/mcp-instagram-estrategia/server.py"]
    }
  }
}
```

Reinicie o Claude Desktop. As 8 ferramentas aparecem no ícone de ferramentas.

## Como usar

No Claude Desktop, basta pedir em linguagem natural que ele chama a ferramenta certa:

- "Analisa o perfil @exemplo"
- "Mapeia o nicho do perfil @exemplo"
- "Quais os melhores horários para postar em @exemplo"
- "O que melhorar no perfil @exemplo"
- "Me mostra as trends e áudios em alta"
- "Gera 5 hooks sobre rotina matinal para o nicho saúde"
- "Otimiza essa legenda: [texto] com as palavras-chave corrida e treino"
- "Planeja um funil de DM para captar leads"

## Camada de IA opcional

A geração de hooks e legendas usa uma heurística determinística por padrão (funciona offline, sem chave). Para redigir por IA, defina no `.env`:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sua_chave
```

Se o LLM falhar ou não estiver configurado, o servidor cai automaticamente para a heurística local.

## Estrutura

```
mcp-instagram-estrategia/
├── server.py                 # FastMCP app + as 8 ferramentas
├── instagram_mcp/
│   ├── config.py             # Settings tipado a partir do .env
│   ├── graph_client.py       # Cliente Graph API (rate limiting + retries)
│   ├── profile_scan.py       # Varredura de perfil e inferência de nicho
│   └── analytics.py          # Camada analítica e heurística
├── setup_token.py            # Assistente para gerar o token e descobrir o ID
├── requirements.txt
├── .env.example
└── README.md
```

## Limitações

- O Business Discovery só funciona para contas **Profissionais e públicas**.
- Tendências globais de áudio não são expostas pela API oficial; a ferramenta de trends usa uma camada analítica, que deve ser validada na aba Reels em alta do app.
- O token de longa duração expira em cerca de 60 dias; renove rodando `python setup_token.py`.
