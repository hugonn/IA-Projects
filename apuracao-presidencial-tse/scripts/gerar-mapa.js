// Gera public/js/mapa-brasil.js (contornos SVG das 27 UFs) a partir da malha oficial do IBGE.
//
// Uso:  node scripts/gerar-mapa.js            (baixa a malha do IBGE)
//       node scripts/gerar-mapa.js malha.json  (usa um GeoJSON já baixado)
//
// Fonte: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF

const fs = require('fs');
const path = require('path');

const URL_IBGE = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF';

// Código IBGE da UF -> sigla
const CODIGOS = {
  11: 'ro', 12: 'ac', 13: 'am', 14: 'rr', 15: 'pa', 16: 'ap', 17: 'to', 21: 'ma', 22: 'pi',
  23: 'ce', 24: 'rn', 25: 'pb', 26: 'pe', 27: 'al', 28: 'se', 29: 'ba', 31: 'mg', 32: 'es',
  33: 'rj', 35: 'sp', 41: 'pr', 42: 'sc', 43: 'rs', 50: 'ms', 51: 'mt', 52: 'go', 53: 'df',
};

const LARGURA = 1000;
const MARGEM = 10;

async function carregar() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const r = await fetch(URL_IBGE);
  if (!r.ok) throw new Error(`IBGE respondeu HTTP ${r.status}`);
  return r.json();
}

(async () => {
  const geo = await carregar();
  const poligonos = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

  // Projeção equiretangular corrigida pela latitude média (boa o bastante nesta escala).
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of geo.features) {
    for (const poli of poligonos(f.geometry)) {
      for (const [lon, lat] of poli[0]) {
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      }
    }
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const escala = (LARGURA - 2 * MARGEM) / ((maxLon - minLon) * k);
  const altura = Math.ceil((maxLat - minLat) * escala + 2 * MARGEM);
  const proj = ([lon, lat]) => [MARGEM + (lon - minLon) * k * escala, MARGEM + (maxLat - lat) * escala];

  const ufs = {};
  for (const f of geo.features) {
    const uf = CODIGOS[f.properties.codarea];
    if (!uf) continue;
    let d = '';
    let area = 0, cx = 0, cy = 0;
    for (const poli of poligonos(f.geometry)) {
      for (const anel of poli) {
        const pts = anel.map(proj);
        d += 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
      }
      // Centroide pela fórmula do polígono (só o anel externo).
      const pts = poli[0].map(proj);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const cruz = x0 * y1 - x1 * y0;
        area += cruz; cx += (x0 + x1) * cruz; cy += (y0 + y1) * cruz;
      }
    }
    ufs[uf] = { d, cx: +(cx / (3 * area)).toFixed(1), cy: +(cy / (3 * area)).toFixed(1), area: Math.abs(area / 2) };
  }

  const saida = path.join(__dirname, '..', 'public', 'js', 'mapa-brasil.js');
  const conteudo = `// Gerado por scripts/gerar-mapa.js a partir da malha do IBGE. Não editar à mão.
export const MAPA_BRASIL = ${JSON.stringify({ largura: LARGURA, altura, ufs })};
`;
  fs.writeFileSync(saida, conteudo);
  console.log(`${Object.keys(ufs).length} UFs -> ${saida} (${(conteudo.length / 1024).toFixed(0)} KB, viewBox 0 0 ${LARGURA} ${altura})`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
