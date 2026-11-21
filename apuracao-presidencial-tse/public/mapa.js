// Mapa do Brasil em SVG (malha do IBGE, ver scripts/gerar-mapa.js) com as 27 UFs
// agrupadas nas 5 regiões. Passar o mouse destaca a região inteira; clicar seleciona.
// Modos de cor: "regioes" (cor fixa por região), "apuracao" (% de urnas apuradas por UF)
// e "lider" (cor do candidato que lidera em cada UF).
(function () {
  const REGIOES = {
    norte: { ufs: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'], cor: '#1f8a66', label: [360, 255] },
    nordeste: { ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'], cor: '#c0841f', label: [1000, 175], linha: true },
    'centro-oeste': { ufs: ['df', 'go', 'ms', 'mt'], cor: '#b0573a', label: [470, 525] },
    sudeste: { ufs: ['es', 'mg', 'rj', 'sp'], cor: '#3b7dd8', label: [1000, 760], linha: true },
    sul: { ufs: ['pr', 'rs', 'sc'], cor: '#8058d0', label: [300, 915], linha: true },
  };
  const REGIAO_DA_UF = Object.fromEntries(Object.entries(REGIOES).flatMap(([id, r]) => r.ufs.map((uf) => [uf, id])));

  // A área visível vai além do contorno do país para caber os cartões no oceano/vizinhos.
  const M = window.MAPA_BRASIL;
  const VB = { x: -30, y: 0, w: M.largura + 140, h: M.altura };
  const pctX = (x) => ((x - VB.x) / VB.w) * 100;
  const pctY = (y) => ((y - VB.y) / VB.h) * 100;

  // Centroide de cada região, ponderado pela área das UFs (destino das linhas-guia).
  const CENTRO = Object.fromEntries(Object.entries(REGIOES).map(([id, r]) => {
    let a = 0, x = 0, y = 0;
    for (const uf of r.ufs) { const e = M.ufs[uf]; a += e.area; x += e.cx * e.area; y += e.cy * e.area; }
    return [id, [x / a, y / a]];
  }));

  const SVG = `
<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" class="absolute inset-0 h-full w-full" role="img" aria-label="Mapa do Brasil dividido nas cinco regiões">
  <g id="camada-linhas">
    ${Object.entries(REGIOES).filter(([, r]) => r.linha).map(([id, r]) =>
      `<line x1="${r.label[0]}" y1="${r.label[1]}" x2="${CENTRO[id][0]}" y2="${CENTRO[id][1]}" class="mapa-linha" stroke-dasharray="4 5"/>
       <circle cx="${CENTRO[id][0]}" cy="${CENTRO[id][1]}" r="5" class="mapa-ponto"/>`).join('')}
  </g>
  <g id="camada-ufs">
    ${Object.entries(M.ufs).map(([uf, e]) =>
      `<path class="mapa-uf" data-uf="${uf}" data-regiao="${REGIAO_DA_UF[uf]}" d="${e.d}" fill-rule="evenodd"/>`).join('')}
  </g>
  <g id="camada-siglas" pointer-events="none">
    ${Object.entries(M.ufs).filter(([, e]) => e.area > 2500).map(([uf, e]) =>
      `<text x="${e.cx}" y="${e.cy}" class="mapa-sigla" text-anchor="middle" dominant-baseline="central">${uf.toUpperCase()}</text>`).join('')}
  </g>
</svg>`;

  // 0% -> cinza, 100% -> verde: escala sequencial para o modo "apuração".
  function corApuracao(p) {
    const t = Math.max(0, Math.min(1, p / 100));
    const de = [100, 116, 139], ate = [16, 185, 129];
    return `rgb(${de.map((c, i) => Math.round(c + (ate[i] - c) * t)).join(',')})`;
  }

  window.criarMapa = function (container, { onSelecionar }) {
    container.innerHTML = SVG;
    const tooltip = document.getElementById('tooltip');
    const caminhos = [...container.querySelectorAll('.mapa-uf')];
    const labels = new Map();
    let regioes = new Map();
    let estados = new Map();
    let modo = 'regioes';
    let hoverRegiao = null;
    let hoverUf = null;
    let selecionada = null;

    for (const [id, r] of Object.entries(REGIOES)) {
      const el = document.createElement('div');
      el.className = 'regiao-label absolute rounded-xl bg-slate-950/80 backdrop-blur-sm text-white border border-white/15 shadow-lg px-2 py-1 sm:px-3 sm:py-2 cursor-pointer';
      el.style.left = pctX(r.label[0]) + '%';
      el.style.top = pctY(r.label[1]) + '%';
      el.style.transform = 'translate(-50%, -50%)';
      el.dataset.regiao = id;
      container.appendChild(el);
      labels.set(id, el);
    }

    const entrar = (regiao, uf) => { hoverRegiao = regiao; hoverUf = uf; pintar(); };
    const sair = () => { hoverRegiao = null; hoverUf = null; pintar(); tooltip.classList.add('hidden'); };

    for (const el of [...caminhos, ...labels.values()]) {
      const id = el.dataset.regiao;
      const uf = el.dataset.uf ?? null;
      el.addEventListener('pointerenter', () => entrar(id, uf));
      el.addEventListener('pointerleave', sair);
      el.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') mostrarTooltip(id, uf, ev); });
      el.addEventListener('click', () => onSelecionar(id === selecionada ? null : id));
    }
    for (const el of labels.values()) {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelecionar(el.dataset.regiao); }
      });
      el.addEventListener('focus', () => entrar(el.dataset.regiao, null));
      el.addEventListener('blur', sair);
    }

    function corDaUf(uf) {
      const e = estados.get(uf);
      if (modo === 'apuracao') return e ? corApuracao(e.pctApurado) : corApuracao(0);
      if (modo === 'lider') return e?.lider && e.lider.votos > 0 ? U.cor(e.lider.sqcand) : '#64748b';
      return REGIOES[REGIAO_DA_UF[uf]].cor;
    }

    function pintar() {
      const foco = hoverRegiao ?? selecionada;
      for (const p of caminhos) {
        const reg = p.dataset.regiao;
        const ativo = reg === hoverRegiao || reg === selecionada;
        p.style.fill = corDaUf(p.dataset.uf);
        p.style.opacity = foco && !ativo ? '0.3' : '1';
        p.classList.toggle('uf-ativa', ativo);
        p.classList.toggle('uf-hover', p.dataset.uf === hoverUf);
      }
      // Traz a UF sob o mouse para cima, para a borda destacada não ficar escondida.
      const sob = hoverUf && caminhos.find((p) => p.dataset.uf === hoverUf);
      if (sob) sob.parentNode.appendChild(sob);
      for (const [id, el] of labels) {
        const ativo = id === hoverRegiao || id === selecionada;
        el.classList.toggle('ativo', ativo);
        el.classList.toggle('esmaecido', Boolean(foco) && !ativo);
      }
    }

    function linhaCandidato(c) {
      return `<div class="hidden sm:flex items-center gap-1.5 text-[11px] leading-4 tabular-nums">
        <span class="h-2 w-2 rounded-full shrink-0" style="background:${U.cor(c.sqcand)}"></span>
        <span class="truncate max-w-[88px] text-white/80">${U.esc(U.titulo(c.nome))}</span>
        <span class="ml-auto font-bold">${U.pct1(c.pct)}%</span>
      </div>`;
    }

    function conteudoLabel(id, r) {
      if (!r) return '';
      const top2 = r.candidatos.slice(0, 2).filter((c) => c.votos > 0);
      return `
        <div class="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide">
          <span class="h-2 w-2 rounded-sm shrink-0" style="background:${REGIOES[id].cor}"></span>${U.esc(r.nome)}
        </div>
        <div class="text-[10px] sm:text-xs text-white/75 tabular-nums whitespace-nowrap"><span class="font-bold text-white">${U.pct1(r.secoes.pct)}%</span> apurado</div>
        <div class="hidden sm:block my-1 h-1 w-28 rounded-full bg-white/15 overflow-hidden"><div class="h-full bg-white/90 barra" style="width:${r.secoes.pct}%"></div></div>
        ${top2.map(linhaCandidato).join('')}`;
    }

    function mostrarTooltip(id, uf, ev) {
      const r = regioes.get(id);
      if (!r) return;
      const e = uf && estados.get(uf);
      const top2 = r.candidatos.slice(0, 2);
      const candEstado = (c, i) => c && c.votos > 0
        ? `<div class="flex justify-between gap-2"><span class="truncate">${i}º ${U.esc(U.titulo(c.nome))}</span><b class="tabular-nums">${U.pct(c.pct)}%</b></div>` : '';
      tooltip.innerHTML = `
        <div class="w-64 rounded-xl border border-white/10 bg-slate-900/95 text-white shadow-2xl p-3 text-xs">
          ${e ? `
          <div class="mb-2 pb-2 border-b border-white/10">
            <div class="flex items-baseline justify-between"><span class="text-sm font-bold">${U.esc(e.nome)}</span><span class="font-mono text-white/50">${uf.toUpperCase()}</span></div>
            <div class="text-white/80"><b class="text-white tabular-nums">${U.pct(e.pctApurado)}%</b> apurado</div>
            ${candEstado(e.lider, 1)}${candEstado(e.segundo, 2)}
          </div>` : ''}
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-bold">Região ${U.esc(r.nome)}</span>
            <span class="text-white/60">${r.ufs.length} UFs</span>
          </div>
          <div class="mt-1 text-white/80"><span class="text-lg font-extrabold text-white tabular-nums">${U.pct(r.secoes.pct)}%</span> das urnas apuradas</div>
          <div class="text-white/50 tabular-nums">${U.num(r.secoes.totalizadas)} de ${U.num(r.secoes.total)} seções</div>
          <div class="mt-2 space-y-1.5">
            ${top2.map((c, i) => `
              <div>
                <div class="flex justify-between gap-2"><span class="truncate">${i + 1}º ${U.esc(U.titulo(c.nome))} <span class="text-white/50">${U.esc(c.partido)}</span></span><b class="tabular-nums">${U.pct(c.pct)}%</b></div>
                <div class="mt-0.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div class="h-full rounded-full" style="width:${c.pct}%;background:${U.cor(c.sqcand)}"></div></div>
                <div class="text-white/50 tabular-nums">${U.num(c.votos)} votos</div>
              </div>`).join('') || '<div class="text-white/60">Sem votos apurados ainda.</div>'}
          </div>
          ${r.ufsSemDados.length ? `<div class="mt-2 text-amber-300">Sem dados ainda: ${r.ufsSemDados.map((u) => u.toUpperCase()).join(', ')}</div>` : ''}
          <div class="mt-2 text-white/40">Clique para ver todos os estados</div>
        </div>`;
      tooltip.classList.remove('hidden');
      const w = 268, h = tooltip.offsetHeight;
      let x = ev.clientX + 16, y = ev.clientY + 16;
      if (x + w > innerWidth - 8) x = Math.max(8, ev.clientX - w - 16);
      if (y + h > innerHeight - 8) y = Math.max(8, ev.clientY - h - 16);
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    return {
      atualizar(lista) {
        regioes = new Map(lista.map((r) => [r.id, r]));
        estados = new Map(lista.flatMap((r) => r.estados.map((e) => [e.uf, e])));
        for (const [id, el] of labels) el.innerHTML = conteudoLabel(id, regioes.get(id));
        pintar();
      },
      definirModo(m) { modo = m; pintar(); },
      selecionar(id) { selecionada = id; pintar(); },
      corRegiao: (id) => REGIOES[id].cor,
    };
  };
})();
