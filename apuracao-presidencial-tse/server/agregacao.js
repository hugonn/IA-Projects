// Monta o "snapshot" servido ao frontend: visão nacional + agregação por região.
// O TSE não publica arquivos por região, então somamos os arquivos das UFs.

const { REGIOES, ESTADOS } = require('./regioes');
const { urlFoto, urlArquivo } = require('./tse');
const { projetar } = require('./projecao');

const pct = (parte, total) => (total > 0 ? (parte / total) * 100 : 0);

function resumoNacional(br, cfg) {
  return {
    turno: br.turno,
    totalizacaoFinal: br.totalizacaoFinal,
    totalizadoEm: br.totalizadoEm,
    geradoEm: br.geradoEm,
    secoes: br.secoes,
    eleitorado: br.eleitorado,
    comparecimento: { votos: br.comparecimento, pct: pct(br.comparecimento, br.eleitorado.apurado) },
    abstencao: { votos: br.abstencao, pct: pct(br.abstencao, br.eleitorado.apurado) },
    validos: { votos: br.votos.validos, pct: pct(br.votos.validos, br.votos.total) },
    brancos: { votos: br.votos.brancos, pct: pct(br.votos.brancos, br.votos.total) },
    nulos: { votos: br.votos.nulos, pct: pct(br.votos.nulos, br.votos.total) },
    votosTotais: br.votos.total,
    candidatos: br.candidatos.map((c) => ({
      ...c,
      // Se o arquivo ainda não traz percentual (início da apuração), calculamos.
      pct: c.pct || pct(c.votos, br.votos.validos),
      // O simulador não tem fotos: o frontend usa as iniciais.
      foto: cfg.mock ? null : urlFoto(cfg, c.sqcand),
    })),
  };
}

function resumoRegiao(regiao, cache) {
  const secoes = { total: 0, totalizadas: 0 };
  let validos = 0;
  const porCandidato = new Map();
  const estados = [];
  const ufsSemDados = [];

  for (const uf of regiao.ufs) {
    const d = cache.get(uf)?.dados;
    if (!d) {
      ufsSemDados.push(uf);
      continue;
    }
    secoes.total += d.secoes.total;
    secoes.totalizadas += d.secoes.totalizadas;
    validos += d.votos.validos;
    for (const c of d.candidatos) {
      const acc = porCandidato.get(c.sqcand) ?? { sqcand: c.sqcand, numero: c.numero, nome: c.nome, partido: c.partido, votos: 0 };
      acc.votos += c.votos;
      porCandidato.set(c.sqcand, acc);
    }
    const [primeiro, segundo] = d.candidatos;
    const resumoCand = (c) => c && { sqcand: c.sqcand, nome: c.nome, votos: c.votos, pct: pct(c.votos, d.votos.validos) };
    estados.push({
      uf,
      nome: ESTADOS[uf],
      secoes: d.secoes,
      pctApurado: pct(d.secoes.totalizadas, d.secoes.total),
      validos: d.votos.validos,
      lider: resumoCand(primeiro),
      segundo: resumoCand(segundo),
    });
  }

  const candidatos = [...porCandidato.values()]
    .map((c) => ({ ...c, pct: pct(c.votos, validos) }))
    .sort((a, b) => b.votos - a.votos);

  return {
    id: regiao.id,
    nome: regiao.nome,
    ufs: regiao.ufs,
    ufsSemDados,
    secoes: { ...secoes, pct: pct(secoes.totalizadas, secoes.total) },
    validos,
    candidatos,
    estados: estados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

function montarSnapshot(poller, cfg, referencia) {
  const br = poller.cache.get('br')?.dados;
  return {
    meta: {
      modo: cfg.mock ? 'mock' : 'tse',
      ano: cfg.ano,
      eleicao: cfg.eleicao,
      fonte: urlArquivo(cfg, 'br'),
      intervaloMs: cfg.intervaloMs,
      servidorEm: new Date().toISOString(),
    },
    status: poller.status(),
    nacional: br ? resumoNacional(br, cfg) : null,
    regioes: REGIOES.map((r) => resumoRegiao(r, poller.cache)),
    projecao: projetar(poller.cache, referencia),
  };
}

module.exports = { montarSnapshot };
