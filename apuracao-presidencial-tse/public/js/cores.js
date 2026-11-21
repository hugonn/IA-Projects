// Cores dos candidatos e das regiões.

// Cores fixas por candidato (sqcand do TSE, igual nos dois turnos).
// O preto usa uma variável CSS para ganhar contorno claro no tema escuro (ver styles.css).
const CORES_FIXAS = {
  280002542548: '#dc2626', // Lula: vermelho
  280002551544: 'var(--cor-preto)', // Flávio Bolsonaro: preto
};
const PALETA = ['#38bdf8', '#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#fb923c', '#94a3b8', '#f87171', '#2dd4bf', '#c084fc'];
const NEUTRA = '#64748b';

export const CORES_REGIAO = {
  norte: '#1f8a66',
  nordeste: '#c0841f',
  'centro-oeste': '#b0573a',
  sudeste: '#3b7dd8',
  sul: '#8058d0',
};

const cores = new Map(Object.entries(CORES_FIXAS));

// Cor estável por candidato durante a sessão (cinza até haver votos).
export const cor = (sqcand) => cores.get(sqcand) ?? NEUTRA;

// Fixa as cores na ordem do ranking nacional assim que houver votos.
export function fixarCores(candidatos) {
  const fixas = Object.keys(CORES_FIXAS).length;
  for (const c of candidatos) {
    if (!cores.has(c.sqcand)) cores.set(c.sqcand, PALETA[(cores.size - fixas) % PALETA.length]);
  }
}
