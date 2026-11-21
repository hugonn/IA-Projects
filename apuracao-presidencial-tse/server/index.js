const path = require('path');
const express = require('express');
const cfg = require('./config');
const { TsePoller } = require('./tse');
const { montarSnapshot } = require('./agregacao');
const { criarRotasMock } = require('./mock');
const { Referencia } = require('./projecao');

const app = express();
const poller = new TsePoller(cfg);
const referencia = cfg.referencia ? new Referencia(cfg, cfg.referencia) : null;
const snapshot = () => montarSnapshot(poller, cfg, referencia);

// O 1º turno (referência da projeção) é baixado uma vez; se falhar, tenta de novo a cada ciclo.
if (referencia) poller.aoAtualizar(() => { if (!referencia.completa) referencia.carregar(); });

app.use(express.static(path.join(__dirname, '..', 'public')));

if (cfg.mock) {
  const { router } = criarRotasMock(cfg);
  app.use('/mock-tse', router);
  // Reinicia simulação e descarta o cache do poller.
  app.post('/api/mock/reset', async (req, res) => {
    await fetch(`${cfg.tseBaseUrl}/reset`, { method: 'POST' });
    poller.limpar();
    await poller.executar('manual');
    res.json({ ok: true });
  });
}

// Atualização manual: busca o TSE imediatamente e reinicia a contagem da automática.
app.post('/api/atualizar', async (req, res) => {
  await poller.executar('manual');
  res.set('Cache-Control', 'no-store').json(snapshot());
});

// Último snapshot consolidado (o frontend consulta a cada 6 s).
app.get('/api/apuracao', (req, res) => {
  res.set('Cache-Control', 'no-store').json(snapshot());
});

// Server-Sent Events: empurra o snapshot a cada ciclo do poller.
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders();
  const enviar = () => res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  if (poller.ciclos > 0) enviar();
  const remover = poller.aoAtualizar(enviar);
  req.on('close', remover);
});

const servidor = app.listen(cfg.port, () => {
  const linha = '─'.repeat(64);
  console.log(linha);
  console.log(' Apuração Presidencial — painel local');
  console.log(` Modo:      ${cfg.mock ? `SIMULAÇÃO (mock, ${cfg.turno}º turno, ${cfg.mockDuracaoMin} min)` : 'TSE oficial'}`);
  console.log(` Eleição:   ${cfg.ano} / código ${cfg.eleicao}`);
  console.log(` Fonte:     ${cfg.tseBaseUrl}`);
  console.log(` Intervalo: ${cfg.intervaloMs / 1000}s  |  timeout: ${cfg.timeoutMs / 1000}s`);
  console.log(` Painel:    http://localhost:${cfg.port}`);
  console.log(linha);
  poller.iniciar();
});

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nA porta ${cfg.port} já está em uso (outro servidor do painel aberto?).`);
    console.error(`Feche o outro processo ou use outra porta:  npm run ${cfg.mock ? 'mock' : 'start'} -- --porta=3001\n`);
    process.exit(1);
  }
  throw err;
});
