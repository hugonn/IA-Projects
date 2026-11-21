// Ponto de entrada: liga rede, estado e componentes.

import * as estado from './estado.js';
import { conectar } from './rede.js';
import { fixarCores } from './cores.js';
import { criarCabecalho } from './componentes/cabecalho.js';
import { criarResumo } from './componentes/resumo.js';
import { criarCandidatos } from './componentes/candidatos.js';
import { criarProjecao } from './componentes/projecao.js';
import { criarVirada } from './componentes/virada.js';
import { criarMapa } from './componentes/mapa.js';
import { criarRegioes } from './componentes/regioes.js';

const selecionarRegiao = (id) => estado.atualizar({ regiaoSelecionada: id });

const resumo = criarResumo();
const candidatos = criarCandidatos();
// Simulação reiniciada: a lista de candidatos recomeça do zero.
const cabecalho = criarCabecalho({ aoReiniciar: () => candidatos.limpar() });
const projecao = criarProjecao();
const virada = criarVirada();
const mapa = criarMapa({ aoSelecionar: selecionarRegiao });
const regioes = criarRegioes({ aoSelecionar: selecionarRegiao });

// Botões de modo de cor do mapa.
const botoesModo = document.querySelectorAll('[data-modo-mapa]');
for (const botao of botoesModo) {
  botao.addEventListener('click', () => estado.atualizar({ modoMapa: botao.dataset.modoMapa }));
}

estado.assinar((est, mudou) => {
  cabecalho.atualizar(est);
  const s = est.snapshot;

  if ('modoMapa' in mudou) {
    for (const b of botoesModo) {
      const ativo = b.dataset.modoMapa === est.modoMapa;
      b.classList.toggle('ativo', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    }
    mapa.definirModo(est.modoMapa);
  }
  if ('regiaoSelecionada' in mudou) {
    mapa.selecionar(est.regiaoSelecionada);
    if (est.regiaoSelecionada && innerWidth < 1024) {
      document.getElementById('detalhe-regiao').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  if (!s) return;

  if ('snapshot' in mudou) {
    // Cores fixadas na ordem do ranking nacional assim que houver votos.
    if (s.nacional?.validos.votos > 0) fixarCores(s.nacional.candidatos);
    resumo.atualizar(s.nacional);
    candidatos.atualizar(s.nacional);
    projecao.atualizar(s.projecao, s.nacional);
    virada.atualizar(s.projecao?.virada);
    mapa.atualizar(s.regioes);
  }
  regioes.atualizar(s.regioes, est);
});

conectar({
  aoReceber: (snapshot) => estado.atualizar({ snapshot, recebidoEm: Date.now(), servidorOnline: true }),
  aoFalhar: () => {
    if (estado.obter().servidorOnline) estado.atualizar({ servidorOnline: false });
  },
  intervaloMs: () => estado.obter().snapshot?.meta.intervaloMs ?? 6000,
});
