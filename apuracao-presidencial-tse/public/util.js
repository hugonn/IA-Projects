// Utilitários compartilhados entre flag.js e app.js.
(function () {
  const nf = new Intl.NumberFormat('pt-BR');
  const pf = (casas) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const pf2 = pf(2);
  const pf1 = pf(1);

  const PALETA = ['#38bdf8', '#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#fb923c', '#94a3b8', '#f87171', '#2dd4bf', '#c084fc'];
  // Cores fixas por candidato (sqcand do TSE, igual nos dois turnos).
  // O preto usa uma variável CSS para ganhar contorno claro no tema escuro (ver styles.css).
  const CORES_FIXAS = {
    280002542548: '#dc2626', // Lula: vermelho
    280002551544: 'var(--cor-preto)', // Flávio Bolsonaro: preto
  };
  const cores = new Map(Object.entries(CORES_FIXAS));

  window.U = {
    num: (n) => nf.format(Math.round(n || 0)),
    pct: (n) => pf2.format(n || 0),
    pct1: (n) => pf1.format(n || 0),
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    // Cor estável por candidato durante a sessão. As cores são fixadas na ordem do ranking
    // nacional assim que houver votos (antes disso, cinza neutro).
    cor: (sqcand) => cores.get(sqcand) ?? '#64748b',
    fixarCores(candidatos) {
      for (const c of candidatos) {
        if (!cores.has(c.sqcand)) cores.set(c.sqcand, PALETA[(cores.size - Object.keys(CORES_FIXAS).length) % PALETA.length]);
      }
    },
    iniciais: (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join(''),
    // "LUIZ INÁCIO" -> "Luiz Inácio" (preposições em minúsculas)
    titulo: (s) => String(s || '').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase())
      .replace(/\s(Da|De|Do|Das|Dos|E)(?=\s)/g, (m) => m.toLowerCase()),
    hora: (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '--:--:--'),
  };
})();
