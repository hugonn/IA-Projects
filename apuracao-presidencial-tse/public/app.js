// Painel de apuração: recebe snapshots do servidor local (SSE, com fallback para polling)
// e atualiza a interface sem recarregar a página.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const estado = {
    snapshot: null,
    recebidoEm: 0,
    intervaloMs: 6000,
    servidorOnline: false,
    regiaoSelecionada: null,
    modoMapa: 'regioes',
  };

  // ---------- Conexão com o servidor local ----------

  function receber(snapshot) {
    estado.snapshot = snapshot;
    estado.recebidoEm = Date.now();
    estado.intervaloMs = snapshot.meta.intervaloMs;
    estado.servidorOnline = true;
    renderizar();
  }

  let pollTimer = null;
  async function poll() {
    try {
      const r = await fetch('/api/apuracao', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      receber(await r.json());
    } catch {
      estado.servidorOnline = false;
      renderizarStatus();
    }
  }

  function conectar() {
    poll(); // render imediato
    if (!('EventSource' in window)) {
      pollTimer = setInterval(poll, 6000);
      return;
    }
    const es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
      clearInterval(pollTimer);
      pollTimer = null;
      receber(JSON.parse(ev.data));
    };
    es.onerror = () => {
      // EventSource reconecta sozinho; enquanto isso, tenta polling.
      estado.servidorOnline = false;
      renderizarStatus();
      if (!pollTimer) pollTimer = setInterval(poll, 6000);
    };
  }

  // ---------- Renderização ----------

  function renderizar() {
    const { nacional, regioes, meta } = estado.snapshot;
    renderizarStatus();
    $('#link-fonte').href = meta.fonte;
    $('#link-fonte').textContent = meta.modo === 'mock' ? 'simulador local (formato TSE)' : meta.fonte.replace(/^https?:\/\//, '');
    $('#btn-reset-mock').classList.toggle('hidden', meta.modo !== 'mock');

    if (nacional) {
      if (nacional.validos.votos > 0) U.fixarCores(nacional.candidatos);
      renderizarNacional(nacional);
    }
    $('#sem-dados').classList.toggle('hidden', Boolean(nacional?.candidatos.length));
    renderizarProjecao(estado.snapshot.projecao, nacional);
    renderizarVirada(estado.snapshot.projecao?.virada);
    mapa.atualizar(regioes);
    renderizarAtualizacoes();
    renderizarCardsRegioes(regioes);
    renderizarDetalhe();
    renderizarLegenda(regioes);
  }

  function definirTexto(el, texto) {
    if (el.textContent !== texto) {
      el.textContent = texto;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  // Contadores de atualizações automáticas e manuais (ciclos do servidor).
  function renderizarAtualizacoes() {
    const { atualizacoes, ultimoSucesso } = estado.snapshot.status;
    definirTexto($('#cont-auto'), U.num(atualizacoes.auto));
    definirTexto($('#cont-manual'), U.num(atualizacoes.manual));
    $('#ultima-atualizacao').textContent = U.hora(ultimoSucesso);
    $('#btn-refresh').title = `Buscar os dados do TSE agora · ${U.num(atualizacoes.auto)} atualizações automáticas e ${U.num(atualizacoes.manual)} manuais`;
  }

  function renderizarStatus() {
    const badge = $('#badge-status');
    const aviso = $('#aviso');
    const s = estado.snapshot;
    let classe = 'badge-neutro', texto = 'Conectando…', msg = '';

    if (!estado.servidorOnline) {
      classe = 'badge-erro';
      texto = 'Offline';
      msg = 'Sem conexão com o servidor local. Exibindo os últimos dados recebidos; reconectando automaticamente…';
    } else if (s) {
      const st = s.status;
      const erroBr = st.erros.find((e) => e.abrangencia === 'br');
      if (!s.nacional) {
        classe = 'badge-alerta';
        texto = 'Aguardando TSE';
        msg = `Ainda não foi possível obter dados do TSE${erroBr ? ` (${erroBr.erro})` : ''}. Nova tentativa a cada ${s.meta.intervaloMs / 1000}s.`;
      } else {
        if (s.meta.modo === 'mock') { classe = 'badge-mock'; texto = 'Simulação'; }
        else if (s.nacional.totalizacaoFinal) { classe = 'badge-final'; texto = 'Final'; }
        else if (!s.nacional.totalizadoEm) { classe = 'badge-neutro'; texto = 'Aguardando apuração'; }
        else { classe = 'badge-vivo'; texto = 'Ao vivo'; }
        if (st.erros.length) {
          if (s.meta.modo !== 'mock') { classe = 'badge-alerta'; texto = 'Instável'; }
          const lista = st.erros.slice(0, 4).map((e) => `${e.abrangencia.toUpperCase()}: ${e.erro}`).join(' · ');
          msg = `${st.erros.length} de ${st.arquivos.total} arquivos falharam na última rodada (${lista}${st.erros.length > 4 ? ' …' : ''}). Mantendo os últimos dados válidos.`;
        }
      }
    }
    badge.className = `badge ${classe}`;
    badge.innerHTML = `<span class="dot"></span><span>${texto}</span>`;
    aviso.classList.toggle('hidden', !msg);
    $('#aviso-texto').textContent = msg;
  }

  function renderizarNacional(n) {
    $('#titulo-turno').textContent = `· ${n.turno}º turno`;
    definirTexto($('#pct-apurado'), U.pct(n.secoes.pct));
    $('#barra-apurado').style.width = `${n.secoes.pct}%`;
    $('#secoes-info').textContent = `${U.num(n.secoes.totalizadas)} de ${U.num(n.secoes.total)} seções totalizadas`;
    $('#totalizacao-info').textContent = n.totalizadoEm
      ? `Última totalização TSE: ${new Date(n.totalizadoEm).toLocaleString('pt-BR')}`
      : 'Totalização ainda não iniciada.';
    $('#badge-final').classList.toggle('hidden', !n.totalizacaoFinal);
    $('#validos-total').textContent = `${U.num(n.validos.votos)} válidos`;

    renderizarKpis([
      { id: 'validos', rotulo: 'Votos válidos', valor: n.validos.votos, pct: n.validos.pct, ref: 'do total', cor: 'bg-emerald-500' },
      { id: 'brancos', rotulo: 'Brancos', valor: n.brancos.votos, pct: n.brancos.pct, ref: 'do total', cor: 'bg-slate-300' },
      { id: 'nulos', rotulo: 'Nulos', valor: n.nulos.votos, pct: n.nulos.pct, ref: 'do total', cor: 'bg-rose-400' },
      { id: 'abstencoes', rotulo: 'Abstenções', valor: n.abstencao.votos, pct: n.abstencao.pct, ref: 'do eleitorado apurado', cor: 'bg-amber-400' },
    ]);
    renderizarCandidatos(n.candidatos);
    renderizarDisputa(n.candidatos);
  }

  // Barra 100% empilhada: largura de cada fatia = % dos votos válidos.
  function renderizarDisputa(cands) {
    const comVotos = cands.filter((c) => c.votos > 0);
    $('#disputa').classList.toggle('hidden', !comVotos.length);
    $('#disputa-barra').innerHTML = comVotos.map((c) =>
      `<div class="barra h-full" style="width:${c.pct}%;background:${U.cor(c.sqcand)}" title="${U.esc(U.titulo(c.nome))}: ${U.pct(c.pct)}%"></div>`
    ).join('') + '<div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/90 dark:bg-slate-950/90"></div>';

    // Diferença total de votos entre 1º e 2º colocados.
    const [a, b] = comVotos;
    $('#disputa-diferenca').innerHTML = a && b ? `
      <span class="text-slate-500 dark:text-slate-400">Diferença:</span>
      <b class="text-lg tabular-nums" data-diferenca>${U.num(a.votos - b.votos)}</b>
      <span class="text-slate-500 dark:text-slate-400">votos para ${U.esc(U.titulo(a.nome))} · ${U.pct(a.pct - b.pct)} p.p.</span>` : '';
  }

  function barraEmpilhada(cands) {
    return `<div class="relative h-3 rounded-full overflow-hidden flex bg-slate-200 dark:bg-white/10">
      ${cands.map((c) => `<div class="barra h-full" style="width:${c.pct}%;background:${U.cor(c.sqcand)}"></div>`).join('')}
      <div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/90 dark:bg-slate-950/90"></div>
    </div>`;
  }

  // Calculadora de virada: quanto o 2º colocado precisa dos votos restantes x quanto está recebendo.
  function renderizarVirada(v) {
    const painel = $('#painel-virada');
    painel.classList.toggle('hidden', !v || v.vantagem <= 0 && v.votosRestantes === 0);
    if (!v) return;
    const nomeL = U.esc(U.titulo(v.lider.nome)), nomeS = U.esc(U.titulo(v.segundo.nome));
    const corL = U.cor(v.lider.sqcand), corS = U.cor(v.segundo.sqcand);
    const concluido = v.votosRestantes === 0;

    let selo, conclusao;
    if (concluido) {
      selo = '<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">Apuração concluída</span>';
      conclusao = `${nomeL} terminou ${U.num(v.vantagem)} votos à frente.`;
    } else if (!v.possivel) {
      selo = '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">Virada impossível</span>';
      conclusao = `A vantagem de ${nomeL} já é maior que todos os eleitores das seções que faltam.`;
    } else if (v.diferencaPp > 0) {
      selo = '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300">Matematicamente possível</span>';
      conclusao = `Mantido o ritmo, ${nomeL} termina com ~${U.num(v.margemProjetada)} votos de vantagem. Para virar, ${nomeS} precisa ir <b>${U.pct(v.diferencaPp)} p.p.</b> melhor em todos os votos restantes do que vai hoje.`;
    } else {
      selo = '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">Ritmo indica virada</span>';
      conclusao = `No ritmo atual, ${nomeS} passa ${nomeL} e termina com ~${U.num(-v.margemProjetada)} votos de vantagem.`;
    }
    $('#virada-selo').innerHTML = selo;

    // Régua ampliada de 40% a 60% para diferenças de poucos pontos ficarem visíveis.
    const MIN = 40, MAX = 60;
    const pos = (x) => `${Math.max(0, Math.min(100, ((x - MIN) / (MAX - MIN)) * 100))}%`;
    const kpi = (rotulo, valor, sub, cls = '') => `
      <div class="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] p-3">
        <div class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">${rotulo}</div>
        <div class="mt-1 text-2xl font-extrabold tabular-nums ${cls}">${valor}</div>
        <div class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">${sub}</div>
      </div>`;

    $('#virada-resumo').innerHTML = concluido ? `<p class="text-sm">${conclusao}</p>` : `
      <div class="grid grid-cols-2 gap-2 sm:gap-3">
        <div class="rounded-xl border-2 p-3" style="border-color:${corL}">
          <div class="text-[11px] text-slate-500 dark:text-slate-400">Diferença total agora</div>
          <div class="mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums">${U.num(v.vantagem)}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">votos para ${nomeL}</div>
        </div>
        <div class="rounded-xl border-2 border-dashed p-3" style="border-color:${v.margemProjetada >= 0 ? corL : corS}">
          <div class="text-[11px] text-slate-500 dark:text-slate-400">Diferença projetada no final</div>
          <div class="mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums">~${U.num(Math.abs(v.margemProjetada))}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">votos para ${v.margemProjetada >= 0 ? nomeL : nomeS}</div>
        </div>
      </div>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        Faltam ~<b class="tabular-nums">${U.num(v.votosRestantes)}</b> votos válidos para os dois.
      </p>
      <div class="grid grid-cols-3 gap-2 sm:gap-3">
        ${kpi(`${nomeS} precisa de`, `${U.pct(v.precisaPct)}%`, 'dos votos restantes')}
        ${kpi('Está recebendo', `${U.pct(v.recebePct)}%`, 'ponderado pelo que falta em cada UF')}
        ${kpi('Diferença', `${v.diferencaPp > 0 ? '+' : ''}${U.pct(v.diferencaPp)}`, 'pontos percentuais', v.diferencaPp > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400')}
      </div>
      <div>
        <div class="relative h-9">
          <div class="absolute inset-x-0 top-3 h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div class="barra h-full" style="width:${pos(v.recebePct)};background:${corS}"></div>
          </div>
          <div class="absolute top-1 bottom-1 w-px bg-slate-400 dark:bg-slate-500" style="left:${pos(50)}"></div>
          <div class="absolute top-0 bottom-0 w-0.5 bg-amber-500" style="left:${pos(v.precisaPct)}"></div>
        </div>
        <div class="relative h-4 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          <span class="absolute left-0">${MIN}%</span>
          <span class="absolute -translate-x-1/2" style="left:${pos(50)}">50%</span>
          <span class="absolute right-0">${MAX}%</span>
        </div>
        <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" style="background:${corS}"></span>recebendo ${U.pct(v.recebePct)}%</span>
          <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-0.5 bg-amber-500"></span>necessário ${U.pct(v.precisaPct)}%</span>
        </div>
      </div>
      <p class="text-sm text-slate-700 dark:text-slate-200">${conclusao}</p>
      <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        Limite teórico: se todos os ${U.num(v.eleitoresRestantes)} eleitores das seções restantes votassem válido, ${nomeS} precisaria de ${U.pct(v.precisaTetoPct)}%.
        A virada só fica impossível quando a vantagem supera esse total.
        Conta: necessário = 50% + vantagem ÷ (2 × votos restantes).
      </p>`;

    // Barras divergentes: para a direita = votos líquidos do líder, para a esquerda = do 2º.
    $('#virada-legenda').innerHTML = `<span>◀ ${nomeS} ganha</span><span>${nomeL} ganha ▶</span>`;
    const max = Math.max(1, ...v.estados.map((e) => Math.abs(e.ganhoLider)));
    $('#virada-tabela').innerHTML = v.estados.filter((e) => e.restantes > 0).map((e) => {
      const largura = (Math.abs(e.ganhoLider) / max) * 50;
      const doLider = e.ganhoLider >= 0;
      return `<div class="grid grid-cols-[3.2rem_minmax(0,1fr)] sm:grid-cols-[9rem_6.8rem_minmax(0,1fr)] items-center gap-2 py-1.5 border-b border-slate-100 dark:border-white/5 text-xs">
        <div class="min-w-0">
          <span class="font-mono font-bold">${e.uf.toUpperCase()}</span>
          <span class="hidden sm:inline text-slate-500 dark:text-slate-400 truncate"> ${U.esc(e.nome)}</span>
          <div class="text-[10px] text-slate-400 tabular-nums">${U.pct1(e.pctApurado)}% apur.</div>
        </div>
        <div class="hidden sm:block text-[11px] tabular-nums text-slate-500 dark:text-slate-400 leading-tight">
          <div>falta ${U.num(e.restantes)}</div>
          <div><span style="color:${corL}">${U.pct1(e.pctLider)}</span> × ${U.pct1(e.pctSegundo)}</div>
        </div>
        <div class="relative h-6">
          <div class="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-white/15"></div>
          <div class="barra absolute top-1 bottom-1 ${doLider ? 'rounded-r' : 'rounded-l'}" style="${doLider ? 'left:50%' : 'right:50%'};width:${largura}%;background:${doLider ? corL : corS}"></div>
          <span class="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums whitespace-nowrap" style="${doLider ? 'right:calc(50% + 6px)' : 'left:calc(50% + 6px)'}">${U.num(Math.abs(e.ganhoLider))}</span>
        </div>
      </div>`;
    }).join('');
  }

  function renderizarProjecao(p, nacional) {
    const corpo = $('#projecao-corpo');
    const selo = $('#projecao-selo');
    if (!p || !p.disponivel) {
      selo.innerHTML = '';
      corpo.innerHTML = `<p class="text-slate-500 dark:text-slate-400">${U.esc(p?.motivo ?? 'Aguardando dados…')}</p>`;
      return;
    }
    const segundoTurno = nacional?.turno === 2;

    if (p.matematicamenteDefinido) {
      selo.innerHTML = `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">Matematicamente definido</span>`;
    } else {
      selo.innerHTML = `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">Estimativa · ${U.pct1(p.pctValidosApurados)}% dos votos apurados</span>`;
    }

    const linhaMetodo = (m) => {
      const topo = m.candidatos.slice(0, segundoTurno ? 2 : 3);
      const margem = m.candidatos[0].votos - (m.candidatos[1]?.votos ?? 0);
      let conclusao = '';
      if (!segundoTurno) {
        conclusao = m.candidatos[0].pct > 50
          ? `${U.esc(U.titulo(m.candidatos[0].nome))} venceria no 1º turno`
          : `Sem maioria absoluta: 2º turno entre ${U.esc(U.titulo(m.candidatos[0].nome))} e ${U.esc(U.titulo(m.candidatos[1].nome))}`;
      } else {
        conclusao = `${U.esc(U.titulo(m.candidatos[0].nome))} por ~${U.num(margem)} votos`;
      }
      const swing = m.swing
        ? `<span class="text-slate-400"> · variação vs 1º turno: ${m.candidatos.slice(0, 2).map((c) => `${U.esc(U.titulo(c.nome))} ${m.swing[c.sqcand] >= 0 ? '+' : ''}${U.pct1(m.swing[c.sqcand])} p.p.`).join(', ')}</span>`
        : '';
      return `<div>
        <div class="flex items-baseline justify-between gap-2 mb-1.5">
          <span class="font-semibold">${U.esc(m.nome)}</span>
        </div>
        ${barraEmpilhada(m.candidatos)}
        <div class="mt-2 grid gap-1">
          ${topo.map((c) => `<div class="flex items-center gap-2 tabular-nums">
            <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:${U.cor(c.sqcand)}"></span>
            <span class="truncate">${U.esc(U.titulo(c.nome))}</span>
            <span class="ml-auto text-xs text-slate-500 dark:text-slate-400">${U.num(c.votos)}</span>
            <b class="w-16 text-right text-base">${U.pct(c.pct)}%</b>
          </div>`).join('')}
        </div>
        <p class="mt-1.5 text-xs text-slate-600 dark:text-slate-300">→ ${conclusao}${swing}</p>
      </div>`;
    };

    const virada = p.virada && !p.matematicamenteDefinido
      ? `<p class="text-xs text-slate-500 dark:text-slate-400">Detalhes da virada na <a href="#painel-virada" class="underline decoration-dotted hover:text-sky-500">calculadora de virada</a>.</p>`
      : '';

    const aguardandoRef = p.referencia && !p.referencia.carregada
      ? '<p class="text-xs text-slate-400">Carregando o 1º turno para o segundo método…</p>' : '';

    corpo.innerHTML = `
      ${p.metodos.map(linhaMetodo).join('<hr class="border-slate-200 dark:border-white/10">')}
      ${aguardandoRef}
      ${virada}
      <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        Faltam ~${U.num(p.votosValidosRestantes)} votos válidos. Estimativa aritmética: supõe que, em cada estado,
        as seções que faltam votam como as já apuradas. Não é projeção oficial.
      </p>`;
  }

  function renderizarKpis(kpis) {
    const box = $('#kpis');
    for (const k of kpis) {
      let el = box.querySelector(`[data-kpi="${k.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'card p-4 flex flex-col';
        el.dataset.kpi = k.id;
        el.innerHTML = `
          <div class="flex items-center gap-2"><span class="h-2 w-2 rounded-full ${k.cor}"></span><span class="eyebrow">${k.rotulo}</span></div>
          <div class="mt-2 text-2xl font-extrabold tabular-nums" data-valor></div>
          <div class="mt-auto pt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums"><b class="text-slate-700 dark:text-slate-200" data-pct></b> ${k.ref}</div>`;
        box.appendChild(el);
      }
      definirTexto(el.querySelector('[data-valor]'), U.num(k.valor));
      el.querySelector('[data-pct]').textContent = `${U.pct(k.pct)}%`;
    }
  }

  function avatarHtml(c) {
    return `<div class="relative h-10 w-10 sm:h-14 sm:w-14 shrink-0 rounded-full overflow-hidden ring-2" data-avatar>
      <div class="absolute inset-0 grid place-items-center text-sm font-bold text-white" data-iniciais>${U.esc(U.iniciais(c.nome))}</div>
      ${c.foto ? `<img src="${U.esc(c.foto)}" alt="" loading="lazy" class="absolute inset-0 h-full w-full object-cover object-top" onerror="this.remove()" />` : ''}
    </div>`;
  }

  function seloSituacao(c) {
    if (c.situacao === 'Eleito') return '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white">Eleito</span>';
    if (c.situacao === '2º turno') return '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-300">2º turno</span>';
    return '';
  }

  function renderizarCandidatos(cands) {
    const ol = $('#lista-candidatos');
    const grande = cands.length <= 3;
    // FLIP: guarda posições antes de reordenar para animar trocas de posição.
    const antes = new Map([...ol.children].map((li) => [li.dataset.id, li.getBoundingClientRect().top]));

    cands.forEach((c, i) => {
      let li = ol.querySelector(`[data-id="${c.sqcand}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = c.sqcand;
        li.className = 'cand rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.03]';
        li.innerHTML = `
          <div class="flex items-center gap-2 sm:gap-3 ${grande ? 'p-3 sm:p-4' : 'p-2.5 sm:p-3'}">
            <span class="w-5 text-center text-xs sm:text-sm font-bold text-slate-400 tabular-nums" data-pos></span>
            ${avatarHtml(c)}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-bold truncate ${grande ? 'text-lg' : ''}">${U.esc(U.titulo(c.nome))}</span>
                <span data-selo></span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                <span class="font-mono font-bold text-slate-600 dark:text-slate-300">${U.esc(c.numero)}</span> · ${U.esc(c.partido)}${c.coligacao ? ` · ${U.esc(U.titulo(c.coligacao))}` : ''}${c.vice ? ` · Vice: ${U.esc(U.titulo(c.vice))}` : ''}
              </div>
              <div class="mt-2 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div class="barra h-full rounded-full" style="width:0%" data-barra></div>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="${grande ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-extrabold tabular-nums leading-none"><span data-pct></span><span class="text-base text-slate-400">%</span></div>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums" data-votos></div>
            </div>
          </div>`;
      }
      li.querySelector('[data-pos]').textContent = `${i + 1}º`;
      definirTexto(li.querySelector('[data-pct]'), U.pct(c.pct));
      li.querySelector('[data-votos]').textContent = `${U.num(c.votos)} votos`;
      const cor = U.cor(c.sqcand);
      li.querySelector('[data-barra]').style.width = `${c.pct}%`;
      li.querySelector('[data-barra]').style.background = cor;
      li.querySelector('[data-avatar]').style.setProperty('--tw-ring-color', cor);
      li.querySelector('[data-iniciais]').style.background = cor;
      li.querySelector('[data-selo]').innerHTML = seloSituacao(c);
      ol.appendChild(li); // appendChild move o elemento existente -> ordena
    });
    const ids = new Set(cands.map((c) => c.sqcand));
    [...ol.children].forEach((li) => { if (!ids.has(li.dataset.id)) li.remove(); });

    for (const li of ol.children) {
      const delta = (antes.get(li.dataset.id) ?? li.getBoundingClientRect().top) - li.getBoundingClientRect().top;
      if (!delta) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        li.style.transition = '';
        li.style.transform = '';
      }));
    }
  }

  function linhaRegiaoCand(c, i) {
    return `<div>
      <div class="flex items-center gap-2 text-sm">
        <span class="h-2.5 w-2.5 rounded-full shrink-0" style="background:${U.cor(c.sqcand)}"></span>
        <span class="truncate">${U.esc(U.titulo(c.nome))}</span>
        <span class="ml-auto font-bold tabular-nums">${U.pct(c.pct)}%</span>
      </div>
      <div class="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div class="barra h-full rounded-full" style="width:${c.pct}%;background:${U.cor(c.sqcand)}"></div>
      </div>
    </div>`;
  }

  function renderizarCardsRegioes(regioes) {
    const box = $('#cards-regioes');
    for (const r of regioes) {
      let el = box.querySelector(`[data-regiao="${r.id}"]`);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.regiao = r.id;
        el.className = 'card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
        el.addEventListener('click', () => selecionarRegiao(estado.regiaoSelecionada === r.id ? null : r.id));
        box.appendChild(el);
      }
      el.classList.toggle('ring-2', estado.regiaoSelecionada === r.id);
      el.classList.toggle('ring-sky-500', estado.regiaoSelecionada === r.id);
      const top2 = r.candidatos.slice(0, 2);
      el.innerHTML = `
        <div class="font-bold">${U.esc(r.nome)}</div>
        <div class="text-[10px] font-mono tracking-wide text-slate-500 dark:text-slate-400 truncate">${r.ufs.map((u) => u.toUpperCase()).join(' · ')}</div>
        <div class="mt-2 flex items-baseline gap-1">
          <span class="text-2xl font-extrabold tabular-nums">${U.pct(r.secoes.pct)}%</span>
          <span class="text-xs text-slate-500 dark:text-slate-400">apurado</span>
        </div>
        <div class="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div class="barra h-full rounded-full bg-slate-800 dark:bg-white" style="width:${r.secoes.pct}%"></div>
        </div>
        <div class="mt-3 space-y-2">${top2.map(linhaRegiaoCand).join('') || '<p class="text-xs text-slate-500">Sem dados</p>'}</div>
        <div class="mt-3 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">${U.num(r.secoes.totalizadas)} / ${U.num(r.secoes.total)} seções${r.ufsSemDados.length ? ` · <span class="text-amber-600 dark:text-amber-300">sem dados: ${r.ufsSemDados.map((u) => u.toUpperCase()).join(', ')}</span>` : ''}</div>`;
    }
  }

  function renderizarLegenda(regioes) {
    const item = (cor, texto) =>
      `<span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" style="background:${cor}"></span>${texto}</span>`;
    let html = '';
    if (estado.modoMapa === 'regioes') {
      html = regioes.map((r) => item(mapa.corRegiao(r.id), U.esc(r.nome))).join('');
    } else if (estado.modoMapa === 'apuracao') {
      html = `<span class="inline-flex items-center gap-2">0%<span class="h-2.5 w-28 rounded-sm" style="background:linear-gradient(90deg,rgb(100,116,139),rgb(16,185,129))"></span>100% das urnas apuradas</span>`;
    } else {
      // Quantas UFs cada candidato lidera.
      const lideres = new Map();
      for (const e of regioes.flatMap((r) => r.estados)) {
        if (!e.lider || e.lider.votos === 0) continue;
        const acc = lideres.get(e.lider.sqcand) ?? { ...e.lider, ufs: 0 };
        acc.ufs++;
        lideres.set(e.lider.sqcand, acc);
      }
      html = [...lideres.values()].sort((a, b) => b.ufs - a.ufs)
        .map((c) => item(U.cor(c.sqcand), `${U.esc(U.titulo(c.nome))} lidera em <b>${c.ufs}</b> UF${c.ufs > 1 ? 's' : ''}`)).join('')
        || '<span>Sem votos apurados ainda</span>';
    }
    $('#legenda-mapa').innerHTML = html + '<span class="ml-auto hidden sm:inline">Passe o mouse ou clique numa região</span>';
  }

  function renderizarDetalhe() {
    const id = estado.regiaoSelecionada;
    const r = estado.snapshot?.regioes.find((x) => x.id === id);
    $('#detalhe-regiao').classList.toggle('hidden', !r);
    if (!r) return;
    $('#detalhe-titulo').textContent = `${r.nome} · ${U.pct(r.secoes.pct)}% apurado`;
    const cel = (c) => c && c.votos > 0
      ? `<span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style="background:${U.cor(c.sqcand)}"></span>${U.esc(U.titulo(c.nome))} <b class="tabular-nums">${U.pct(c.pct)}%</b></span>`
      : '<span class="text-slate-400">—</span>';
    const linhas = r.estados.map((e) => `
      <tr class="border-b border-slate-100 dark:border-white/5">
        <td class="py-2 px-4 sm:px-2"><span class="font-mono text-xs font-bold text-slate-400 mr-2">${e.uf.toUpperCase()}</span>${U.esc(e.nome)}</td>
        <td class="py-2 px-2">
          <div class="flex items-center gap-2">
            <div class="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><div class="barra h-full bg-slate-800 dark:bg-white" style="width:${e.pctApurado}%"></div></div>
            <span class="w-14 text-right tabular-nums text-xs">${U.pct(e.pctApurado)}%</span>
          </div>
        </td>
        <td class="py-2 px-2">${cel(e.lider)}</td>
        <td class="py-2 px-2">${cel(e.segundo)}</td>
      </tr>`);
    const faltando = r.ufsSemDados.map((uf) => `<tr><td class="py-2 px-4 sm:px-2 text-slate-400" colspan="4"><span class="font-mono text-xs font-bold mr-2">${uf.toUpperCase()}</span>sem dados ainda</td></tr>`);
    $('#detalhe-corpo').innerHTML = [...linhas, ...faltando].join('');
  }

  function selecionarRegiao(id) {
    estado.regiaoSelecionada = id;
    mapa.selecionar(id);
    if (estado.snapshot) {
      renderizarCardsRegioes(estado.snapshot.regioes);
      renderizarDetalhe();
    }
    if (id && innerWidth < 1024) $('#detalhe-regiao').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Inicialização ----------

  const mapa = criarMapa($('#mapa'), { onSelecionar: selecionarRegiao });

  document.querySelectorAll('[data-modo-mapa]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-modo-mapa]').forEach((x) => x.classList.toggle('ativo', x === b));
    estado.modoMapa = b.dataset.modoMapa;
    mapa.definirModo(estado.modoMapa);
    if (estado.snapshot) renderizarLegenda(estado.snapshot.regioes);
  }));

  // Atualização manual: o servidor busca o TSE na hora e devolve o snapshot novo.
  $('#btn-refresh').addEventListener('click', async () => {
    const btn = $('#btn-refresh');
    btn.disabled = true;
    $('#icone-refresh').classList.add('girando');
    try {
      const r = await fetch('/api/atualizar', { method: 'POST' });
      if (!r.ok) throw new Error(r.status);
      receber(await r.json());
    } catch {
      estado.servidorOnline = false;
      renderizarStatus();
    } finally {
      btn.disabled = false;
      $('#icone-refresh').classList.remove('girando');
    }
  });

  $('#detalhe-fechar').addEventListener('click', () => selecionarRegiao(null));

  $('#btn-tema').addEventListener('click', () => {
    const escuro = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('tema', escuro ? 'escuro' : 'claro'); } catch {}
  });

  $('#btn-reset-mock').addEventListener('click', async () => {
    $('#lista-candidatos').innerHTML = '';
    await fetch('/api/mock/reset', { method: 'POST' }).catch(() => {});
    poll();
  });

  // Contagem regressiva até a próxima atualização automática do servidor.
  // Usa o relógio do servidor (servidorEm) como referência para não depender do relógio local.
  const anel = $('#anel-contagem');
  setInterval(() => {
    const s = estado.snapshot;
    const seg = $('#contagem-seg');
    if (!s || !estado.servidorOnline) { seg.textContent = '–'; return; }
    const proxima = s.status.proximaAutomatica;
    const restante = proxima
      ? Date.parse(proxima) - Date.parse(s.meta.servidorEm) - (Date.now() - estado.recebidoEm)
      : 0;
    if (restante <= 0) {
      // Ciclo em andamento no servidor: aguardando o próximo snapshot.
      seg.textContent = '…';
      anel.style.strokeDashoffset = '0';
      return;
    }
    seg.textContent = String(Math.ceil(restante / 1000));
    anel.style.strokeDashoffset = String(94.25 * (1 - Math.min(1, restante / estado.intervaloMs)));
  }, 200);

  conectar();
})();
