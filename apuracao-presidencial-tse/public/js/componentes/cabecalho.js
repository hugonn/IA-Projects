// Cabeçalho: status da conexão, avisos, contadores de atualização, contagem regressiva,
// botão de atualização manual, reinício da simulação e tema.

import { $, texto, mostrar } from '../dom.js';
import { num, hora, pct, titulo } from '../formato.js';
import { atualizarAgora, reiniciarSimulacao } from '../rede.js';
import * as estado from '../estado.js';

const CIRCUNFERENCIA = 94.25; // 2 * PI * 15 (raio do anel)

function calcularStatus(est) {
  const s = est.snapshot;
  if (!est.servidorOnline) {
    return {
      classe: 'badge-erro', texto: 'Offline',
      aviso: 'Sem conexão com o servidor local. Exibindo os últimos dados recebidos; reconectando automaticamente…',
    };
  }
  if (!s) return { classe: 'badge-neutro', texto: 'Conectando…', aviso: '' };

  const { status, meta, nacional } = s;
  if (!nacional) {
    const erroBr = status.erros.find((e) => e.abrangencia === 'br');
    return {
      classe: 'badge-alerta', texto: 'Aguardando TSE',
      aviso: `Ainda não foi possível obter dados do TSE${erroBr ? ` (${erroBr.erro})` : ''}. Nova tentativa a cada ${meta.intervaloMs / 1000}s.`,
    };
  }

  let classe = 'badge-vivo', rotulo = 'Ao vivo', aviso = '';
  if (meta.modo === 'mock') { classe = 'badge-mock'; rotulo = 'Simulação'; }
  else if (nacional.totalizacaoFinal) { classe = 'badge-final'; rotulo = 'Final'; }
  else if (!nacional.totalizadoEm) { classe = 'badge-neutro'; rotulo = 'Aguardando apuração'; }

  if (status.erros.length) {
    if (meta.modo !== 'mock') { classe = 'badge-alerta'; rotulo = 'Instável'; }
    const lista = status.erros.slice(0, 4).map((e) => `${e.abrangencia.toUpperCase()}: ${e.erro}`).join(' · ');
    aviso = `${status.erros.length} de ${status.arquivos.total} arquivos falharam na última rodada (${lista}${status.erros.length > 4 ? ' …' : ''}). Mantendo os últimos dados válidos.`;
  }
  return { classe, texto: rotulo, aviso };
}

// Frase curta para leitores de tela, anunciada só quando algo relevante muda.
function resumoFalado(nacional) {
  if (!nacional?.candidatos.length) return '';
  const [a, b] = nacional.candidatos;
  const apurado = `${Math.floor(nacional.secoes.pct)}% das urnas apuradas.`;
  const lider = a.votos > 0 ? ` ${titulo(a.nome)} ${pct(a.pct)}%` : '';
  const segundo = b && b.votos > 0 ? `, ${titulo(b.nome)} ${pct(b.pct)}%.` : '.';
  return apurado + (lider ? lider + segundo : '');
}

export function criarCabecalho({ aoReiniciar }) {
  const el = {
    turno: $('#titulo-turno'),
    badge: $('#badge-status'),
    badgeTexto: $('#badge-texto'),
    aviso: $('#aviso'),
    avisoTexto: $('#aviso-texto'),
    anel: $('#anel-contagem'),
    segundos: $('#contagem-seg'),
    auto: $('#cont-auto'),
    manual: $('#cont-manual'),
    ultima: $('#ultima-atualizacao'),
    refresh: $('#btn-refresh'),
    iconeRefresh: $('#icone-refresh'),
    reset: $('#btn-reset-mock'),
    tema: $('#btn-tema'),
    fonte: $('#link-fonte'),
    leitor: $('#resumo-leitor'),
  };
  let ultimoResumo = '';

  // 429 = cliques rápidos demais (o servidor limita as atualizações manuais): não é falha de conexão.
  const tratarFalha = (e) => {
    if (e.status !== 429) estado.atualizar({ servidorOnline: false });
  };

  el.refresh.addEventListener('click', async () => {
    el.refresh.disabled = true;
    el.refresh.setAttribute('aria-busy', 'true');
    el.iconeRefresh.classList.add('girando');
    try {
      await atualizarAgora();
    } catch (e) {
      tratarFalha(e);
    } finally {
      el.refresh.disabled = false;
      el.refresh.removeAttribute('aria-busy');
      el.iconeRefresh.classList.remove('girando');
    }
  });

  el.reset.addEventListener('click', async () => {
    el.reset.disabled = true;
    try {
      aoReiniciar();
      await reiniciarSimulacao();
    } catch (e) {
      tratarFalha(e);
    } finally {
      el.reset.disabled = false;
    }
  });

  el.tema.addEventListener('click', () => {
    const escuro = document.documentElement.classList.toggle('dark');
    el.tema.setAttribute('aria-pressed', String(escuro));
    try { localStorage.setItem('tema', escuro ? 'escuro' : 'claro'); } catch { /* armazenamento indisponível */ }
  });
  el.tema.setAttribute('aria-pressed', String(document.documentElement.classList.contains('dark')));

  // Contagem regressiva até a próxima atualização automática, pelo relógio do servidor.
  setInterval(() => {
    const { snapshot: s, servidorOnline, recebidoEm } = estado.obter();
    if (!s || !servidorOnline) {
      texto(el.segundos, '–');
      return;
    }
    const proxima = s.status.proximaAutomatica;
    const restante = proxima
      ? Date.parse(proxima) - Date.parse(s.meta.servidorEm) - (Date.now() - recebidoEm)
      : 0;
    if (restante <= 0) {
      // Ciclo em andamento no servidor: aguardando o próximo snapshot.
      texto(el.segundos, '…');
      el.anel.style.strokeDashoffset = '0';
      return;
    }
    texto(el.segundos, String(Math.ceil(restante / 1000)));
    el.anel.style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - Math.min(1, restante / s.meta.intervaloMs)));
  }, 200);

  return {
    atualizar(est) {
      const st = calcularStatus(est);
      el.badge.className = `badge ${st.classe}`;
      texto(el.badgeTexto, st.texto);
      mostrar(el.aviso, Boolean(st.aviso));
      texto(el.avisoTexto, st.aviso);

      const s = est.snapshot;
      if (!s) return;
      const { atualizacoes, ultimoSucesso } = s.status;
      texto(el.auto, num(atualizacoes.auto), { destacar: true });
      texto(el.manual, num(atualizacoes.manual), { destacar: true });
      texto(el.ultima, hora(ultimoSucesso));
      el.refresh.title = `Buscar os dados do TSE agora · ${num(atualizacoes.auto)} atualizações automáticas e ${num(atualizacoes.manual)} manuais`;
      mostrar(el.reset, s.meta.modo === 'mock');

      el.fonte.href = s.meta.fonte;
      texto(el.fonte, s.meta.modo === 'mock' ? 'simulador local (formato TSE)' : s.meta.fonte.replace(/^https?:\/\//, ''));
      if (s.nacional) texto(el.turno, `· ${s.nacional.turno}º turno`);

      const resumo = resumoFalado(s.nacional);
      if (resumo !== ultimoResumo) {
        ultimoResumo = resumo;
        texto(el.leitor, resumo);
      }
    },
  };
}
