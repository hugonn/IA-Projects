// Formatação pt-BR (funções puras, testadas em tests/frontend.test.js).

const nf = new Intl.NumberFormat('pt-BR');
const pf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const num = (n) => nf.format(Math.round(n || 0));
export const pct = (n) => pf2.format(n || 0);
export const pct1 = (n) => pf1.format(n || 0);

export const iniciais = (nome) =>
  String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('');

// "LUIZ INÁCIO DA SILVA" -> "Luiz Inácio da Silva"
export const titulo = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase())
    .replace(/\s(Da|De|Do|Das|Dos|E)(?=\s)/g, (m) => m.toLowerCase());

export const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '--:--:--');

export const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');
