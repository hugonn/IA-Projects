// Montagem da aplicação Express, separada da inicialização (index.js) para poder ser testada
// com um poller falso.

const path = require('path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { montarSnapshot } = require('./agregacao');
const { CanalSSE } = require('./sse');
const log = require('./logger');

// Aceita o X-Request-Id recebido só se tiver um formato seguro para logs e cabeçalhos.
const ID_VALIDO = /^[A-Za-z0-9._-]{1,128}$/;

// Encaminha exceções de rotas async para o middleware de erros (Express 4 não faz isso sozinho).
const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function criarApp({ cfg, poller, referencia = null, simulador = null }) {
  const app = express();
  const sse = new CanalSSE({ heartbeatMs: cfg.sseHeartbeatMs });

  // O snapshot é montado uma vez por ciclo do poller e reaproveitado por todas as requisições
  // e conexões SSE, em vez de ser recalculado a cada cliente.
  let ultimoSnapshot = null;
  const snapshotJson = () => ultimoSnapshot ?? (ultimoSnapshot = JSON.stringify(montarSnapshot(poller, cfg, referencia)));
  poller.aoAtualizar(() => {
    ultimoSnapshot = null;
    sse.transmitir(snapshotJson());
    // O 1º turno (referência da projeção) é baixado uma vez; se falhar, tenta de novo no próximo ciclo.
    if (referencia && !referencia.completa) referencia.carregar();
  });

  app.disable('x-powered-by');

  // Rastreabilidade: repassa ou gera um X-Request-Id e o devolve na resposta.
  app.use((req, res, next) => {
    const recebido = req.get('X-Request-Id');
    req.id = recebido && ID_VALIDO.test(recebido) ? recebido : randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });

  // Log de acesso das rotas da API (o simulador gera dezenas de requisições por ciclo e fica de fora).
  app.use('/api', (req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/stream') return;
      log.info('requisição', {
        requestId: req.id, metodo: req.method, rota: req.originalUrl, status: res.statusCode,
        duracaoMs: Number(process.hrtime.bigint() - inicio) / 1e6,
      });
    });
    next();
  });

  app.use(express.json({ limit: cfg.limiteCorpo }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  if (simulador) {
    const { criarRotasMock } = require('./mock');
    app.use('/mock-tse', criarRotasMock(cfg, simulador).router);

    // Reinicia a simulação e descarta o cache do poller.
    app.post('/api/mock/reset', assincrono(async (req, res) => {
      simulador.reset();
      poller.limpar();
      await poller.executar('manual', req.id);
      res.json({ ok: true });
    }));
  }

  // Atualização manual: busca o TSE imediatamente e reinicia a contagem da automática.
  app.post('/api/atualizar', assincrono(async (req, res) => {
    await poller.executar('manual', req.id);
    res.set('Cache-Control', 'no-store').type('json').send(snapshotJson());
  }));

  // Último snapshot consolidado (usado no carregamento inicial e como reserva do SSE).
  app.get('/api/apuracao', (req, res) => {
    res.set('Cache-Control', 'no-store').type('json').send(snapshotJson());
  });

  // Server-Sent Events: empurra o snapshot a cada ciclo do poller.
  app.get('/api/stream', (req, res) => {
    sse.adicionar(req, res, poller.ciclos > 0 ? snapshotJson() : null);
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada', requestId: req.id });
  });

  // Middleware central de erros: registra o detalhe no log e nunca expõe stack trace ao cliente.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) log.error('erro na requisição', { requestId: req.id, rota: req.originalUrl, erro: err });
    else log.warn('requisição rejeitada', { requestId: req.id, rota: req.originalUrl, status, motivo: err.message });
    if (res.headersSent) return res.end();
    res.status(status).json({
      erro: status >= 500 ? 'Erro interno do servidor' : err.expose ? err.message : 'Requisição inválida',
      requestId: req.id,
    });
  });

  return { app, sse };
}

module.exports = { criarApp };
