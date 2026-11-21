// Simulador do TSE para testes fora do período eleitoral.
//
// Gera, a cada requisição, arquivos no MESMO formato "-u.json" publicado pelo TSE em 2026,
// com uma apuração progressiva baseada no tempo desde o início da simulação.
// Candidatos, partidos e números são FICTÍCIOS.
//
// Rotas (montadas em /mock-tse):
//   GET  /oficial/ele{ano}/{eleicao}/dados/{uf}/{uf}-c0001-e{eleicao}-u.json
//   POST /reset   -> reinicia a apuração do zero

const express = require('express');
const { ESTADOS, REGIOES } = require('./regioes');

// Eleitorado aproximado por UF (mil eleitores) para proporções realistas.
const ELEITORADO_MIL = {
  ac: 600, al: 2400, am: 2700, ap: 560, ba: 11400, ce: 6900, df: 2200, es: 2900, go: 4900,
  ma: 5100, mg: 16300, ms: 2000, mt: 2500, pa: 6100, pb: 3100, pe: 7000, pi: 2600, pr: 8500,
  rj: 12800, rn: 2600, ro: 1250, rr: 370, rs: 8600, sc: 5600, se: 1700, sp: 34600, to: 1100,
  zz: 700,
};

const CANDIDATOS = [
  { n: '18', nm: 'ANA BEATRIZ MOREIRA', nmu: 'ANA MOREIRA', sg: 'PFA', par: 'PARTIDO DO FUTURO AMPLO', vice: 'JORGE AMADO LIMA', base: 41 },
  { n: '47', nm: 'CARLOS EDUARDO TAVARES', nmu: 'CARLOS TAVARES', sg: 'MRN', par: 'MOVIMENTO RENOVA NAÇÃO', vice: 'SÔNIA BRAGA', base: 40 },
  { n: '24', nm: 'HELENA SOUZA PRADO', nmu: 'HELENA PRADO', sg: 'PVS', par: 'PARTIDO VERDE SOCIAL', vice: 'OTÁVIO REIS', base: 7.5 },
  { n: '36', nm: 'JOÃO PEDRO ALENCAR', nmu: 'JOÃO ALENCAR', sg: 'UDP', par: 'UNIÃO DEMOCRÁTICA POPULAR', vice: 'CLARA MENDES', base: 5 },
  { n: '59', nm: 'MARINA COSTA LIMA', nmu: 'MARINA LIMA', sg: 'PLB', par: 'PARTIDO LIBERDADE BRASIL', vice: 'RUI FALCÃO NETO', base: 3.2 },
  { n: '71', nm: 'RICARDO NUNES FARIAS', nmu: 'RICARDO FARIAS', sg: 'NOVA', par: 'NOVA AURORA', vice: 'LÍVIA ROCHA', base: 1.8 },
  { n: '62', nm: 'LUÍSA FERNANDES DE PAULA', nmu: 'LUÍSA FERNANDES', sg: 'PTC', par: 'PARTIDO TRABALHO E CIDADANIA', vice: 'ANDRÉ VIANA', base: 0.9 },
  { n: '83', nm: 'PAULO ROBERTO DIAS', nmu: 'PAULO DIAS', sg: 'AVB', par: 'AVANÇA BRASIL', vice: 'TERESA LOPES', base: 0.6 },
];

// Viés regional (multiplicador por candidato, na ordem acima) e velocidade de apuração.
// Sul/Sudeste apuram mais rápido e favorecem o 2º candidato: provoca "virada" no meio da apuração.
const PERFIL_REGIAO = {
  norte: { vel: 0.72, vies: [1.0, 1.08, 1.1, 0.9, 1, 1, 1, 1] },
  nordeste: { vel: 0.82, vies: [1.38, 0.66, 0.9, 1.2, 1, 1, 1, 1] },
  'centro-oeste': { vel: 0.95, vies: [0.78, 1.28, 1.0, 0.8, 1.1, 1, 1, 1] },
  sudeste: { vel: 1.0, vies: [0.92, 1.1, 1.15, 1.0, 1.0, 1, 1, 1] },
  sul: { vel: 1.0, vies: [0.74, 1.34, 0.9, 0.85, 1.2, 1, 1, 1] },
  exterior: { vel: 0.6, vies: [1.0, 1.0, 1.3, 1.0, 1, 1, 1, 1] },
};

const REGIAO_DA_UF = Object.fromEntries(REGIOES.flatMap((r) => r.ufs.map((uf) => [uf, r.id])));
REGIAO_DA_UF.zz = 'exterior';

