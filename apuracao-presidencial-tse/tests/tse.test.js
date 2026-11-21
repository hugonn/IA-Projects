const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseArquivo, urlArquivo, urlFoto, num } = require('../server/tse');

const exemplo = require(path.join(__dirname, '..', 'mock', 'exemplo-br-c0001-e006257-u.json'));
const cfg = { tseBaseUrl: 'https://resultados.tse.jus.br', ambiente: 'oficial', ano: '2026', eleicao: '6258' };

test('monta a URL oficial do TSE com o código da eleição em 6 dígitos', () => {
  assert.equal(
    urlArquivo(cfg, 'br'),
    'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json'
  );
  assert.equal(
    urlArquivo(cfg, 'sp'),
    'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json'
  );
  assert.equal(urlFoto(cfg, '123'), 'https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/123.jpeg');
});

test('converte números do TSE com vírgula decimal', () => {
  assert.equal(num('47,027772356'), 47.027772356);
  assert.equal(num('56104503'), 56104503);
  assert.equal(num(''), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num('abc'), 0);
});

test('lê o JSON no formato -u.json e ordena candidatos por votos', () => {
  const d = parseArquivo(exemplo);
  assert.equal(d.abrangencia, 'br');
  assert.equal(d.turno, 1);
  assert.equal(d.secoes.total, Number(exemplo.s.ts));
  assert.equal(d.secoes.totalizadas, Number(exemplo.s.st));
  assert.equal(d.votos.validos, Number(exemplo.v.vv));
  assert.equal(d.candidatos.length, 8);
  for (let i = 1; i < d.candidatos.length; i++) {
    assert.ok(d.candidatos[i - 1].votos >= d.candidatos[i].votos, 'candidatos fora de ordem');
  }
  const somaCandidatos = d.candidatos.reduce((a, c) => a + c.votos, 0);
  assert.equal(somaCandidatos, d.votos.validos);
});

test('rejeita respostas fora do formato esperado', () => {
  assert.throws(() => parseArquivo(null));
  assert.throws(() => parseArquivo({ carg: [] }));
  assert.throws(() => parseArquivo('<Error>NoSuchKey</Error>'));
});
