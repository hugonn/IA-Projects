// Mapa do Brasil em SVG (malha do IBGE, ver scripts/gerar-mapa.js) com as 27 UFs agrupadas
// nas 5 regiões. Passar o mouse destaca a região inteira; clicar seleciona.
// Modos de cor: "regioes" (cor fixa por região), "apuracao" (% de urnas apuradas por UF)
// e "lider" (cor do candidato que lidera em cada UF).

import { $, h, s, texto, mostrar, definirEstilo, sincronizarLista } from '../dom.js';
import { num, pct, pct1, titulo } from '../formato.js';
import { cor, CORES_REGIAO } from '../cores.js';
import { MAPA_BRASIL as M } from '../mapa-brasil.js';

// Posição dos cartões (coordenadas do mapa) e se precisam de linha-guia até a região.
const REGIOES = {
  norte: { ufs: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'], label: [360, 255] },
  nordeste: { ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'], label: [975, 175], linha: true },
  'centro-oeste': { ufs: ['df', 'go', 'ms', 'mt'], label: [470, 525] },
  sudeste: { ufs: ['es', 'mg', 'rj', 'sp'], label: [975, 760], linha: true },
  sul: { ufs: ['pr', 'rs', 'sc'], label: [300, 915], linha: true },
};
const REGIAO_DA_UF = Object.fromEntries(Object.entries(REGIOES).flatMap(([id, r]) => r.ufs.map((uf) => [uf, id])));

// A área visível vai além do contorno do país para caber os cartões no oceano.
const VB = { x: -30, y: 0, w: M.largura + 140, h: M.altura };
const pctX = (x) => ((x - VB.x) / VB.w) * 100;
const pctY = (y) => ((y - VB.y) / VB.h) * 100;

// Centroide de cada região, ponderado pela área das UFs (destino das linhas-guia).
const CENTRO = Object.fromEntries(Object.entries(REGIOES).map(([id, r]) => {
  let a = 0, x = 0, y = 0;
  for (const uf of r.ufs) { const e = M.ufs[uf]; a += e.area; x += e.cx * e.area; y += e.cy * e.area; }
  return [id, [x / a, y / a]];
}));

// 0% -> cinza, 100% -> verde: escala sequencial do modo "urnas apuradas".
function corApuracao(p) {
  const t = Math.max(0, Math.min(1, p / 100));
  const de = [100, 116, 139], ate = [16, 185, 129];
  return `rgb(${de.map((c, i) => Math.round(c + (ate[i] - c) * t)).join(',')})`;
}

function construirSvg() {
  const linhas = Object.entries(REGIOES).filter(([, r]) => r.linha).flatMap(([id, r]) => [
    s('line', { x1: r.label[0], y1: r.label[1], x2: CENTRO[id][0], y2: CENTRO[id][1], class: 'mapa-linha', 'stroke-dasharray': '4 5' }),
    s('circle', { cx: CENTRO[id][0], cy: CENTRO[id][1], r: 5, class: 'mapa-ponto' }),
  ]);
  const caminhos = Object.entries(M.ufs).map(([uf, e]) =>
    s('path', { class: 'mapa-uf', d: e.d, 'fill-rule': 'evenodd', dataset: { uf, regiao: REGIAO_DA_UF[uf] } }));
  const siglas = Object.entries(M.ufs).filter(([, e]) => e.area > 2500).map(([uf, e]) =>
    s('text', { x: e.cx, y: e.cy, class: 'mapa-sigla', 'text-anchor': 'middle', 'dominant-baseline': 'central', text: uf.toUpperCase() }));

  const svg = s('svg', {
    viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true',
  },
  s('g', {}, ...linhas),
  s('g', {}, ...caminhos),
  s('g', { 'pointer-events': 'none' }, ...siglas));
  return { svg, caminhos };
}

function criarRotulo(id) {
  const refs = {
    nome: h('span'),
    apurado: h('b', { class: 'text-white' }),
    // Dentro de <button> só cabe conteúdo inline: spans com display block/flex.
    barra: h('span', { class: 'block h-full bg-white/90 barra' }),
    candidatos: h('span', { class: 'block' }),
  };
  const [x, y] = REGIOES[id].label;
  const botao = h('button', {
    type: 'button',
    class: 'regiao-label absolute text-left rounded-xl bg-slate-950/80 backdrop-blur-sm text-white border border-white/15 shadow-lg px-2 py-1 sm:px-3 sm:py-2 cursor-pointer',
    style: { left: `${pctX(x)}%`, top: `${pctY(y)}%`, transform: 'translate(-50%, -50%)' },
    dataset: { regiao: id },
  },
  h('span', { class: 'flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide' },
    h('span', { class: 'h-2 w-2 rounded-sm shrink-0', style: { background: CORES_REGIAO[id] }, 'aria-hidden': 'true' }),
    refs.nome),
  h('span', { class: 'block text-[10px] sm:text-xs text-white/75 tabular-nums whitespace-nowrap' }, refs.apurado, ' apurado'),
  h('span', { class: 'hidden sm:block my-1 h-1 w-28 rounded-full bg-white/15 overflow-hidden', 'aria-hidden': 'true' }, refs.barra),
  refs.candidatos);
  botao.refs = refs;
  return botao;
}

function criarLinhaRotulo() {
  const refs = {
    ponto: h('span', { class: 'h-2 w-2 rounded-full shrink-0', 'aria-hidden': 'true' }),
    nome: h('span', { class: 'truncate max-w-[88px] text-white/80' }),
    pct: h('span', { class: 'ml-auto font-bold' }),
  };
  const linha = h('span', { class: 'hidden sm:flex items-center gap-1.5 text-[11px] leading-4 tabular-nums' }, refs.ponto, refs.nome, refs.pct);
  linha.refs = refs;
  return linha;
}

// Conteúdo do tooltip (montado com createElement só quando muda a região/estado sob o mouse).
function conteudoTooltip(r, e, uf) {
  const linhaEstado = (c, i) => c && c.votos > 0 && h('div', { class: 'flex justify-between gap-2' },
    h('span', { class: 'truncate', text: `${i}º ${titulo(c.nome)}` }), h('b', { class: 'tabular-nums', text: `${pct(c.pct)}%` }));

  const blocoEstado = e && h('div', { class: 'mb-2 pb-2 border-b border-white/10' },
    h('div', { class: 'flex items-baseline justify-between' },
      h('span', { class: 'text-sm font-bold', text: e.nome }), h('span', { class: 'font-mono text-white/50', text: uf.toUpperCase() })),
    h('div', { class: 'text-white/80' }, h('b', { class: 'text-white tabular-nums', text: `${pct(e.pctApurado)}%` }), ' apurado'),
    linhaEstado(e.lider, 1), linhaEstado(e.segundo, 2));

  const top2 = r.candidatos.slice(0, 2);
  const candidatos = top2.length
    ? top2.map((c, i) => h('div', {},
      h('div', { class: 'flex justify-between gap-2' },
        h('span', { class: 'truncate' }, `${i + 1}º ${titulo(c.nome)} `, h('span', { class: 'text-white/50', text: c.partido })),
        h('b', { class: 'tabular-nums', text: `${pct(c.pct)}%` })),
      h('div', { class: 'mt-0.5 h-1.5 rounded-full bg-white/10 overflow-hidden' },
        h('div', { class: 'h-full rounded-full', style: { width: `${c.pct}%`, background: cor(c.sqcand) } })),
      h('div', { class: 'text-white/50 tabular-nums', text: `${num(c.votos)} votos` })))
    : [h('div', { class: 'text-white/60', text: 'Sem votos apurados ainda.' })];

  return h('div', { class: 'w-64 rounded-xl border border-white/10 bg-slate-900/95 text-white shadow-2xl p-3 text-xs' },
    blocoEstado,
    h('div', { class: 'flex items-baseline justify-between' },
      h('span', { class: 'text-sm font-bold', text: `Região ${r.nome}` }), h('span', { class: 'text-white/60', text: `${r.ufs.length} UFs` })),
    h('div', { class: 'mt-1 text-white/80' }, h('span', { class: 'text-lg font-extrabold text-white tabular-nums', text: `${pct(r.secoes.pct)}%` }), ' das urnas apuradas'),
    h('div', { class: 'text-white/50 tabular-nums', text: `${num(r.secoes.totalizadas)} de ${num(r.secoes.total)} seções` }),
    h('div', { class: 'mt-2 space-y-1.5' }, ...candidatos),
    r.ufsSemDados.length > 0 && h('div', { class: 'mt-2 text-amber-300', text: `Sem dados ainda: ${r.ufsSemDados.map((u) => u.toUpperCase()).join(', ')}` }),
    h('div', { class: 'mt-2 text-white/40', text: 'Clique para ver todos os estados' }));
}

export function criarMapa({ aoSelecionar }) {
  const container = $('#mapa');
  const tooltip = $('#tooltip');
  const { svg, caminhos } = construirSvg();
  container.append(svg);
  const rotulos = new Map(Object.keys(REGIOES).map((id) => [id, criarRotulo(id)]));
  container.append(...rotulos.values());

  let regioes = new Map();
  let estados = new Map();
  let modo = 'regioes';
  let hoverRegiao = null;
  let hoverUf = null;
  let selecionada = null;
  let alvoTooltip = '';

  const entrar = (regiao, uf) => { hoverRegiao = regiao; hoverUf = uf; pintar(); };
  const sair = () => { hoverRegiao = null; hoverUf = null; alvoTooltip = ''; pintar(); mostrar(tooltip, false); };

  function posicionarTooltip(ev) {
    const largura = 268, altura = tooltip.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + largura > innerWidth - 8) x = Math.max(8, ev.clientX - largura - 16);
    if (y + altura > innerHeight - 8) y = Math.max(8, ev.clientY - altura - 16);
    definirEstilo(tooltip, { left: `${x}px`, top: `${y}px` });
  }

  function mostrarTooltip(id, uf, ev) {
    const r = regioes.get(id);
    if (!r) return;
    const alvo = `${id}:${uf ?? ''}`;
    if (alvo !== alvoTooltip) {
      alvoTooltip = alvo;
      tooltip.replaceChildren(conteudoTooltip(r, uf && estados.get(uf), uf));
    }
    mostrar(tooltip, true);
    posicionarTooltip(ev);
  }

  for (const el of [...caminhos, ...rotulos.values()]) {
    const id = el.dataset.regiao;
    const uf = el.dataset.uf ?? null;
    el.addEventListener('pointerenter', () => entrar(id, uf));
    el.addEventListener('pointerleave', sair);
    el.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') mostrarTooltip(id, uf, ev); });
    el.addEventListener('click', () => aoSelecionar(id === selecionada ? null : id));
  }
  for (const botao of rotulos.values()) {
    botao.addEventListener('focus', () => entrar(botao.dataset.regiao, null));
    botao.addEventListener('blur', sair);
  }

  function corDaUf(uf) {
    const e = estados.get(uf);
    if (modo === 'apuracao') return corApuracao(e?.pctApurado ?? 0);
    if (modo === 'lider') return e?.lider && e.lider.votos > 0 ? cor(e.lider.sqcand) : '#64748b';
    return CORES_REGIAO[REGIAO_DA_UF[uf]];
  }

  function pintar() {
    const foco = hoverRegiao ?? selecionada;
    for (const p of caminhos) {
      const ativo = p.dataset.regiao === hoverRegiao || p.dataset.regiao === selecionada;
      definirEstilo(p, { fill: corDaUf(p.dataset.uf), opacity: foco && !ativo ? '0.3' : '1' });
      p.classList.toggle('uf-ativa', ativo);
      p.classList.toggle('uf-hover', p.dataset.uf === hoverUf);
    }
    // Traz a UF sob o mouse para cima, para a borda destacada não ficar escondida.
    const sob = hoverUf && caminhos.find((p) => p.dataset.uf === hoverUf);
    if (sob && sob !== sob.parentNode.lastChild) sob.parentNode.append(sob);
    for (const [id, botao] of rotulos) {
      const ativo = id === hoverRegiao || id === selecionada;
      botao.classList.toggle('ativo', ativo);
      botao.classList.toggle('esmaecido', Boolean(foco) && !ativo);
      botao.setAttribute('aria-pressed', String(id === selecionada));
    }
  }

  function atualizarRotulo(botao, r) {
    const { refs } = botao;
    texto(refs.nome, r.nome);
    texto(refs.apurado, `${pct1(r.secoes.pct)}%`);
    definirEstilo(refs.barra, { width: `${r.secoes.pct}%` });
    botao.setAttribute('aria-label', `Região ${r.nome}: ${pct1(r.secoes.pct)}% apurado. Ver estados.`);
    sincronizarLista(refs.candidatos, r.candidatos.slice(0, 2).filter((c) => c.votos > 0), {
      chave: (c) => c.sqcand,
      criar: criarLinhaRotulo,
      atualizar: (linha, c) => {
        definirEstilo(linha.refs.ponto, { background: cor(c.sqcand) });
        texto(linha.refs.nome, titulo(c.nome));
        texto(linha.refs.pct, `${pct1(c.pct)}%`);
      },
    });
  }

  return {
    atualizar(lista) {
      regioes = new Map(lista.map((r) => [r.id, r]));
      estados = new Map(lista.flatMap((r) => r.estados.map((e) => [e.uf, e])));
      for (const [id, botao] of rotulos) if (regioes.has(id)) atualizarRotulo(botao, regioes.get(id));
      alvoTooltip = ''; // dados novos: o tooltip aberto é remontado no próximo movimento
      pintar();
    },
    definirModo(m) { modo = m; pintar(); },
    selecionar(id) { selecionada = id; pintar(); },
  };
}
