// Proteções do servidor local: Host permitido, bloqueio de outros sites, limite de atualizações
// manuais e cabeçalhos de segurança.
process.env.LOG_NIVEL = 'silencioso';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { criarApp } = require('../server/app');
const { hostsPermitidos, nomeDoHost } = require('../server/seguranca');

const cfg = {
  mock: false, ano: '2026', eleicao: '6258', tseBaseUrl: 'https://resultados.tse.jus.br', ambiente: 'oficial',
  intervaloMs: 6000, sseHeartbeatMs: 0, limiteCorpo: '1kb',
  host: '127.0.0.1', hostsPermitidos: [], intervaloMinimoManualMs: 1000,
};

const poller = {
  cache: new Map(),
  ciclos: 1,
  execucoes: 0,
  status: () => ({ ok: true, erros: [], arquivos: { total: 29, ok: 29 }, atualizacoes: { auto: 1, manual: 0, total: 1 } }),
  aoAtualizar: () => () => {},
  async executar() { this.execucoes++; },
  limpar() {},
};

let servidor, porta, base, sse;

before(async () => {
  const criado = criarApp({ cfg, poller });
  sse = criado.sse;
  servidor = criado.app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  porta = servidor.address().port;
  base = `http://127.0.0.1:${porta}`;
});

after(() => {
  sse.encerrar();
  servidor.close();
});

// fetch não permite trocar o cabeçalho Host: usa http.request.
function requisicao({ metodo = 'GET', caminho = '/api/apuracao', cabecalhos = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers: cabecalhos }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    });
    req.on('error', reject);
    req.end();
  });
}

test('servidor recusa Host desconhecido (proteção contra DNS rebinding)', async () => {
  const externo = await requisicao({ cabecalhos: { Host: `site-malicioso.example:${porta}` } });
  assert.equal(externo.statusCode, 403);
  const local = await requisicao({ cabecalhos: { Host: `localhost:${porta}` } });
  assert.equal(local.statusCode, 200);
});

test('POST vindo de outro site é bloqueado; da própria página e sem navegador passa', async () => {
  const outroSite = await fetch(`${base}/api/atualizar`, { method: 'POST', headers: { Origin: 'https://site-malicioso.example' } });
  assert.equal(outroSite.status, 403);
  await outroSite.body.cancel();

  const crossSite = await fetch(`${base}/api/atualizar`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  await crossSite.body.cancel();

  const execucoesAntes = poller.execucoes;
  const mesmaOrigem = await fetch(`${base}/api/atualizar`, {
    method: 'POST', headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(mesmaOrigem.status, 200);
  await mesmaOrigem.body.cancel();
  assert.equal(poller.execucoes, execucoesAntes + 1);
});

test('limita atualizações manuais seguidas com 429 e Retry-After', async () => {
  await new Promise((r) => setTimeout(r, cfg.intervaloMinimoManualMs + 50));
  const primeira = await fetch(`${base}/api/atualizar`, { method: 'POST' });
  assert.equal(primeira.status, 200);
  await primeira.body.cancel();

  const segunda = await fetch(`${base}/api/atualizar`, { method: 'POST' });
  assert.equal(segunda.status, 429);
  assert.ok(Number(segunda.headers.get('retry-after')) >= 1);
  await segunda.body.cancel();

  await new Promise((r) => setTimeout(r, cfg.intervaloMinimoManualMs + 50));
  const depois = await fetch(`${base}/api/atualizar`, { method: 'POST' });
  assert.equal(depois.status, 200);
  await depois.body.cancel();
});

test('cabeçalhos de segurança na página e na API', async () => {
  for (const caminho of ['/', '/api/apuracao']) {
    const r = await fetch(`${base}${caminho}`);
    await r.body.cancel();
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'(;|$)/, 'scripts só do próprio servidor');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /img-src 'self' data: https:\/\/resultados\.tse\.jus\.br/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('index.html não tem scripts inline nem scripts de outros domínios', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const atributos of scripts) {
    const src = /\bsrc="([^"]+)"/.exec(atributos)?.[1];
    assert.ok(src, `script inline encontrado: <script${atributos}>`);
    assert.ok(!/^(https?:)?\/\//.test(src), `script externo encontrado: ${src}`);
  }
});

test('hosts permitidos: só loopback por padrão, interfaces locais quando aberto na rede', () => {
  const fechado = hostsPermitidos({ host: '127.0.0.1', hostsPermitidos: [] });
  assert.ok(fechado.has('localhost') && fechado.has('127.0.0.1') && fechado.has('::1'));
  assert.equal(fechado.size, 3);

  const aberto = hostsPermitidos({ host: '0.0.0.0', hostsPermitidos: ['painel.casa'] });
  assert.ok(aberto.has('painel.casa'));
  assert.ok(aberto.size > 3);

  assert.equal(nomeDoHost('127.0.0.1:3000'), '127.0.0.1');
  assert.equal(nomeDoHost('[::1]:3000'), '::1');
  assert.equal(nomeDoHost('LocalHost'), 'localhost');
  assert.equal(nomeDoHost(undefined), '');
});
