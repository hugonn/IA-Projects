// Lista de candidatos (reordenação animada), barra proporcional da disputa e diferença de votos.

import { $, h, texto, mostrar, definirEstilo, sincronizarLista } from '../dom.js';
import { num, pct, titulo, iniciais } from '../formato.js';
import { cor } from '../cores.js';
import { urlSegura } from '../contrato.js';

function seloSituacao(selo, situacao) {
  const estilos = {
    Eleito: 'bg-emerald-500 text-white',
    '2º turno': 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  };
  const classe = estilos[situacao];
  mostrar(selo, Boolean(classe));
  if (!classe) return;
  selo.className = `text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${classe}`;
  texto(selo, situacao);
}

function criarItem(c, grande) {
  const refs = {
    pos: h('span', { class: 'w-5 text-center text-xs sm:text-sm font-bold text-slate-400 tabular-nums' }),
    avatar: h('div', { class: 'relative h-10 w-10 sm:h-14 sm:w-14 shrink-0 rounded-full overflow-hidden ring-2', 'aria-hidden': 'true' }),
    iniciais: h('div', { class: 'absolute inset-0 grid place-items-center text-sm font-bold text-white', text: iniciais(c.nome) }),
    selo: h('span', { class: 'hidden' }),
    barra: h('div', { class: 'barra h-full rounded-full', style: { width: '0%' } }),
    pct: h('span'),
    votos: h('p', { class: 'mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums' }),
  };
  refs.avatar.append(refs.iniciais);
  const foto = urlSegura(c.foto);
  if (foto) {
    const img = h('img', { src: foto, alt: '', loading: 'lazy', class: 'absolute inset-0 h-full w-full object-cover object-top' });
    img.addEventListener('error', () => img.remove());
    refs.avatar.append(img);
  }

  const detalhes = [c.partido, c.coligacao && titulo(c.coligacao), c.vice && `Vice: ${titulo(c.vice)}`].filter(Boolean).join(' · ');
  const li = h('li', { class: 'cand rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.03]' },
    h('article', { class: `flex items-center gap-2 sm:gap-3 ${grande ? 'p-3 sm:p-4' : 'p-2.5 sm:p-3'}` },
      refs.pos,
      refs.avatar,
      h('div', { class: 'min-w-0 flex-1' },
        h('h3', { class: 'flex items-center gap-2 min-w-0' },
          h('span', { class: `font-bold truncate ${grande ? 'text-lg' : ''}`, text: titulo(c.nome) }),
          refs.selo),
        h('p', { class: 'text-xs text-slate-500 dark:text-slate-400 truncate' },
          h('span', { class: 'font-mono font-bold text-slate-600 dark:text-slate-300', text: c.numero }),
          ` · ${detalhes}`),
        h('div', { class: 'mt-2 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden', 'aria-hidden': 'true' }, refs.barra)),
      h('div', { class: 'text-right shrink-0' },
        h('p', { class: `${grande ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-extrabold tabular-nums leading-none` },
          refs.pct, h('span', { class: 'text-base text-slate-400', text: '%' })),
        refs.votos)));
  li.refs = refs;
  return li;
}

function atualizarItem(li, c, i) {
  const { refs } = li;
  const corCand = cor(c.sqcand);
  texto(refs.pos, `${i + 1}º`);
  texto(refs.pct, pct(c.pct), { destacar: true });
  texto(refs.votos, `${num(c.votos)} votos`);
  definirEstilo(refs.barra, { width: `${c.pct}%`, background: corCand });
  definirEstilo(refs.avatar, { '--tw-ring-color': corCand });
  definirEstilo(refs.iniciais, { background: corCand });
  seloSituacao(refs.selo, c.situacao);
}

// FLIP: anima a troca de posição medindo antes e depois da reordenação.
function animarReordenacao(lista, posicoesAntes) {
  for (const li of lista.children) {
    const antes = posicoesAntes.get(li.dataset.chave);
    if (antes === undefined) continue;
    const delta = antes - li.getBoundingClientRect().top;
    if (!delta) continue;
    li.style.transition = 'none';
    li.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      li.style.transition = '';
      li.style.transform = '';
    }));
  }
}

export function criarCandidatos() {
  const el = {
    lista: $('#lista-candidatos'),
    semDados: $('#sem-dados'),
    validos: $('#validos-total'),
    disputa: $('#disputa'),
    fatias: $('#disputa-fatias'),
    diferenca: $('#disputa-diferenca'),
    difVotos: $('#dif-votos'),
    difDescricao: $('#dif-descricao'),
  };

  function atualizarDisputa(cands) {
    const comVotos = cands.filter((c) => c.votos > 0);
    mostrar(el.disputa, comVotos.length > 0);
    sincronizarLista(el.fatias, comVotos, {
      chave: (c) => c.sqcand,
      criar: () => h('div', { class: 'barra h-full' }),
      atualizar: (no, c) => {
        definirEstilo(no, { width: `${c.pct}%`, background: cor(c.sqcand) });
        no.title = `${titulo(c.nome)}: ${pct(c.pct)}%`;
      },
    });
    const [a, b] = comVotos;
    mostrar(el.diferenca, Boolean(a && b));
    if (a && b) {
      texto(el.difVotos, num(a.votos - b.votos), { destacar: true });
      texto(el.difDescricao, `votos para ${titulo(a.nome)} · ${pct(a.pct - b.pct)} p.p.`);
    }
  }

  return {
    atualizar(n) {
      const cands = n?.candidatos ?? [];
      mostrar(el.semDados, cands.length === 0);
      if (!n) return;
      texto(el.validos, `${num(n.validos.votos)} válidos`);

      const grande = cands.length <= 3;
      const antes = new Map([...el.lista.children].map((li) => [li.dataset.chave, li.getBoundingClientRect().top]));
      sincronizarLista(el.lista, cands, {
        chave: (c) => c.sqcand,
        criar: (c) => criarItem(c, grande),
        atualizar: atualizarItem,
      });
      animarReordenacao(el.lista, antes);
      atualizarDisputa(cands);
    },
    limpar() {
      el.lista.replaceChildren();
    },
  };
}