// Pseudoaleatório determinístico por chave (mesma UF -> mesmo "temperamento" sempre).
function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const fmtPct = (parte, total, casas = 2) =>
  (total > 0 ? (parte / total) * 100 : 0).toFixed(casas).replace('.', ',');

function agoraBrasilia() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}

class SimuladorApuracao {
  constructor({ turno = 1, duracaoMin = 8, eleicao = '6257' }) {
    this.turno = turno;
    this.eleicao = eleicao;
    this.duracaoMs = duracaoMin * 60_000;
    this.candidatos = turno === 2 ? CANDIDATOS.slice(0, 2) : CANDIDATOS;
    this.reset();
  }

  reset() {
    this.inicio = Date.now();
  }

  // Fração apurada de uma UF no instante atual (0..1), com curva desacelerando no fim.
  progresso(uf) {
    const perfil = PERFIL_REGIAO[REGIAO_DA_UF[uf]];
    const atraso = 0.03 + hash(uf + 'atraso') * 0.08; // UFs começam em momentos diferentes
    const vel = perfil.vel * (0.85 + hash(uf + 'vel') * 0.3);
    const t = (Date.now() - this.inicio) / this.duracaoMs;
    const x = Math.min(1, Math.max(0, (t - atraso) * vel * 1.25));
    return 1 - Math.pow(1 - x, 1.7);
  }

  // Totais numéricos de uma UF no instante atual.
  totaisUf(uf) {
    const p = this.progresso(uf);
    const eleitorado = ELEITORADO_MIL[uf] * 1000 + Math.round(hash(uf) * 999);
    const secoes = Math.round(eleitorado / 318);
    const st = Math.round(secoes * p);
    const est = Math.round(eleitorado * (st / secoes));

    const taxaComparecimento = 0.74 + hash(uf + 'comp') * 0.09;
    const c = Math.round(est * taxaComparecimento);
    const vb = Math.round(c * (0.012 + hash(uf + 'b') * 0.012));
    const tvn = Math.round(c * (0.022 + hash(uf + 'n') * 0.02));
    const vv = c - vb - tvn;

    // Participação de cada candidato: base * viés regional * variação suave da UF.
    // A variação depende só de p (curva contínua) para que os votos nunca diminuam.
    const vies = PERFIL_REGIAO[REGIAO_DA_UF[uf]].vies;
    const pesos = this.candidatos.map((cand, i) => {
      const fase = hash(uf + cand.n) * Math.PI * 2;
      const ruidoUf = 0.88 + hash(uf + cand.n + 'v') * 0.24;
      const oscilacao = 1 + 0.03 * (1 - p) * Math.sin(p * 5 + fase);
      return cand.base * vies[i] * ruidoUf * oscilacao;
    });
    const soma = pesos.reduce((a, b) => a + b, 0);
    const votos = pesos.map((w) => Math.floor((vv * w) / soma));
    votos[pesos.indexOf(Math.max(...pesos))] += vv - votos.reduce((a, b) => a + b, 0);

    return { ts: secoes, st, te: eleitorado, est, c, a: est - c, vb, tvn, vv, votos };
  }

  totaisBr() {
    const ufs = [...Object.keys(ESTADOS), 'zz'];
    const acc = { ts: 0, st: 0, te: 0, est: 0, c: 0, a: 0, vb: 0, tvn: 0, vv: 0, votos: this.candidatos.map(() => 0) };
    for (const uf of ufs) {
      const t = this.totaisUf(uf);
      for (const k of ['ts', 'st', 'te', 'est', 'c', 'a', 'vb', 'tvn', 'vv']) acc[k] += t[k];
      t.votos.forEach((v, i) => (acc.votos[i] += v));
    }
    return acc;
  }

