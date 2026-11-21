// Proteções do servidor local:
// - Host permitido: bloqueia DNS rebinding (um site externo apontando o próprio domínio para 127.0.0.1).
// - Origem da requisição: ações (POST) só são aceitas da própria página, nunca de outros sites (CSRF).
// - Limite de atualizações manuais: evita que um loop dispare dezenas de requisições ao TSE pelo seu IP.
// - Cabeçalhos de segurança: CSP, nosniff, proibição de iframe e afins.

const os = require('node:os');
const log = require('./logger');

const LOOPBACK = ['localhost', '127.0.0.1', '::1'];
const QUALQUER_INTERFACE = ['0.0.0.0', '::'];

// Nomes aceitos no cabeçalho Host.
function hostsPermitidos(cfg) {
  const permitidos = new Set([...LOOPBACK, ...cfg.hostsPermitidos]);
  if (QUALQUER_INTERFACE.includes(cfg.host)) {
    // Aberto na rede: aceita os endereços deste computador (ex.: 192.168.0.57).
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const iface of lista ?? []) permitidos.add(iface.address.toLowerCase());
    }
  } else {
    permitidos.add(cfg.host.toLowerCase());
  }
  return permitidos;
}

// "127.0.0.1:3000" -> "127.0.0.1" | "[::1]:3000" -> "::1"
function nomeDoHost(valor) {
  if (!valor) return '';
  const v = valor.trim().toLowerCase();
  if (v.startsWith('[')) return v.slice(1, v.indexOf(']'));
  return v.split(':')[0];
}

function recusar(res, status, erro, req) {
  log.warn('requisição bloqueada', {
    requestId: req.id, motivo: erro, status, metodo: req.method, rota: req.originalUrl,
    host: req.headers.host, origem: req.get('Origin'),
  });
  res.status(status).json({ erro, requestId: req.id });
}

function validarHost(cfg) {
  const permitidos = hostsPermitidos(cfg);
  return (req, res, next) => {
    if (permitidos.has(nomeDoHost(req.headers.host))) return next();
    recusar(res, 403, 'Host não permitido', req);
  };
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Ações só da própria página. Clientes sem navegador (curl, testes) não enviam Origin e passam.
function bloquearOutrosSites(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return recusar(res, 403, 'Origem não permitida', req);
  const origem = req.get('Origin');
  if (origem) {
    let host;
    try {
      host = new URL(origem).host;
    } catch {
      return recusar(res, 403, 'Origem não permitida', req);
    }
    if (host !== req.get('Host')) return recusar(res, 403, 'Origem não permitida', req);
  }
  next();
}

// Uma ação manual a cada `intervaloMs`; as demais recebem 429 com Retry-After.
function limitarManual(intervaloMs) {
  let ultima = 0;
  return (req, res, next) => {
    const agora = Date.now();
    const espera = ultima + intervaloMs - agora;
    if (espera > 0) {
      res.set('Retry-After', String(Math.ceil(espera / 1000)));
      return recusar(res, 429, 'Aguarde antes de atualizar de novo', req);
    }
    ultima = agora;
    next();
  };
}

function cabecalhosSeguranca(cfg) {
  // Fotos dos candidatos vêm do servidor de resultados (só no modo real).
  const fotos = cfg.mock ? '' : ` ${new URL(cfg.tseBaseUrl).origin}`;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // Tailwind (modo CDN) gera <style> em tempo de execução e a página usa alguns estilos inline.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    `img-src 'self' data:${fotos}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  };
}

module.exports = { validarHost, bloquearOutrosSites, limitarManual, cabecalhosSeguranca, hostsPermitidos, nomeDoHost };
