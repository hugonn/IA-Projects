// Contrato da API HTTP, SSE e tratamento de erros, com um poller falso (sem acesso à rede).
process.env.LOG_NIVEL = 'silencioso';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { criarApp } = require('../server/app');

const cfg = {
  mock: false, ano: '2026', eleicao: '6258', tseBaseUrl: 'https://exemplo.invalid', ambiente: 'oficial',
  intervaloMs: 6000, sseHeartbeatMs: 50, limiteCorpo: '1kb',
  host: '127.0.0.1', hostsPermitidos: [], intervaloMinimoManualMs: 0,
};

const poller = {
  cache: new Map(),
  ciclos: 1,
  chamadas: [],
  falhar: false,
  ouvintes: new Set(),
  status() {
    return { ok: true, erros: [], arquivos: { total: 29, ok: 29 }, atualizacoes: { auto: 1, manual: 0, total: 1 } };
  },
  aoAtualizar(fn) {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  },
  async executar(origem, requestId) {
    if (this.falhar) throw new Error('falha simulada');
    this.chamadas.push({ origem, requestId });
    for (const fn of this.ouvintes) fn();
  },
  limpar() {},
};

let servidor, base, sse;

before(async () => {
  const criado = criarApp({ cfg, poller });
  sse = criado.sse;
  servidor = criado.app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  sse.encerrar();
  servidor.close();
});

test('GET /api/apuracao devolve o snapshot no contrato esperado', async () => {
  const r = await fetch(`${base}/api/apuracao`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const s = await r.json();
  assert.equal(s.meta.modo, 'tse');
  assert.equal(s.meta.intervaloMs, 6000);
  assert.equal(typeof s.meta.servidorEm, 'string');
  assert.ok(Array.isArray(s.status.erros));
  assert.equal(s.nacional, null);
  assert.equal(s.regioes.length, 5);
  assert.deepEqual(s.regioes.map((x) => x.id), ['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul']);
});

test('não expõe X-Powered-By', async () => {
  const r = await fetch(`${base}/api/apuracao`);
  await r.body.cancel();
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('repassa um X-Request-Id válido e gera um novo para valores inválidos', async () => {
  const valido = await fetch(`${base}/api/apuracao`, { headers: { 'X-Request-Id': 'abc-123' } });
  await valido.body.cancel();
  assert.equal(valido.headers.get('x-request-id'), 'abc-123');

  const invalido = await fetch(`${base}/api/apuracao`, { headers: { 'X-Request-Id': 'tem espaço<script>' } });
  await invalido.body.cancel();
  assert.match(invalido.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});

test('POST /api/atualizar dispara um ciclo manual com o mesmo requestId', async () => {
  const r = await fetch(`${base}/api/atualizar`, { method: 'POST', headers: { 'X-Request-Id': 'manual-1' } });
  assert.equal(r.status, 200);
  await r.json();
  assert.deepEqual(poller.chamadas.at(-1), { origem: 'manual', requestId: 'manual-1' });
});

test('erro em rota assíncrona vira 500 em JSON, sem stack trace', async () => {
  poller.falhar = true;
  try {
    const r = await fetch(`${base}/api/atualizar`, { method: 'POST', headers: { 'X-Request-Id': 'erro-1' } });
    assert.equal(r.status, 500);
    const corpo = await r.json();
    assert.deepEqual(corpo, { erro: 'Erro interno do servidor', requestId: 'erro-1' });
    assert.ok(!JSON.stringify(corpo).includes('falha simulada'));
  } finally {
    poller.falhar = false;
  }
});

test('rota inexistente da API responde 404 em JSON', async () => {
  const r = await fetch(`${base}/api/nao-existe`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).erro, 'Rota não encontrada');
});

test('corpo JSON inválido ou grande demais é rejeitado com 4xx', async () => {
  const invalido = await fetch(`${base}/api/atualizar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado',
  });
  assert.equal(invalido.status, 400);
  await invalido.body.cancel();

  const grande = await fetch(`${base}/api/atualizar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(5000) }),
  });
  assert.equal(grande.status, 413);
  await grande.body.cancel();
});

test('SSE: cabeçalhos, snapshot inicial, heartbeat e limpeza ao desconectar', async () => {
  const recebido = await new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/stream`, (res) => {
      let dados = '';
      res.setEncoding('utf8');
      res.on('data', (parte) => {
        dados += parte;
        // Espera o snapshot inicial e ao menos um heartbeat (intervalo de 50 ms no teste).
        if (dados.includes('data: {') && dados.includes(': ping')) {
          resolve({ headers: res.headers, dados, clientes: sse.clientes.size });
          req.destroy();
        }
      });
    });
    req.on('error', reject);
  });

  assert.match(recebido.headers['content-type'], /text\/event-stream/);
  assert.equal(recebido.headers['cache-control'], 'no-cache');
  assert.equal(recebido.headers.connection, 'keep-alive');
  assert.ok(recebido.dados.startsWith('retry: 3000'));
  assert.equal(recebido.clientes, 1);

  // Após o fechamento, o cliente sai da lista e o heartbeat para.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(sse.clientes.size, 0);
  assert.equal(sse.timerHeartbeat, null);
});
