const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projetar } = require('../server/projecao');
const { montarSnapshot } = require('../server/agregacao');

// Arquivo já convertido por parseArquivo, só com os campos usados nos cálculos.
function uf({ secoes, totalizadas, eleitorado, eleitoradoApurado, a, b }) {
  return {
    dados: {
      secoes: { total: secoes, totalizadas, pct: (totalizadas / secoes) * 100 },
      eleitorado: { total: eleitorado, apurado: eleitoradoApurado },
      comparecimento: a + b,
      abstencao: 0,
      votos: { total: a + b, validos: a + b, brancos: 0, nulos: 0 },
      candidatos: [
        { sqcand: 'A', numero: '1', nome: 'CANDIDATA A', partido: 'PA', votos: a },
        { sqcand: 'B', numero: '2', nome: 'CANDIDATO B', partido: 'PB', votos: b },
      ].sort((x, y) => y.votos - x.votos),
    },
  };
}

// Cenário calculado à mão:
//   AC: metade apurada, A 700 x B 300 -> faltam 1.000 válidos, divididos 70/30
//   AL: tudo apurado,   A 250 x B 750
//   Agora: B lidera por 100 (1.050 x 950). Projeção: A 1.650 x B 1.350.
function cenario() {
  return new Map([
    ['ac', uf({ secoes: 100, totalizadas: 50, eleitorado: 2000, eleitoradoApurado: 1000, a: 700, b: 300 })],
    ['al', uf({ secoes: 100, totalizadas: 100, eleitorado: 2000, eleitoradoApurado: 2000, a: 250, b: 750 })],
    ['br', uf({ secoes: 200, totalizadas: 150, eleitorado: 4000, eleitoradoApurado: 3000, a: 950, b: 1050 })],
  ]);
}

test('projeção pelo ritmo de cada UF', () => {
  const p = projetar(cenario(), null);
  const [primeiro, segundo] = p.metodos[0].candidatos;
  assert.equal(primeiro.sqcand, 'A');
  assert.equal(primeiro.votos, 1650);
  assert.equal(segundo.votos, 1350);
  assert.ok(Math.abs(primeiro.pct - 55) < 1e-9);
  assert.equal(p.votosValidosRestantes, 1000);
});

test('calculadora de virada', () => {
  const v = projetar(cenario(), null).virada;
  assert.equal(v.lider.sqcand, 'B');
  assert.equal(v.vantagem, 100);
  assert.equal(v.votosRestantes, 1000);
  // necessário = 50% + 100 / (2 x 1.000) = 55%
  assert.ok(Math.abs(v.precisaPct - 55) < 1e-9);
  // A recebe 70% do que falta (só AC tem votos restantes)
  assert.ok(Math.abs(v.recebePct - 70) < 1e-9);
  assert.ok(Math.abs(v.diferencaPp - -15) < 1e-9);
  // B termina 300 votos atrás
  assert.equal(v.margemProjetada, -300);
  assert.equal(v.possivel, true);
  assert.equal(v.eleitoresRestantes, 1000);
});

test('marca "matematicamente definido" quando a vantagem supera os eleitores restantes', () => {
  const cache = cenario();
  cache.set('ac', uf({ secoes: 100, totalizadas: 99, eleitorado: 2000, eleitoradoApurado: 1990, a: 700, b: 300 }));
  cache.set('br', uf({ secoes: 200, totalizadas: 199, eleitorado: 4000, eleitoradoApurado: 3990, a: 950, b: 1050 }));
  const p = projetar(cache, null);
  assert.equal(p.matematicamenteDefinido, true);
  assert.equal(p.virada.possivel, false);
});

test('sem votos apurados a projeção fica indisponível', () => {
  const cache = new Map([['ac', uf({ secoes: 100, totalizadas: 0, eleitorado: 2000, eleitoradoApurado: 0, a: 0, b: 0 })]]);
  assert.equal(projetar(cache, null).disponivel, false);
});

test('agregação regional soma as UFs da região', () => {
  const poller = { cache: cenario(), status: () => ({}) };
  const cfg = { mock: false, ano: '2026', eleicao: '6258', tseBaseUrl: 'https://x', ambiente: 'oficial', intervaloMs: 6000 };
  const snap = montarSnapshot(poller, cfg, null);
  const norte = snap.regioes.find((r) => r.id === 'norte');
  const nordeste = snap.regioes.find((r) => r.id === 'nordeste');
  assert.equal(norte.secoes.pct, 50); // só AC: 50 de 100 seções
  assert.equal(norte.ufsSemDados.length, 6);
  assert.equal(nordeste.candidatos[0].sqcand, 'B'); // AL: B 75%
  assert.equal(nordeste.candidatos[0].pct, 75);
});
