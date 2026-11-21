// Módulos do frontend que não dependem do DOM (formatação, contrato e cores).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const carregar = (modulo) => import(`../public/js/${modulo}`);

test('formatação pt-BR', async () => {
  const f = await carregar('formato.js');
  assert.equal(f.num(1234567.4), '1.234.567');
  assert.equal(f.pct(50.126), '50,13');
  assert.equal(f.pct1(49.96), '50,0');
  assert.equal(f.titulo('LUIZ INÁCIO LULA DA SILVA'), 'Luiz Inácio Lula da Silva');
  assert.equal(f.iniciais('FLAVIO BOLSONARO'), 'FB');
  assert.equal(f.hora(null), '--:--:--');
});

test('valida o contrato do snapshot antes de usar', async () => {
  const { validarSnapshot } = await carregar('contrato.js');
  const valido = { meta: { intervaloMs: 6000 }, status: { erros: [] }, regioes: [], nacional: null };
  assert.equal(validarSnapshot(valido), true);
  assert.equal(validarSnapshot({ ...valido, nacional: { candidatos: [] } }), true);
  assert.equal(validarSnapshot(null), false);
  assert.equal(validarSnapshot('texto'), false);
  assert.equal(validarSnapshot({ ...valido, regioes: {} }), false);
  assert.equal(validarSnapshot({ ...valido, meta: {} }), false);
  assert.equal(validarSnapshot({ ...valido, nacional: { candidatos: 'x' } }), false);
});

test('só aceita fotos com URL http(s)', async () => {
  const { urlSegura } = await carregar('contrato.js');
  assert.equal(urlSegura('https://resultados.tse.jus.br/x.jpeg'), 'https://resultados.tse.jus.br/x.jpeg');
  assert.equal(urlSegura('javascript:alert(1)'), null);
  assert.equal(urlSegura('data:image/png;base64,AAA'), null);
  assert.equal(urlSegura(null), null);
});

test('cores fixas de Lula e Flávio e paleta estável para os demais', async () => {
  const { cor, fixarCores } = await carregar('cores.js');
  assert.equal(cor('280002542548'), '#dc2626');
  assert.equal(cor('280002551544'), 'var(--cor-preto)');
  assert.equal(cor('desconhecido'), '#64748b');
  fixarCores([{ sqcand: 'a' }, { sqcand: 'b' }]);
  const corA = cor('a');
  fixarCores([{ sqcand: 'b' }, { sqcand: 'a' }]);
  assert.equal(cor('a'), corA);
  assert.notEqual(cor('a'), cor('b'));
});
