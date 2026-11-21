// Resumo nacional: % de urnas apuradas e indicadores (válidos, brancos, nulos, abstenções).

import { $, h, texto, mostrar, definirEstilo } from '../dom.js';
import { num, pct, dataHora } from '../formato.js';

const KPIS = [
  { id: 'validos', rotulo: 'Votos válidos', ref: 'do total', cor: 'bg-emerald-500', dado: (n) => n.validos },
  { id: 'brancos', rotulo: 'Brancos', ref: 'do total', cor: 'bg-slate-300', dado: (n) => n.brancos },
  { id: 'nulos', rotulo: 'Nulos', ref: 'do total', cor: 'bg-rose-400', dado: (n) => n.nulos },
  { id: 'abstencoes', rotulo: 'Abstenções', ref: 'do eleitorado apurado', cor: 'bg-amber-400', dado: (n) => n.abstencao },
];

export function criarResumo() {
  const el = {
    pct: $('#pct-apurado'),
    barra: $('#barra-apurado'),
    secoes: $('#secoes-info'),
    totalizacao: $('#totalizacao-info'),
    final: $('#badge-final'),
    kpis: $('#kpis'),
  };

  // Os quatro indicadores são criados uma vez; depois só os números mudam.
  const kpis = KPIS.map((k) => {
    const valor = h('p', { class: 'mt-2 text-2xl font-extrabold tabular-nums' });
    const percentual = h('b', { class: 'text-slate-700 dark:text-slate-200' });
    el.kpis.append(h('article', { class: 'card p-4 flex flex-col' },
      h('h3', { class: 'flex items-center gap-2' },
        h('span', { class: `h-2 w-2 rounded-full ${k.cor}`, 'aria-hidden': 'true' }),
        h('span', { class: 'eyebrow', text: k.rotulo })),
      valor,
      h('p', { class: 'mt-auto pt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums' }, percentual, ` ${k.ref}`)));
    return { ...k, valor, percentual };
  });

  return {
    atualizar(n) {
      if (!n) return;
      texto(el.pct, pct(n.secoes.pct), { destacar: true });
      el.barra.parentElement.setAttribute('aria-valuenow', n.secoes.pct.toFixed(2));
      definirEstilo(el.barra, { width: `${n.secoes.pct}%` });
      texto(el.secoes, `${num(n.secoes.totalizadas)} de ${num(n.secoes.total)} seções totalizadas`);
      texto(el.totalizacao, n.totalizadoEm ? `Última totalização TSE: ${dataHora(n.totalizadoEm)}` : 'Totalização ainda não iniciada.');
      mostrar(el.final, n.totalizacaoFinal);
      for (const k of kpis) {
        const d = k.dado(n);
        texto(k.valor, num(d.votos), { destacar: true });
        texto(k.percentual, `${pct(d.pct)}%`);
      }
    },
  };
}
