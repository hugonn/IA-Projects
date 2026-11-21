// Configuração via argumentos de linha de comando (--chave=valor) ou variáveis de ambiente.
// Argumentos têm prioridade sobre o ambiente.

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.length ? v.join('=') : 'true'];
    })
);

const opt = (arg, envName, padrao) => args[arg] ?? process.env[envName] ?? padrao;

// Códigos oficiais das eleições de 2026 (Presidente), obtidos em
// https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
const ELEICOES_PRESIDENTE = {
  2026: { 1: '6257', 2: '6258' },
  2022: { 1: '544', 2: '545' },
};

const mock = opt('mock', 'MODO_MOCK', 'false') === 'true';
const ano = String(opt('ano', 'ANO', '2026'));
// TSE real: padrão 2º turno (25/10/2026). Mock: padrão 1º turno (mais candidatos para testar).
const turno = Number(opt('turno', 'TURNO', mock ? '1' : '2'));
const eleicao = String(opt('eleicao', 'ELEICAO', ELEICOES_PRESIDENTE[ano]?.[turno] ?? '6258'));
const port = Number(opt('porta', 'PORT', '3000'));

module.exports = {
  port,
  mock,
  ano,
  turno,
  eleicao,
  // No 2º turno real, o 1º turno serve de referência para a projeção.
  referencia: !mock && eleicao === ELEICOES_PRESIDENTE[ano]?.[2] ? ELEICOES_PRESIDENTE[ano][1] : null,
  ambiente: opt('ambiente', 'TSE_AMBIENTE', 'oficial'),
  // Em modo mock o poller consulta o simulador servido pelo próprio Express,
  // percorrendo exatamente o mesmo caminho de código usado com o TSE real.
  tseBaseUrl: mock
    ? `http://127.0.0.1:${port}/mock-tse`
    : opt('tse', 'TSE_BASE_URL', 'https://resultados.tse.jus.br'),
  intervaloMs: Number(opt('intervalo', 'INTERVALO_MS', '6000')),
  timeoutMs: Number(opt('timeout', 'TIMEOUT_MS', '5000')),
  mockDuracaoMin: Number(opt('duracao', 'MOCK_DURACAO_MIN', '8')),
  mockFalhas: Number(opt('falhas', 'MOCK_FALHAS', '0.04')),
  // Comentário "ping" enviado às conexões SSE para proxies e navegadores não as derrubarem.
  sseHeartbeatMs: Number(opt('heartbeat', 'SSE_HEARTBEAT_MS', '20000')),
  // Tempo máximo para fechar conexões no encerramento antes de forçar a saída.
  shutdownTimeoutMs: Number(opt('shutdown-timeout', 'SHUTDOWN_TIMEOUT_MS', '5000')),
  limiteCorpo: opt('limite-corpo', 'LIMITE_CORPO', '100kb'),
};
