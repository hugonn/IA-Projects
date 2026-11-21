# MCP Instagram Estratégia (MVP)

Servidor **MCP nativo em Python** (via [`fastmcp`](https://github.com/jlowin/fastmcp)) com **4 ferramentas genéricas** de conteúdo para Instagram, alinhadas às diretrizes do algoritmo atual (DMs e compartilhamentos como alavancas de alcance, SEO em legendas e hooks de retenção nos Reels).

É um MVP: **não exige conta, token, Facebook nem Instagram API**. Instalou, registrou no Claude Desktop, usou.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `descobrir_trends_e_musicas()` | Áudios em alta e formatos de vídeo que retêm público |
| `gerar_ganchos_reels(tema, nicho)` | 5 hooks de retenção baseados em gatilhos psicológicos |
| `otimizar_legenda_seo(texto_rascunho, palavras_chave)` | Legenda com SEO, CTA e Alt Text |
| `planejar_funil_dm(objetivo_campanha)` | Fluxo de automação de Direct (estilo ManyChat) |

Todas usam uma camada analítica/heurística interna e rodam **offline**, sem nenhuma chave.

## Requisitos

- **Python 3.10 ou superior**

## Instalação

```bash
pip install -r requirements.txt
```

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

Reinicie o Claude Desktop. As 4 ferramentas aparecem no ícone de ferramentas.

## Como usar

No Claude Desktop, basta pedir em linguagem natural:

- "Me mostra as trends e áudios em alta"
- "Gera 5 hooks sobre rotina matinal para o nicho saúde"
- "Otimiza essa legenda: [texto] com as palavras-chave corrida e treino"
- "Planeja um funil de DM para captar leads"

## Camada de IA opcional

A geração de hooks e legendas usa uma heurística determinística por padrão (funciona offline, sem chave). Para redigir por IA, crie um arquivo `.env` na raiz do projeto com:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sua_chave
```

Se o LLM falhar ou não estiver configurado, o servidor cai automaticamente para a heurística local.

## Estrutura

```
mcp-instagram-estrategia/
├── server.py                 # FastMCP app + as 4 ferramentas
├── instagram_mcp/
│   ├── config.py             # Configuração opcional do LLM
│   └── analytics.py          # Camada analítica e heurística
├── requirements.txt
├── LICENSE
└── README.md
```

## Licença

MIT. Veja o arquivo [LICENSE](LICENSE).
