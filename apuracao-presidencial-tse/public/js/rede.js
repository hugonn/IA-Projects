// Comunicação com o servidor local: uma única conexão SSE por sessão, polling de reserva
// enquanto o SSE estiver fora e chamadas pontuais (atualizar agora, reiniciar simulação).

import { validarSnapshot } from './contrato.js';

const TIMEOUT_LEITURA_MS = 8000;
// A atualização manual espera o ciclo inteiro do servidor (até o timeout de cada arquivo).
const TIMEOUT_ACAO_MS = 20000;
const ESPERA_RECONEXAO_MS = 5000;

let fonte = null;
let timerPolling = null;
let timerReconexao = null;
let callbacks = null;

async function pedir(url, { metodo = 'GET', timeoutMs = TIMEOUT_LEITURA_MS } = {}) {
  const resp = await fetch(url, {
    method: metodo,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    await resp.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`HTTP ${resp.status}`), { status: resp.status });
  }
  return resp.json();
}

function entregar(dados) {
  if (!validarSnapshot(dados)) {
    callbacks.aoFalhar(new Error('snapshot fora do formato esperado'));
    return;
  }
  callbacks.aoReceber(dados);
}

async function buscarSnapshot() {
  try {
    entregar(await pedir('/api/apuracao'));
  } catch (e) {
    callbacks.aoFalhar(e);
  }
}

function iniciarPolling() {
  if (timerPolling) return;
  timerPolling = setInterval(buscarSnapshot, callbacks.intervaloMs());
}

function pararPolling() {
  clearInterval(timerPolling);
  timerPolling = null;
}

function abrirStream() {
  fonte = new EventSource('/api/stream');
  fonte.onmessage = (ev) => {
    pararPolling();
    let dados;
    try {
      dados = JSON.parse(ev.data);
    } catch {
      callbacks.aoFalhar(new Error('evento SSE inválido'));
      return;
    }
    entregar(dados);
  };
  fonte.onerror = () => {
    callbacks.aoFalhar(new Error('conexão SSE interrompida'));
    // Enquanto o SSE estiver fora, consulta por polling.
    iniciarPolling();
    // CONNECTING: o navegador já está reconectando. CLOSED: desistiu, então reabrimos.
    if (fonte.readyState === EventSource.CLOSED && !timerReconexao) {
      fonte = null;
      timerReconexao = setTimeout(() => {
        timerReconexao = null;
        if (!fonte) abrirStream();
      }, ESPERA_RECONEXAO_MS);
    }
  };
}

// Inicia a comunicação. Chamadas repetidas não abrem uma segunda conexão.
export function conectar({ aoReceber, aoFalhar, intervaloMs }) {
  if (callbacks) return;
  callbacks = { aoReceber, aoFalhar, intervaloMs };
  buscarSnapshot(); // primeira pintura sem esperar o SSE
  if ('EventSource' in window) abrirStream();
  else iniciarPolling();
}

export async function atualizarAgora() {
  entregar(await pedir('/api/atualizar', { metodo: 'POST', timeoutMs: TIMEOUT_ACAO_MS }));
}

export async function reiniciarSimulacao() {
  await pedir('/api/mock/reset', { metodo: 'POST', timeoutMs: TIMEOUT_ACAO_MS });
  await buscarSnapshot();
}