  // Monta o JSON no formato oficial do TSE.
  arquivo(abr) {
    const br = this.totaisBr();
    const t = abr === 'br' ? br : this.totaisUf(abr);
    const brFinal = br.st === br.ts ? br : null;
    const agora = agoraBrasilia();

    // Situação só é definida quando a totalização nacional termina.
    const ordemBr = brFinal ? brFinal.votos.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]) : [];
    const situacao = (i) => {
      if (!brFinal) return '';
      const [v0, i0] = ordemBr[0];
      if (v0 / brFinal.vv > 0.5) return i === i0 ? 'Eleito' : 'Não eleito';
      return ordemBr.slice(0, 2).some(([, j]) => j === i) ? '2º turno' : 'Não eleito';
    };
    const ranking = t.votos.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);

    return {
      ele: this.eleicao, t: String(this.turno), f: 'o', sup: 'n', tpabr: abr === 'br' ? 'br' : 'uf', cdabr: abr,
      dg: agora.data, hg: agora.hora, idg: String(Math.floor(Date.now() / 1000)),
      dt: t.st > 0 ? agora.data : '', ht: t.st > 0 ? agora.hora : '',
      dv: 's', tf: t.st === t.ts ? 's' : 'n', and: t.st === t.ts ? 'f' : 'n',
      carg: [{
        cd: '1', nmn: 'Presidente', nmm: 'Presidente', nmf: 'Presidente', nv: '1', fed: [],
        agr: this.candidatos.map((cand, i) => ({
          n: `2800010${cand.n}000`, nm: cand.par, tp: 'i', com: cand.sg,
          tvtn: String(t.votos[i]), tvan: String(t.votos[i]),
          par: [{
            n: cand.n, sg: cand.sg, nm: cand.par, nfed: '', tvtn: String(t.votos[i]), tvan: String(t.votos[i]),
            cand: [{
              n: cand.n, sqcand: `9000000000${cand.n}`, nm: cand.nm, nmu: cand.nmu, dt: '01/01/1970',
              dvt: 'Válido', seq: String(ranking.indexOf(i) + 1),
              e: situacao(i) === 'Eleito' || situacao(i) === '2º turno' ? 's' : 'n', st: situacao(i),
              vap: String(t.votos[i]), pvap: fmtPct(t.votos[i], t.vv), pvapn: fmtPct(t.votos[i], t.vv, 9),
              vs: [{ tp: 'v', sqcand: `9000000001${cand.n}`, nm: cand.vice, nmu: cand.vice, sgp: cand.sg }],
            }],
          }],
        })),
      }],
      s: {
        ts: String(t.ts), st: String(t.st), pst: fmtPct(t.st, t.ts), pstn: fmtPct(t.st, t.ts, 9),
        snt: String(t.ts - t.st), psnt: fmtPct(t.ts - t.st, t.ts),
      },
      e: {
        te: String(t.te), est: String(t.est), pest: fmtPct(t.est, t.te), esnt: String(t.te - t.est),
        c: String(t.c), pc: fmtPct(t.c, t.est), a: String(t.a), pa: fmtPct(t.a, t.est),
      },
      v: {
        tv: String(t.c), vvc: String(t.vv), pvvc: fmtPct(t.vv, t.c), vv: String(t.vv), pvv: '100,00',
        vnom: String(t.vv), vb: String(t.vb), pvb: fmtPct(t.vb, t.c),
        tvn: String(t.tvn), ptvn: fmtPct(t.tvn, t.c), vn: String(t.tvn), vnt: '0', van: '0', vansj: '0',
      },
    };
  }
}

function criarRotasMock(cfg) {
  const sim = new SimuladorApuracao({ turno: cfg.turno, duracaoMin: cfg.mockDuracaoMin, eleicao: cfg.eleicao });
  const router = express.Router();
  const padrao = /^([a-z]{2})-c0001-e(\d{6})-u\.json$/;

  router.get('/:ambiente/:ciclo/:ele/dados/:uf/:arquivo', (req, res) => {
    const m = padrao.exec(req.params.arquivo);
    const uf = req.params.uf;
    const valido = m && m[1] === uf && (uf === 'br' || uf === 'zz' || ESTADOS[uf]);
    if (!valido) return res.status(404).type('xml').send('<Error><Code>NoSuchKey</Code></Error>');

    // Simula instabilidade típica de dia de eleição.
    const sorteio = Math.random();
    if (sorteio < cfg.mockFalhas) return res.status(503).send('Service Unavailable');
    if (sorteio < cfg.mockFalhas * 1.1) return setTimeout(() => res.json(sim.arquivo(uf)), cfg.timeoutMs + 1500);

    res.set('Cache-Control', 'no-store').json(sim.arquivo(uf));
  });

  // Sem fotos no mock: o frontend mostra o placeholder com as iniciais.
  router.get('/:ambiente/:ciclo/:ele/fotos/*', (req, res) => res.status(404).end());

  router.post('/reset', (req, res) => {
    sim.reset();
    res.json({ ok: true });
  });

  return { router, sim };
}

module.exports = { criarRotasMock, SimuladorApuracao };
