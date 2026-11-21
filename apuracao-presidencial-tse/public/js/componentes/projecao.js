// Projeção do resultado final (dois métodos) calculada no servidor.

import { $, h, texto, mostrar, definirEstilo, sincronizarLista } from '../dom.js';
import { num, pct, pct1, titulo } from '../formato.js';
import { cor } from '../cores.js';

// Barra 100% empilhada com marca nos 50%. Devolve o elemento e o contêiner das fatias.
export function criarBarraEmpilhada(altura = 'h-3') {
  const fatias = h('div', { class: 'flex h-full w-full' });
  const barra = h('div', { class: `relative ${altura} rounded-full overflow-hidden bg-slate-200 dark:bg-white/10`, 'aria-hidden': 'true' },
    fatias,
    h('div', { class: 'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/90 dark:bg-slate-950/90' }));
  return { barra, fatias };
}

export function atualizarFatias(fatias, candidatos) {
  sincronizarLista(fatias, candidatos, {
    chave: (c) => c.sqcand,
    criar: () => h('div', { class: 'barra h-full' }),
    atualizar: (no, c) => definirEstilo(no, { width: `${c.pct}%`, background: cor(c.sqcand) }),
  });
}

function criarMetodo() {
  const { barra, fatias } = criarBarraEmpilhada();
  const refs = {
    nome: h('h3', { class: 'font-semibold mb-1.5' }),
    barra,
    fatias,
    linhas: h('div', { class: 'mt-2 grid gap-1' }),
    conclusao: h('p', { class: 'mt-1.5 text-xs text-slate-600 dark:text-slate-300' }),
  };
  const bloco = h('article', { class: 'pt-4 first:pt-0 border-t first:border-t-0 border-slate-200 dark:border-white/10' },
    refs.nome, refs.barra, refs.linhas, refs.conclusao);
  bloco.refs = refs;
  return bloco;
}

function criarLinha() {
  const refs = {
    ponto: h('span', { class: 'h-2.5 w-2.5 rounded-full shrink-0', 'aria-hidden': 'true' }),
    nome: h('span', { class: 'truncate' }),
    votos: h('span', { class: 'ml-auto text-xs text-slate-500 dark:text-slate-400' }),
    pct: h('b', { class: 'w-16 text-right text-base' }),
  };
  const linha = h('div', { class: 'flex items-center gap-2 tabular-nums' }, refs.ponto, refs.nome, refs.votos, refs.pct);
  linha.refs = refs;
  return linha;
}

function conclusaoMetodo(m, segundoTurno) {
  const [a, b] = m.candidatos;
  let frase;
  if (!segundoTurno) {
    frase = a.pct > 50
      ? `${titulo(a.nome)} venceria no 1º turno`
      : `Sem maioria absoluta: 2º turno entre ${titulo(a.nome)} e ${titulo(b.nome)}`;
  } else {
    frase = `${titulo(a.nome)} por ~${num(a.votos - (b?.votos ?? 0))} votos`;
  }
  if (m.swing) {
    const variacoes = m.candidatos.slice(0, 2)
      .map((c) => `${titulo(c.nome)} ${m.swing[c.sqcand] >= 0 ? '+' : ''}${pct1(m.swing[c.sqcand])} p.p.`)
      .join(', ');
    frase += ` · variação vs 1º turno: ${variacoes}`;
  }
  return `→ ${frase}`;
}

export function criarProjecao() {
  const el = {
    selo: $('#projecao-selo'),
    mensagem: $('#projecao-mensagem'),
    metodos: $('#projecao-metodos'),
    carregandoRef: $('#projecao-ref'),
    linkVirada: $('#projecao-link-virada'),
    nota: $('#projecao-nota'),
    restantes: $('#projecao-restantes'),
  };

  function selo(p) {
    if (p.matematicamenteDefinido) {
      el.selo.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white';
      texto(el.selo, 'Matematicamente definido');
    } else {
      el.selo.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300';
      texto(el.selo, `Estimativa · ${pct1(p.pctValidosApurados)}% dos votos apurados`);
    }
  }

  return {
    atualizar(p, nacional) {
      const disponivel = Boolean(p?.disponivel);
      mostrar(el.mensagem, !disponivel);
      for (const no of [el.metodos, el.nota, el.selo]) mostrar(no, disponivel);
      if (!disponivel) {
        texto(el.mensagem, p?.motivo ?? 'Aguardando dados…');
        mostrar(el.carregandoRef, false);
        mostrar(el.linkVirada, false);
        return;
      }

      selo(p);
      const segundoTurno = nacional?.turno === 2;
      sincronizarLista(el.metodos, p.metodos, {
        chave: (m) => m.id,
        criar: criarMetodo,
        atualizar: (bloco, m) => {
          const { refs } = bloco;
          texto(refs.nome, m.nome);
          atualizarFatias(refs.fatias, m.candidatos);
          sincronizarLista(refs.linhas, m.candidatos.slice(0, segundoTurno ? 2 : 3), {
            chave: (c) => c.sqcand,
            criar: criarLinha,
            atualizar: (linha, c) => {
              definirEstilo(linha.refs.ponto, { background: cor(c.sqcand) });
              texto(linha.refs.nome, titulo(c.nome));
              texto(linha.refs.votos, num(c.votos));
              texto(linha.refs.pct, `${pct(c.pct)}%`);
            },
          });
          texto(refs.conclusao, conclusaoMetodo(m, segundoTurno));
        },
      });

      mostrar(el.carregandoRef, Boolean(p.referencia && !p.referencia.carregada));
      mostrar(el.linkVirada, Boolean(p.virada && !p.matematicamenteDefinido));
      texto(el.restantes, num(p.votosValidosRestantes));
    },
  };
}
