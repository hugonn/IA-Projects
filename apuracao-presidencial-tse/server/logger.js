// Logs estruturados: uma linha JSON por evento, com timestamp, nível, mensagem e campos extras
// (como requestId). Erros e avisos vão para stderr; o restante para stdout.

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40, silencioso: 99 };
const minimo = NIVEIS[process.env.LOG_NIVEL] ?? NIVEIS.info;

function escrever(nivel, msg, campos = {}) {
  if (NIVEIS[nivel] < minimo) return;
  const linha = { ts: new Date().toISOString(), nivel, msg, ...campos };
  if (campos.erro instanceof Error) {
    linha.erro = { mensagem: campos.erro.message, stack: campos.erro.stack };
  }
  const saida = NIVEIS[nivel] >= NIVEIS.warn ? process.stderr : process.stdout;
  saida.write(JSON.stringify(linha) + '\n');
}

module.exports = {
  debug: (msg, campos) => escrever('debug', msg, campos),
  info: (msg, campos) => escrever('info', msg, campos),
  warn: (msg, campos) => escrever('warn', msg, campos),
  error: (msg, campos) => escrever('error', msg, campos),
};
