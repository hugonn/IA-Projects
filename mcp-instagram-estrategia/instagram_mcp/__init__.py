"""Pacote do servidor MCP de estratégia para Instagram.

Módulos:
    config       -> carregamento tipado de variáveis de ambiente (.env)
    graph_client -> cliente da Instagram Graph API oficial (com rate limiting)
    analytics    -> camada de IA/heurística para dados não expostos pela API
    tools        -> implementação de cada ferramenta (tool) exposta ao MCP
"""

__version__ = "1.0.0"
