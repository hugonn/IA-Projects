// Acesso aos arquivos JSON de resultados do TSE.
//
// Estrutura das URLs (eleições 2026, cargo Presidente = c0001):
//   {base}/{ambiente}/ele{ano}/{eleicao}/dados/{uf}/{uf}-c0001-e{eleicao com 6 dígitos}-u.json
//   ex.: https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json
//        https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json
// Fotos dos candidatos:
//   {base}/{ambiente}/ele{ano}/{eleicao}/fotos/br/{sqcand}.jpeg

const { randomUUID } = require('node:crypto');
const { UFS } = require('./regioes');
const log = require('./logger');

const ARQUIVOS = ['br', ...UFS, 'zz'];

function urlArquivo(cfg, abrangencia) {
  const ele = String(cfg.eleicao).padStart(6, '0');
  return `${cfg.tseBaseUrl}/${cfg.ambiente}/ele${cfg.ano}/${cfg.eleicao}/dados/${abrangencia}/${abrangencia}-c0001-e${ele}-u.json`;
}

function urlFoto(cfg, sqcand) {
  return `${cfg.tseBaseUrl}/${cfg.ambiente}/ele${cfg.ano}/${cfg.eleicao}/fotos/br/${sqcand}.jpeg`;
}

// Respostas descartadas (erro, 304) precisam ter o corpo cancelado para liberar a conexão
// do pool interno do fetch (undici).
async function descartarCorpo(resp) {
  try {
    await resp.body?.cancel();
  } catch {
    // corpo já consumido ou conexão encerrada: nada a liberar
  }
}

// O TSE publica números como string, com vírgula decimal ("47,027772356").
function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// "05/10/2026" + "12:51:05" -> "2026-10-05T12:51:05" (ordenável como string)
function dataHora(d, h) {
  if (!d) return null;
  const [dia, mes, ano] = d.split('/');
  return `${ano}-${mes}-${dia}T${h || '00:00:00'}`;
}

