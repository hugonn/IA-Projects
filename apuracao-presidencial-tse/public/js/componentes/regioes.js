// Cartões das 5 regiões, tabela de estados da região selecionada e legenda do mapa.

import { $, h, texto, mostrar, definirEstilo, sincronizarLista } from '../dom.js';
import { num, pct, titulo } from '../formato.js';
import { cor, CORES_REGIAO } from '../cores.js';

function criarLinhaCandidato() {
  const refs = {
    ponto: h('span', { class: 'h-2.5 w-2.5 rounded-full shrink-0', 'aria-hidden': 'true' }),
    nome: h('span', { class: 'truncate' }),
    pct: h('span', { class: 'ml-auto font-bold tabular-nums' }),
    barra: h('span', { class: 'barra block h-full rounded-full' }),
  };
  const linha = h('span', { class: 'block' },
    h('span', { class: 'flex items-center gap-2 text-sm' }, refs.ponto, refs.nome, refs.pct),
    h('span', { class: 'mt-1 block h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden', 'aria-hidden': 'true' }, refs.barra));
  linha.refs = refs;
  return linha;
}

function atualizarLinhaCandidato(linha, c) {
  const { refs } = linha;
  definirEstilo(refs.ponto, { background: cor(c.sqcand) });
  texto(refs.nome, titulo(c.nome));
  texto(refs.pct, `${pct(c.pct)}%`);
  definirEstilo(refs.barra, { width: `${c.pct}%`, background: cor(c.sqcand) });
}

function criarCartao(r) {
  const refs = {
    pct: h('span', { class: 'text-2xl font-extrabold tabular-nums' }),
    barra: h('span', { class: 'barra block h-full rounded-full bg-slate-800 dark:bg-white' }),
    candidatos: h('span', { class: 'mt-3 block space-y-2' }),
    rodape: h('span', { class: 'mt-3 block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums' }),
    semDados: h('span', { class: 'text-amber-600 dark:text-amber-300' }),
  };
  // <button> só aceita conteúdo inline: os blocos são spans com display block.
  const botao = h('button', {
    type: 'button',
    class: 'card w-full h-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500',
  },
  h('span', { class: 'flex items-center gap-1.5 font-bold' },
    h('span', { class: 'h-2.5 w-2.5 rounded-sm', style: { background: CORES_REGIAO[r.id] }, 'aria-hidden': 'true' }), r.nome),
  h('span', { class: 'block text-[10px] font-mono tracking-wide text-slate-500 dark:text-slate-400 truncate', text: r.ufs.map((u) => u.toUpperCase()).join(' · ') }),
  h('span', { class: 'mt-2 flex items-baseline gap-1' }, refs.pct, h('span', { class: 'text-xs text-slate-500 dark:text-slate-400', text: 'apurado' })),
  h('span', { class: 'mt-1.5 block h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden', 'aria-hidden': 'true' }, refs.barra),
  refs.candidatos,
  refs.rodape);
  const artigo = h('article', {}, botao);
  artigo.refs = { ...refs, botao };
  return artigo;
}

function criarLinhaEstado() {
  const celulaCand = () => {
    const ponto = h('span', { class: 'h-2 w-2 rounded-full', 'aria-hidden': 'true' });
    const nome = h('span');
    const valor = h('b', { class: 'tabular-nums' });
    const vazio = h('span', { class: 'text-slate-400', text: '—' });
    const raiz = h('td', { class: 'py-2 px-2' }, h('span', { class: 'inline-flex items-center gap-1.5' }, ponto, nome, valor), vazio);
    return { raiz, ponto, nome, valor, vazio, conteudo: raiz.firstChild };
  };
  const refs = {
    uf: h('span', { class: 'font-mono text-xs font-bold text-slate-400 mr-2' }),
    nome: h('span'),
    barra: h('div', { class: 'barra h-full bg-slate-800 dark:bg-white' }),
    apurado: h('span', { class: 'w-14 text-right tabular-nums text-xs' }),
    lider: celulaCand(),
    segundo: celulaCand(),
  };
  const tr = h('tr', { class: 'border-b border-slate-100 dark:border-white/5' },
    h('th', { scope: 'row', class: 'py-2 px-4 sm:px-2 text-left font-normal' }, refs.uf, refs.nome),
    h('td', { class: 'py-2 px-2' },
      h('div', { class: 'flex items-center gap-2' },
        h('div', { class: 'h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden', 'aria-hidden': 'true' }, refs.barra),
        refs.apurado)),
    refs.lider.raiz,
    refs.segundo.raiz);
  tr.refs = refs;
  return tr;
}

function atualizarCelulaCand(cel, c) {
  const tem = Boolean(c && c.votos > 0);
  mostrar(cel.conteudo, tem);
  mostrar(cel.vazio, !tem);
  if (!tem) return;
  definirEstilo(cel.ponto, { background: cor(c.sqcand) });
  texto(cel.nome, `${titulo(c.nome)} `);
  texto(cel.valor, `${pct(c.pct)}%`);
}

