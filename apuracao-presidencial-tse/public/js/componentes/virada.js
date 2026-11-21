// Calculadora de virada entre o 1º e o 2º colocados (cálculos feitos no servidor).

import { $, h, texto, mostrar, definirEstilo, sincronizarLista } from '../dom.js';
import { num, pct, pct1, titulo } from '../formato.js';
import { cor } from '../cores.js';

// Régua ampliada de 40% a 60% para diferenças de poucos pontos ficarem visíveis.
const MIN = 40;
const MAX = 60;
const posicao = (x) => `${Math.max(0, Math.min(100, ((x - MIN) / (MAX - MIN)) * 100))}%`;

const SELOS = {
  concluida: ['Apuração concluída', 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'],
  impossivel: ['Virada impossível', 'bg-emerald-500 text-white'],
  possivel: ['Matematicamente possível', 'bg-amber-400/20 text-amber-700 dark:text-amber-300'],
  ritmo: ['Ritmo indica virada', 'bg-rose-500 text-white'],
};

function situacao(v) {
  if (v.votosRestantes === 0) return 'concluida';
  if (!v.possivel) return 'impossivel';
  return v.diferencaPp > 0 ? 'possivel' : 'ritmo';
}

// Frase de conclusão como nós de texto (trechos em negrito via <b>).
function conclusao(v, sit, nomeL, nomeS) {
  switch (sit) {
    case 'concluida': return [`${nomeL} terminou ${num(v.vantagem)} votos à frente.`];
    case 'impossivel': return [`A vantagem de ${nomeL} já é maior que todos os eleitores das seções que faltam.`];
    case 'possivel': return [
      `Mantido o ritmo, ${nomeL} termina com ~${num(v.margemProjetada)} votos de vantagem. Para virar, ${nomeS} precisa ir `,
      h('b', { text: `${pct(v.diferencaPp)} p.p.` }),
      ' melhor em todos os votos restantes do que vai hoje.',
    ];
    default: return [`No ritmo atual, ${nomeS} passa ${nomeL} e termina com ~${num(-v.margemProjetada)} votos de vantagem.`];
  }
}

function caixa(rotulo, { tracejada = false } = {}) {
  const valor = h('p', { class: 'mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums' });
  const sub = h('p', { class: 'text-[11px] text-slate-500 dark:text-slate-400' });
  const raiz = h('div', { class: `rounded-xl border-2 ${tracejada ? 'border-dashed' : ''} p-3` },
    h('p', { class: 'text-[11px] text-slate-500 dark:text-slate-400', text: rotulo }), valor, sub);
  return { raiz, valor, sub };
}

function indicador() {
  const rotulo = h('p', { class: 'text-[11px] text-slate-500 dark:text-slate-400 leading-tight' });
  const valor = h('p', { class: 'mt-1 text-2xl font-extrabold tabular-nums' });
  const sub = h('p', { class: 'text-[11px] text-slate-500 dark:text-slate-400 leading-tight' });
  const raiz = h('div', { class: 'rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] p-3' }, rotulo, valor, sub);
  return { raiz, rotulo, valor, sub };
}

function criarLinhaEstado() {
  const refs = {
    uf: h('span', { class: 'font-mono font-bold' }),
    nome: h('span', { class: 'hidden sm:inline text-slate-500 dark:text-slate-400 truncate' }),
    apurado: h('p', { class: 'text-[10px] text-slate-400 tabular-nums' }),
    falta: h('p'),
    pctLider: h('span'),
    pctSegundo: h('span'),
    barra: h('div', { class: 'barra absolute top-1 bottom-1' }),
    valor: h('span', { class: 'absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums whitespace-nowrap' }),
  };
  const linha = h('div', {
    class: 'grid grid-cols-[3.2rem_minmax(0,1fr)] sm:grid-cols-[9rem_6.8rem_minmax(0,1fr)] items-center gap-2 py-1.5 border-b border-slate-100 dark:border-white/5 text-xs',
    role: 'row',
  },
  h('div', { class: 'min-w-0', role: 'cell' }, refs.uf, ' ', refs.nome, refs.apurado),
  h('div', { class: 'hidden sm:block text-[11px] tabular-nums text-slate-500 dark:text-slate-400 leading-tight', role: 'cell' },
    refs.falta, h('p', {}, refs.pctLider, ' × ', refs.pctSegundo)),
  h('div', { class: 'relative h-6', role: 'cell' },
    h('div', { class: 'absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-white/15', 'aria-hidden': 'true' }),
    refs.barra, refs.valor));
  linha.refs = refs;
  return linha;
}

export function criarVirada() {
  const painel = $('#painel-virada');
  const selo = $('#virada-selo');
  const resumo = $('#virada-resumo');
  const tabela = $('#virada-tabela');
  const legendaS = $('#virada-legenda-segundo');
  const legendaL = $('#virada-legenda-lider');

  // Estrutura criada uma vez.
  const agora = caixa('Diferença total agora');
  const projetada = caixa('Diferença projetada no final', { tracejada: true });
  const faltam = h('b', { class: 'tabular-nums' });
  const precisa = indicador();
  const recebe = indicador();
  const diferenca = indicador();
  const preenchimento = h('div', { class: 'barra h-full' });
  const marcaPrecisa = h('div', { class: 'absolute top-0 bottom-0 w-0.5 bg-amber-500' });
  const legendaRecebe = h('span');
  const legendaPrecisa = h('span');
  const legendaCor = h('span', { class: 'h-2.5 w-2.5 rounded-sm', 'aria-hidden': 'true' });
  const frase = h('p', { class: 'text-sm text-slate-700 dark:text-slate-200' });
  const nota = h('p', { class: 'text-[11px] leading-snug text-slate-500 dark:text-slate-400' });
  const concluida = h('p', { class: 'text-sm hidden' });

  recebe.rotulo.textContent = 'Está recebendo';
  recebe.sub.textContent = 'ponderado pelo que falta em cada UF';
  precisa.sub.textContent = 'dos votos restantes';
  diferenca.rotulo.textContent = 'Diferença';
  diferenca.sub.textContent = 'pontos percentuais';

  const detalhes = h('div', { class: 'space-y-4' },
    h('div', { class: 'grid grid-cols-2 gap-2 sm:gap-3' }, agora.raiz, projetada.raiz),
    h('p', { class: 'text-sm text-slate-600 dark:text-slate-300' }, 'Faltam ~', faltam, ' votos válidos para os dois.'),
    h('div', { class: 'grid grid-cols-3 gap-2 sm:gap-3' }, precisa.raiz, recebe.raiz, diferenca.raiz),
    h('figure', {},
      h('div', { class: 'relative h-9', 'aria-hidden': 'true' },
        h('div', { class: 'absolute inset-x-0 top-3 h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden' }, preenchimento),
        h('div', { class: 'absolute top-1 bottom-1 w-px bg-slate-400 dark:bg-slate-500', style: { left: posicao(50) } }),
        marcaPrecisa),
      h('div', { class: 'relative h-4 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums', 'aria-hidden': 'true' },
        h('span', { class: 'absolute left-0', text: `${MIN}%` }),
        h('span', { class: 'absolute -translate-x-1/2', style: { left: posicao(50) }, text: '50%' }),
        h('span', { class: 'absolute right-0', text: `${MAX}%` })),
      h('figcaption', { class: 'mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400' },
        h('span', { class: 'inline-flex items-center gap-1.5' }, legendaCor, legendaRecebe),
        h('span', { class: 'inline-flex items-center gap-1.5' }, h('span', { class: 'h-2.5 w-0.5 bg-amber-500', 'aria-hidden': 'true' }), legendaPrecisa))),
    frase,
    nota);
  resumo.append(concluida, detalhes);

  let ultimaFrase = '';

  return {
    atualizar(v) {
      mostrar(painel, Boolean(v));
      if (!v) return;
      const nomeL = titulo(v.lider.nome);
      const nomeS = titulo(v.segundo.nome);
      const corL = cor(v.lider.sqcand);
      const corS = cor(v.segundo.sqcand);
      const sit = situacao(v);

      const [rotuloSelo, classeSelo] = SELOS[sit];
      selo.className = `text-[11px] font-bold px-2 py-0.5 rounded-full ${classeSelo}`;
      texto(selo, rotuloSelo);

      mostrar(concluida, sit === 'concluida');
      mostrar(detalhes, sit !== 'concluida');
      const nosFrase = conclusao(v, sit, nomeL, nomeS);
      const chaveFrase = nosFrase.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');
      if (chaveFrase !== ultimaFrase) {
        ultimaFrase = chaveFrase;
        (sit === 'concluida' ? concluida : frase).replaceChildren(...nosFrase);
      }

      texto(agora.valor, num(v.vantagem), { destacar: true });
      texto(agora.sub, `votos para ${nomeL}`);
      definirEstilo(agora.raiz, { borderColor: corL });
      const projLider = v.margemProjetada >= 0;
      texto(projetada.valor, `~${num(Math.abs(v.margemProjetada))}`);
      texto(projetada.sub, `votos para ${projLider ? nomeL : nomeS}`);
      definirEstilo(projetada.raiz, { borderColor: projLider ? corL : corS });
      texto(faltam, num(v.votosRestantes));

      texto(precisa.rotulo, `${nomeS} precisa de`);
      texto(precisa.valor, `${pct(v.precisaPct)}%`);
      texto(recebe.valor, `${pct(v.recebePct)}%`);
      texto(diferenca.valor, `${v.diferencaPp > 0 ? '+' : ''}${pct(v.diferencaPp)}`);
      diferenca.valor.className = `mt-1 text-2xl font-extrabold tabular-nums ${v.diferencaPp > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400'}`;

      definirEstilo(preenchimento, { width: posicao(v.recebePct), background: corS });
      definirEstilo(marcaPrecisa, { left: posicao(v.precisaPct) });
      definirEstilo(legendaCor, { background: corS });
      texto(legendaRecebe, `recebendo ${pct(v.recebePct)}%`);
      texto(legendaPrecisa, `necessário ${pct(v.precisaPct)}%`);
      texto(nota, `Limite teórico: se todos os ${num(v.eleitoresRestantes)} eleitores das seções restantes votassem válido, ${nomeS} precisaria de ${pct(v.precisaTetoPct)}%. A virada só fica impossível quando a vantagem supera esse total. Conta: necessário = 50% + vantagem ÷ (2 × votos restantes).`);

      // Barras divergentes: para a direita = votos líquidos do líder, para a esquerda = do 2º.
      texto(legendaS, `◀ ${nomeS} ganha`);
      texto(legendaL, `${nomeL} ganha ▶`);
      const estados = v.estados.filter((e) => e.restantes > 0);
      const maior = Math.max(1, ...estados.map((e) => Math.abs(e.ganhoLider)));
      sincronizarLista(tabela, estados, {
        chave: (e) => e.uf,
        criar: criarLinhaEstado,
        atualizar: (linha, e) => {
          const { refs } = linha;
          const doLider = e.ganhoLider >= 0;
          texto(refs.uf, e.uf.toUpperCase());
          texto(refs.nome, e.nome);
          texto(refs.apurado, `${pct1(e.pctApurado)}% apur.`);
          texto(refs.falta, `falta ${num(e.restantes)}`);
          texto(refs.pctLider, pct1(e.pctLider));
          definirEstilo(refs.pctLider, { color: corL });
          texto(refs.pctSegundo, pct1(e.pctSegundo));
          refs.barra.className = `barra absolute top-1 bottom-1 ${doLider ? 'rounded-r' : 'rounded-l'}`;
          refs.barra.style.left = doLider ? '50%' : '';
          refs.barra.style.right = doLider ? '' : '50%';
          definirEstilo(refs.barra, { width: `${(Math.abs(e.ganhoLider) / maior) * 50}%`, background: doLider ? corL : corS });
          texto(refs.valor, num(Math.abs(e.ganhoLider)));
          refs.valor.style.left = doLider ? '' : 'calc(50% + 6px)';
          refs.valor.style.right = doLider ? 'calc(50% + 6px)' : '';
          refs.valor.setAttribute('aria-label', `${doLider ? nomeL : nomeS} ganha ${num(Math.abs(e.ganhoLider))} votos`);
        },
      });
    },
  };
}
