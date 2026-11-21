// Canal de Server-Sent Events: mantém a lista de assinantes, envia cada snapshot a todos,
// manda um heartbeat periódico para proxies não derrubarem conexões ociosas e encerra tudo
// de forma limpa no desligamento.

const log = require('./logger');

class CanalSSE {
  constructor({ heartbeatMs }) {
    this.heartbeatMs = heartbeatMs;
    this.clientes = new Set();
    this.timerHeartbeat = null;
  }

  // Registra a resposta HTTP como assinante. `inicial` é enviado logo após conectar.
  adicionar(req, res, inicial) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Impede que proxies reversos (ex.: nginx) acumulem os eventos em buffer.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Reconexão automática do navegador após 3 s se a conexão cair.
    res.write('retry: 3000\n\n');
    if (inicial) res.write(`data: ${inicial}\n\n`);

    this.clientes.add(res);
    this.iniciarHeartbeat();
    log.debug('cliente SSE conectado', { requestId: req.id, clientes: this.clientes.size });

    req.on('close', () => {
      this.clientes.delete(res);
      if (this.clientes.size === 0) this.pararHeartbeat();
      log.debug('cliente SSE desconectado', { requestId: req.id, clientes: this.clientes.size });
    });
  }

  transmitir(json) {
    for (const res of this.clientes) res.write(`data: ${json}\n\n`);
  }

  iniciarHeartbeat() {
    if (this.timerHeartbeat || !this.heartbeatMs) return;
    this.timerHeartbeat = setInterval(() => {
      for (const res of this.clientes) res.write(': ping\n\n');
    }, this.heartbeatMs);
    this.timerHeartbeat.unref();
  }

  pararHeartbeat() {
    clearInterval(this.timerHeartbeat);
    this.timerHeartbeat = null;
  }

  // Desligamento: fecha todas as conexões abertas.
  encerrar() {
    this.pararHeartbeat();
    for (const res of this.clientes) res.end();
    this.clientes.clear();
  }
}

module.exports = { CanalSSE };