export function criarRegioes({ aoSelecionar }) {
  const el = {
    cartoes: $('#cards-regioes'),
    detalhe: $('#detalhe-regiao'),
    titulo: $('#detalhe-titulo'),
    corpo: $('#detalhe-corpo'),
    fechar: $('#detalhe-fechar'),
    legenda: $('#legenda-mapa'),
    legendaItens: $('#legenda-itens'),
  };
  el.fechar.addEventListener('click', () => aoSelecionar(null));

  function atualizarCartoes(regioes, selecionada) {
    sincronizarLista(el.cartoes, regioes, {
      chave: (r) => r.id,
      criar: criarCartao,
      atualizar: (artigo, r) => {
        const { refs } = artigo;
        const ativo = selecionada === r.id;
        // Propriedade (e não addEventListener) para trocar o handler a cada atualização.
        refs.botao.onclick = () => aoSelecionar(ativo ? null : r.id);
        refs.botao.classList.toggle('ring-2', ativo);
        refs.botao.classList.toggle('ring-sky-500', ativo);
        refs.botao.setAttribute('aria-pressed', String(ativo));
        texto(refs.pct, `${pct(r.secoes.pct)}%`);
        definirEstilo(refs.barra, { width: `${r.secoes.pct}%` });
        sincronizarLista(refs.candidatos, r.candidatos.slice(0, 2), {
          chave: (c) => c.sqcand, criar: criarLinhaCandidato, atualizar: atualizarLinhaCandidato,
        });
        texto(refs.rodape, `${num(r.secoes.totalizadas)} / ${num(r.secoes.total)} seções`);
        if (r.ufsSemDados.length) {
          texto(refs.semDados, ` · sem dados: ${r.ufsSemDados.map((u) => u.toUpperCase()).join(', ')}`);
          refs.rodape.append(refs.semDados);
        } else {
          refs.semDados.remove();
        }
      },
    });
  }

  function atualizarDetalhe(regioes, selecionada) {
    const r = regioes.find((x) => x.id === selecionada);
    mostrar(el.detalhe, Boolean(r));
    if (!r) return;
    texto(el.titulo, `${r.nome} · ${pct(r.secoes.pct)}% apurado`);
    const linhas = [...r.estados, ...r.ufsSemDados.map((uf) => ({ uf, semDados: true }))];
    sincronizarLista(el.corpo, linhas, {
      chave: (e) => e.uf,
      criar: criarLinhaEstado,
      atualizar: (tr, e) => {
        const { refs } = tr;
        texto(refs.uf, e.uf.toUpperCase());
        texto(refs.nome, e.semDados ? 'sem dados ainda' : e.nome);
        definirEstilo(refs.barra, { width: `${e.semDados ? 0 : e.pctApurado}%` });
        texto(refs.apurado, e.semDados ? '—' : `${pct(e.pctApurado)}%`);
        atualizarCelulaCand(refs.lider, e.lider);
        atualizarCelulaCand(refs.segundo, e.segundo);
      },
    });
  }

  function atualizarLegenda(regioes, modo) {
    let itens;
    if (modo === 'regioes') {
      itens = regioes.map((r) => ({ chave: r.id, cor: CORES_REGIAO[r.id], texto: r.nome }));
    } else if (modo === 'apuracao') {
      itens = [{ chave: 'escala', gradiente: true, texto: '0% → 100% das urnas apuradas' }];
    } else {
      // Quantas UFs cada candidato lidera.
      const lideres = new Map();
      for (const e of regioes.flatMap((r) => r.estados)) {
        if (!e.lider || e.lider.votos === 0) continue;
        const acc = lideres.get(e.lider.sqcand) ?? { ...e.lider, ufs: 0 };
        acc.ufs++;
        lideres.set(e.lider.sqcand, acc);
      }
      itens = [...lideres.values()].sort((a, b) => b.ufs - a.ufs).map((c) => ({
        chave: c.sqcand, cor: cor(c.sqcand), texto: `${titulo(c.nome)} lidera em ${c.ufs} UF${c.ufs > 1 ? 's' : ''}`,
      }));
      if (!itens.length) itens = [{ chave: 'vazio', texto: 'Sem votos apurados ainda' }];
    }
    sincronizarLista(el.legendaItens, itens, {
      chave: (i) => `${modo}:${i.chave}`,
      criar: (i) => {
        const marca = h('span', { class: i.gradiente ? 'h-2.5 w-28 rounded-sm' : 'h-2.5 w-2.5 rounded-sm', 'aria-hidden': 'true' });
        if (i.gradiente) marca.style.background = 'linear-gradient(90deg, rgb(100,116,139), rgb(16,185,129))';
        const item = h('li', { class: 'inline-flex items-center gap-1.5' }, marca, h('span'));
        item.refs = { marca, texto: item.lastChild };
        return item;
      },
      atualizar: (item, i) => {
        mostrar(item.refs.marca, Boolean(i.cor || i.gradiente));
        if (i.cor) definirEstilo(item.refs.marca, { background: i.cor });
        texto(item.refs.texto, i.texto);
      },
    });
  }

  return {
    atualizar(regioes, { regiaoSelecionada, modoMapa }) {
      atualizarCartoes(regioes, regiaoSelecionada);
      atualizarDetalhe(regioes, regiaoSelecionada);
      atualizarLegenda(regioes, modoMapa);
    },
  };
}
