// Projeção do resultado final a partir dos dados parciais por UF.
//
// Método "ritmo": em cada UF, os votos que faltam seguem a mesma divisão já apurada ali.
//   Votos válidos restantes da UF = (válidos apurados / seções apuradas) x seções que faltam.
// Método "referencia" (só no 2º turno): parte do resultado do 1º turno em cada UF entre os
//   candidatos atuais e soma a variação média (swing) observada até agora no país.
//
// É uma estimativa aritmética simples, não uma projeção estatística oficial: assume que, dentro
// de cada UF, as seções que faltam se parecem com as já apuradas.

const { randomUUID } = require('node:crypto');
const { UFS, ESTADOS } = require('./regioes');
const { urlArquivo, parseArquivo, descartarCorpo } = require('./tse');
const log = require('./logger');

const TODAS = [...UFS, 'zz'];

// Resultado final do 1º turno por UF (carregado uma vez; tenta de novo até conseguir).
class Referencia {
  constructor(cfg, eleicao) {
    this.cfg = { ...cfg, eleicao };
    this.eleicao = eleicao;
    this.dados = new Map();
    this.carregando = null;
  }

  get completa() {
    return this.dados.size === TODAS.length;
  }

  async carregar(requestId = randomUUID()) {
    if (this.completa || this.carregando) return this.carregando;
    const faltando = TODAS.filter((uf) => !this.dados.has(uf));
    this.carregando = Promise.allSettled(faltando.map(async (uf) => {
      const r = await fetch(urlArquivo(this.cfg, uf), {
        headers: { Accept: 'application/json', 'X-Request-Id': requestId },
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      if (!r.ok) {
        await descartarCorpo(r);
        throw new Error(`HTTP ${r.status}`);
      }
      this.dados.set(uf, parseArquivo(await r.json()));
    })).then((resultados) => {
      const falhas = resultados.filter((x) => x.status === 'rejected').length;
      if (this.completa) log.info('referência da projeção carregada', { requestId, eleicao: this.eleicao });
      else log.warn('referência da projeção incompleta', { requestId, eleicao: this.eleicao, falhas });
    }).finally(() => {
      this.carregando = null;
    });
    return this.carregando;
  }
}

function projetar(cache, referencia) {
  const ufs = TODAS.map((uf) => ({ uf, d: cache.get(uf)?.dados })).filter((x) => x.d);
  if (!ufs.length) return null;

  // Candidatos (ordem e nomes vindos de qualquer arquivo; todos listam os mesmos).
  const candidatos = ufs[0].d.candidatos.map(({ sqcand, nome, partido, numero }) => ({ sqcand, nome, partido, numero }));
  const ids = candidatos.map((c) => c.sqcand);
  const votosDe = (d, id) => d.candidatos.find((c) => c.sqcand === id)?.votos ?? 0;

  // Médias nacionais para UFs sem nenhuma seção apurada.
  let vvApurado = 0, secApuradas = 0;
  const totalApurado = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const { d } of ufs) {
    vvApurado += d.votos.validos;
    secApuradas += d.secoes.totalizadas;
    for (const id of ids) totalApurado[id] += votosDe(d, id);
  }
  if (vvApurado === 0) return { disponivel: false, motivo: 'Aguardando os primeiros votos apurados.' };
  const vvPorSecaoBr = vvApurado / secApuradas;
  const shareBr = Object.fromEntries(ids.map((id) => [id, totalApurado[id] / vvApurado]));

  const base = ufs.map(({ uf, d }) => {
    const porSecao = d.secoes.totalizadas > 0 ? d.votos.validos / d.secoes.totalizadas : vvPorSecaoBr;
    const restantes = porSecao * (d.secoes.total - d.secoes.totalizadas);
    const share = Object.fromEntries(ids.map((id) => [id, d.votos.validos > 0 ? votosDe(d, id) / d.votos.validos : shareBr[id]]));
    return { uf, d, restantes, share };
  });
  const restantesTotal = base.reduce((a, b) => a + b.restantes, 0);
  // Limite superior seguro: eleitores das seções ainda não apuradas.
  const eleitoresRestantes = ufs.reduce((a, { d }) => a + Math.max(0, d.eleitorado.total - d.eleitorado.apurado), 0);

  const montar = (shareDe) => {
    const votos = Object.fromEntries(ids.map((id) => [id, totalApurado[id]]));
    for (const b of base) {
      const s = shareDe(b);
      for (const id of ids) votos[id] += b.restantes * s[id];
    }
    const soma = ids.reduce((a, id) => a + votos[id], 0);
    return candidatos
      .map((c) => ({ ...c, votos: Math.round(votos[c.sqcand]), pct: (votos[c.sqcand] / soma) * 100 }))
      .sort((a, b) => b.votos - a.votos);
  };

  const metodos = [{ id: 'ritmo', nome: 'Ritmo atual de cada UF', candidatos: montar((b) => b.share) }];

  // Método com referência do 1º turno + swing nacional ponderado pelos votos já apurados.
  if (referencia?.completa) {
    const shareRef = (uf) => {
      const r = referencia.dados.get(uf);
      const v = Object.fromEntries(ids.map((id) => [id, r ? votosDe(r, id) : 0]));
      const soma = ids.reduce((a, id) => a + v[id], 0);
      return Object.fromEntries(ids.map((id) => [id, soma > 0 ? v[id] / soma : shareBr[id]]));
    };
    const swing = Object.fromEntries(ids.map((id) => [id, 0]));
    let peso = 0;
    for (const b of base) {
      if (!b.d.votos.validos) continue;
      const ref = shareRef(b.uf);
      for (const id of ids) swing[id] += (b.share[id] - ref[id]) * b.d.votos.validos;
      peso += b.d.votos.validos;
    }
    for (const id of ids) swing[id] /= peso;
    metodos.push({
      id: 'referencia',
      nome: '1º turno de cada UF + variação observada',
      swing: Object.fromEntries(ids.map((id) => [id, swing[id] * 100])),
      candidatos: montar((b) => {
        const ref = shareRef(b.uf);
        const s = Object.fromEntries(ids.map((id) => [id, Math.max(0, ref[id] + swing[id])]));
        const soma = ids.reduce((a, id) => a + s[id], 0);
        return Object.fromEntries(ids.map((id) => [id, s[id] / soma]));
      }),
    });
  }

  // Quanto da fatia dos votos restantes teria de migrar do 1º para o 2º para empatar (método "ritmo").
  const [p1, p2] = metodos[0].candidatos;
  // Placar atual pelo arquivo nacional oficial (os arquivos das UFs podem estar alguns segundos defasados).
  const br = cache.get('br')?.dados;
  const atual = candidatos
    .map((c) => ({ ...c, votos: br ? votosDe(br, c.sqcand) : totalApurado[c.sqcand] }))
    .sort((a, b) => b.votos - a.votos);
  const vantagemAtual = atual[0].votos - (atual[1]?.votos ?? 0);
  const viradaPp = p2 && restantesTotal > 0 ? ((p1.votos - p2.votos) / (2 * restantesTotal)) * 100 : null;

  return {
    disponivel: true,
    virada: calcularVirada(base, atual, eleitoresRestantes, votosDe),
    votosValidosApurados: vvApurado,
    votosValidosRestantes: Math.round(restantesTotal),
    pctValidosApurados: (vvApurado / (vvApurado + restantesTotal)) * 100,
    lider: { sqcand: atual[0].sqcand, nome: atual[0].nome, vantagem: vantagemAtual },
    // Definido de fato só se a vantagem atual superar todos os eleitores das seções que faltam.
    matematicamenteDefinido: vantagemAtual > eleitoresRestantes,
    viradaPp,
    referencia: referencia ? { eleicao: referencia.eleicao, carregada: referencia.completa } : null,
    metodos,
  };
}

// Calculadora de virada entre o 1º e o 2º colocados de agora.
// Considera só os votos que vão para esses dois (no 2º turno, todos os válidos).
//   precisa = 50% + vantagem / (2 x votos restantes dos dois)
//   recebe  = fatia do 2º colocado nos votos restantes, ponderada pelo que falta em cada UF
//   diferenca = precisa - recebe (em pontos percentuais)
function calcularVirada(base, atual, eleitoresRestantes, votosDe) {
  const [lider, segundo] = atual;
  if (!segundo) return null;
  const vantagem = lider.votos - segundo.votos;

  let restantes = 0, recebeVotos = 0;
  const estados = base.map(({ uf, d, restantes: r }) => {
    const vl = votosDe(d, lider.sqcand), vs = votosDe(d, segundo.sqcand);
    // Fatia dos dois nos válidos da UF (1 no 2º turno) e divisão entre eles.
    const fatiaDois = d.votos.validos > 0 ? (vl + vs) / d.votos.validos : 1;
    const pctSegundo = vl + vs > 0 ? vs / (vl + vs) : 0.5;
    const r2 = r * fatiaDois;
    restantes += r2;
    recebeVotos += r2 * pctSegundo;
    return {
      uf,
      nome: ESTADOS[uf] ?? 'Exterior',
      pctApurado: d.secoes.total ? (d.secoes.totalizadas / d.secoes.total) * 100 : 0,
      restantes: Math.round(r2),
      pctLider: (1 - pctSegundo) * 100,
      pctSegundo: pctSegundo * 100,
      // Votos líquidos que o líder ganha (+) ou perde (-) nessa UF mantido o ritmo atual.
      ganhoLider: Math.round(r2 * (1 - 2 * pctSegundo)),
    };
  }).sort((a, b) => Math.abs(b.ganhoLider) - Math.abs(a.ganhoLider));

  const possivel = vantagem < eleitoresRestantes;
  const precisa = restantes > 0 ? 50 + (vantagem / (2 * restantes)) * 100 : null;
  const recebe = restantes > 0 ? (recebeVotos / restantes) * 100 : null;
  return {
    lider: { sqcand: lider.sqcand, nome: lider.nome, votos: lider.votos },
    segundo: { sqcand: segundo.sqcand, nome: segundo.nome, votos: segundo.votos },
    vantagem,
    votosRestantes: Math.round(restantes),
    eleitoresRestantes,
    possivel,
    precisaPct: precisa,
    // Mesmo cálculo supondo que todos os eleitores das seções restantes votem válido nos dois.
    precisaTetoPct: eleitoresRestantes > 0 ? 50 + (vantagem / (2 * eleitoresRestantes)) * 100 : null,
    recebePct: recebe,
    diferencaPp: precisa != null ? precisa - recebe : null,
    margemProjetada: vantagem + estados.reduce((a, e) => a + e.ganhoLider, 0),
    estados,
  };
}

module.exports = { projetar, Referencia };