// Converte o JSON bruto do TSE num formato enxuto usado pelo restante da aplicação.
function parseArquivo(json) {
  if (!json || !Array.isArray(json.carg) || !json.s || !json.v || !json.e) {
    throw new Error('JSON fora do formato esperado');
  }
  const cargo = json.carg.find((c) => c.cd === '1') ?? json.carg[0];
  const candidatos = [];
  for (const agr of cargo?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) {
        candidatos.push({
          sqcand: c.sqcand,
          numero: c.n,
          nome: c.nmu || c.nm,
          nomeCompleto: c.nm,
          partido: par.sg,
          coligacao: agr.tp === 'c' ? agr.nm : null,
          composicao: agr.com,
          vice: c.vs?.[0]?.nmu ?? null,
          votos: num(c.vap),
          pct: num(c.pvapn || c.pvap),
          situacao: c.st || '',
          eleito: c.st === 'Eleito',
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || Number(a.numero) - Number(b.numero));

  return {
    abrangencia: json.cdabr,
    eleicao: json.ele,
    turno: Number(json.t),
    totalizacaoFinal: json.tf === 's',
    geradoEm: dataHora(json.dg, json.hg),
    totalizadoEm: dataHora(json.dt, json.ht),
    secoes: { total: num(json.s.ts), totalizadas: num(json.s.st), pct: num(json.s.pstn || json.s.pst) },
    eleitorado: { total: num(json.e.te), apurado: num(json.e.est) },
    comparecimento: num(json.e.c),
    abstencao: num(json.e.a),
    votos: {
      total: num(json.v.tv),
      validos: num(json.v.vv),
      brancos: num(json.v.vb),
      nulos: num(json.v.tvn),
    },
    candidatos,
  };
}

// Busca periodicamente todos os arquivos (BR + 27 UFs + exterior), guardando sempre
// o último conteúdo válido de cada um. Falhas pontuais não apagam dados da tela.
class TsePoller {
  constructor(cfg) {
    this.cfg = cfg;
    this.cache = new Map(); // abrangencia -> { dados, etag, obtidoEm }
    this.erros = new Map(); // abrangencia -> { erro, em }
    this.ultimaTentativa = null;
    this.ultimoSucesso = null;
    this.ciclos = 0;
    this.contagem = { auto: 0, manual: 0 };
    this.ultimaOrigem = null;
    this.proximoEm = null; // timestamp da próxima atualização automática
    this.emAndamento = null;
    this.ouvintes = new Set();
    this.timer = null;
  }

  iniciar() {
    // Pequeno atraso para o Express estar ouvindo (necessário no modo mock).
    this.agendar(300);
  }

  parar() {
    clearTimeout(this.timer);
  }

  agendar(ms) {
    clearTimeout(this.timer);
    this.proximoEm = Date.now() + ms;
    this.timer = setTimeout(() => this.executar('auto'), ms);
  }

  // Executa um ciclo ('auto' pelo timer ou 'manual' pelo botão). Se já houver um ciclo
  // em andamento, devolve o mesmo em vez de disparar requisições em dobro.
  // Depois de qualquer ciclo, a próxima atualização automática volta a contar do zero.
  // `requestId` liga o ciclo à requisição HTTP que o pediu (atualização manual) nos logs
  // e é repassado ao TSE no cabeçalho X-Request-Id.
  executar(origem, requestId = randomUUID()) {
    if (this.emAndamento) return this.emAndamento;
    clearTimeout(this.timer);
    this.proximoEm = null;
    const inicio = Date.now();
    this.emAndamento = this.ciclo(origem, requestId)
      .finally(() => {
        this.emAndamento = null;
        this.agendar(Math.max(0, this.cfg.intervaloMs - (Date.now() - inicio)));
        for (const fn of this.ouvintes) fn();
      });
    return this.emAndamento;
  }

  limpar() {
    this.cache.clear();
    this.erros.clear();
  }

  aoAtualizar(fn) {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  async ciclo(origem, requestId) {
    const inicio = Date.now();
    this.ultimaTentativa = new Date().toISOString();
    this.ultimaOrigem = origem;
    this.contagem[origem]++;
    const resultados = await Promise.allSettled(ARQUIVOS.map((a) => this.buscar(a, requestId)));
    let sucessos = 0;
    resultados.forEach((r, i) => {
      const abr = ARQUIVOS[i];
      if (r.status === 'fulfilled') {
        sucessos++;
        this.erros.delete(abr);
      } else {
        this.erros.set(abr, { erro: r.reason?.message ?? String(r.reason), em: this.ultimaTentativa });
      }
    });
    if (sucessos > 0) this.ultimoSucesso = this.ultimaTentativa;
    this.ciclos++;

    const campos = {
      requestId, ciclo: this.ciclos, origem, ok: sucessos, total: ARQUIVOS.length, duracaoMs: Date.now() - inicio,
    };
    if (sucessos < ARQUIVOS.length) {
      const erros = Object.fromEntries([...this.erros].map(([abr, e]) => [abr, e.erro]));
      log.warn('ciclo com falhas', { ...campos, erros });
    } else if (origem === 'manual' || this.ciclos === 1 || this.ciclos % 10 === 0) {
      log.info('ciclo concluído', campos);
    } else {
      log.debug('ciclo concluído', campos);
    }
  }

  async buscar(abr, requestId) {
    const url = urlArquivo(this.cfg, abr);
    const anterior = this.cache.get(abr);
    const headers = { Accept: 'application/json', 'X-Request-Id': requestId };
    // Requisição condicional: se nada mudou o TSE responde 304 sem corpo.
    if (anterior?.etag) headers['If-None-Match'] = anterior.etag;

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(this.cfg.timeoutMs) })
      .catch((e) => {
        throw new Error(e.name === 'TimeoutError' ? `timeout (${this.cfg.timeoutMs} ms)` : `rede: ${e.cause?.code ?? e.message}`);
      });

    if (resp.status === 304 && anterior) {
      await descartarCorpo(resp);
      anterior.obtidoEm = Date.now();
      return anterior.dados;
    }
    if (!resp.ok) {
      await descartarCorpo(resp);
      throw new Error(`HTTP ${resp.status}`);
    }

    let dados;
    try {
      dados = parseArquivo(await resp.json());
    } catch (e) {
      throw new Error(`resposta inválida: ${e.message}`);
    }

    // CDNs podem devolver uma cópia mais antiga em nós diferentes: nunca regredir.
    if (anterior && dados.secoes.totalizadas < anterior.dados.secoes.totalizadas) {
      return anterior.dados;
    }

    this.cache.set(abr, { dados, etag: resp.headers.get('etag'), obtidoEm: Date.now() });
    return dados;
  }

  status() {
    return {
      ultimaTentativa: this.ultimaTentativa,
      ultimoSucesso: this.ultimoSucesso,
      arquivos: { total: ARQUIVOS.length, ok: ARQUIVOS.length - this.erros.size, emCache: this.cache.size },
      erros: [...this.erros].map(([abrangencia, e]) => ({ abrangencia, ...e })),
      ok: this.erros.size === 0 && this.cache.size > 0,
      atualizacoes: { ...this.contagem, total: this.ciclos, ultimaOrigem: this.ultimaOrigem },
      proximaAutomatica: this.proximoEm ? new Date(this.proximoEm).toISOString() : null,
      emAndamento: Boolean(this.emAndamento),
    };
  }
}

module.exports = { TsePoller, urlArquivo, urlFoto, parseArquivo, num, descartarCorpo, ARQUIVOS };
