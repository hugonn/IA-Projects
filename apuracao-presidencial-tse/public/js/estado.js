// Estado da aplicação no navegador, com notificação para os componentes.

const estado = {
  snapshot: null,
  recebidoEm: 0, // Date.now() local de quando o snapshot chegou
  servidorOnline: false,
  regiaoSelecionada: null,
  modoMapa: 'regioes',
};

const ouvintes = new Set();

export const obter = () => estado;

export function atualizar(parcial) {
  Object.assign(estado, parcial);
  for (const fn of ouvintes) fn(estado, parcial);
}

export function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
