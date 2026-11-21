const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { SimuladorApuracao } = require('../server/mock');
const { parseArquivo } = require('../server/tse');
const { UFS } = require('../server/regioes');

const MINUTO = 60_000;
const AGORA = Date.now();

// O simulador avança com o relógio: congela o tempo para os arquivos serem do mesmo instante.
beforeEach(() => mock.method(Date, 'now', () => AGORA));
afterEach(() => mock.restoreAll());

// Coloca a simulação num instante fixo (fração da duração total).
function simEm(fracao, opcoes = {}) {
  const sim = new SimuladorApuracao({ turno: 1, duracaoMin: 8, eleicao: '6257', ...opcoes });
  sim.inicio = AGORA - fracao * 8 * MINUTO;
  return sim;
}

test('arquivo nacional é a soma das UFs e do exterior', () => {
  const sim = simEm(0.4);
  const br = parseArquivo(sim.arquivo('br'));
  const ufs = [...UFS, 'zz'].map((uf) => parseArquivo(sim.arquivo(uf)));
  const soma = (f) => ufs.reduce((a, d) => a + f(d), 0);
  assert.equal(br.secoes.total, soma((d) => d.secoes.total));
  assert.equal(br.secoes.totalizadas, soma((d) => d.secoes.totalizadas));
  assert.equal(br.votos.validos, soma((d) => d.votos.validos));
});

test('votos e seções nunca diminuem ao longo da apuração', () => {
  let anterior = null;
  for (let f = 0; f <= 1.6; f += 0.05) {
    const d = parseArquivo(simEm(f).arquivo('br'));
    if (anterior) {
      assert.ok(d.secoes.totalizadas >= anterior.secoes.totalizadas, `seções regrediram em ${f.toFixed(2)}`);
      for (const c of d.candidatos) {
        const antes = anterior.candidatos.find((x) => x.sqcand === c.sqcand).votos;
        assert.ok(c.votos >= antes, `votos de ${c.nome} regrediram em ${f.toFixed(2)}`);
      }
    }
    anterior = d;
  }
});

test('ao final, totalização fica completa e a situação é definida', () => {
  const d = parseArquivo(simEm(2).arquivo('br'));
  assert.equal(d.secoes.totalizadas, d.secoes.total);
  assert.equal(d.totalizacaoFinal, true);
  const situacoes = d.candidatos.map((c) => c.situacao);
  assert.ok(situacoes.includes('Eleito') || situacoes.filter((s) => s === '2º turno').length === 2);
});

test('2º turno simulado tem só dois candidatos', () => {
  const d = parseArquivo(simEm(0.5, { turno: 2, eleicao: '6258' }).arquivo('br'));
  assert.equal(d.turno, 2);
  assert.equal(d.candidatos.length, 2);
});
