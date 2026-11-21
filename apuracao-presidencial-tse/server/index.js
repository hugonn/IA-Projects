// Inicialização do servidor: cria poller, aplicação e trata o encerramento gracioso.

const cfg = require('./config');
const log = require('./logger');
const { TsePoller } = require('./tse');
const { Referencia } = require('./projecao');
const { SimuladorApuracao } = require('./mock');
const { criarApp } = require('./app');

const poller = new TsePoller(cfg);
const referencia = cfg.referencia ? new Referencia(cfg, cfg.referencia) : null;
const simulador = cfg.mock
  ? new SimuladorApuracao({ turno: cfg.turno, duracaoMin: cfg.mockDuracaoMin, eleicao: cfg.eleicao })
  : null;
const { app, sse } = criarApp({ cfg, poller, referencia, simulador });

const servidor = app.listen(cfg.port, () => {
  log.info('servidor iniciado', {
    painel: `http://localhost:${cfg.port}`,
    modo: cfg.mock ? 'simulacao' : 'tse',
    turno: cfg.mock ? cfg.turno : undefined,
    ano: cfg.ano,
    eleicao: cfg.eleicao,
    fonte: cfg.tseBaseUrl,
    intervaloMs: cfg.intervaloMs,
    timeoutMs: cfg.timeoutMs,
  });
  poller.iniciar();
});

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error('porta em uso', {
      porta: cfg.port,
      sugestao: `feche o outro processo ou use outra porta: npm run ${cfg.mock ? 'mock' : 'start'} -- --porta=3001`,
    });
    process.exit(1);
  }
  throw err;
});

// Encerramento gracioso: para o poller, fecha as conexões SSE e espera o servidor HTTP fechar.
let encerrando = false;
function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  log.info('encerrando', { sinal, clientesSse: sse.clientes.size });

  poller.parar();
  sse.encerrar();
  servidor.close(() => {
    log.info('servidor encerrado');
    process.exit(0);
  });
  servidor.closeIdleConnections?.();

  // Se algo segurar o processo, força a saída depois do limite configurado.
  setTimeout(() => {
    log.warn('encerramento forçado', { aposMs: cfg.shutdownTimeoutMs });
    process.exit(1);
  }, cfg.shutdownTimeoutMs).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
