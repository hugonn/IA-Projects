// Criação e atualização segura do DOM. Dados da API entram sempre como texto (textContent)
// ou propriedades, nunca como HTML: não há uso de innerHTML com dados externos.

const SVG_NS = 'http://www.w3.org/2000/svg';

function aplicar(el, props) {
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'class') el.setAttribute('class', valor);
    else if (chave === 'text') el.textContent = valor;
    else if (chave === 'style') definirEstilo(el, valor);
    else if (chave === 'dataset') Object.assign(el.dataset, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') el.addEventListener(chave.slice(2), valor);
    else el.setAttribute(chave, valor === true ? '' : String(valor));
  }
}

function anexar(el, filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho === undefined || filho === null || filho === false) continue;
    el.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
}

// h('div', { class: 'x', text: 'olá' }, filho1, filho2)
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  aplicar(el, props);
  anexar(el, filhos);
  return el;
}

// Igual a h(), para elementos SVG.
export function s(tag, props, ...filhos) {
  const el = document.createElementNS(SVG_NS, tag);
  aplicar(el, props);
  anexar(el, filhos);
  return el;
}

// Atualiza o texto só se mudou; `destacar` pisca o valor novo.
export function texto(el, valor, { destacar = false } = {}) {
  const novo = String(valor ?? '');
  if (el.textContent === novo) return false;
  el.textContent = novo;
  if (destacar) {
    el.classList.remove('flash');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('flash');
  }
  return true;
}

// Aplica estilos inline (aceita variáveis CSS como '--tw-ring-color').
export function definirEstilo(el, estilos) {
  for (const [prop, valor] of Object.entries(estilos)) {
    const css = prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
    if (el.style.getPropertyValue(css) !== String(valor)) el.style.setProperty(css, valor);
  }
}

export const mostrar = (el, visivel) => el.classList.toggle('hidden', !visivel);

// Reconciliação por chave: reaproveita os nós existentes, cria os novos, remove os que saíram
// e deixa tudo na ordem de `itens`. `criar` devolve o nó; `atualizar` só altera o que mudou.
export function sincronizarLista(container, itens, { chave, criar, atualizar }) {
  const existentes = new Map();
  for (const no of container.children) existentes.set(no.dataset.chave, no);

  let anterior = null;
  itens.forEach((item, i) => {
    const k = String(chave(item));
    let no = existentes.get(k);
    if (no) existentes.delete(k);
    else {
      no = criar(item);
      no.dataset.chave = k;
    }
    atualizar(no, item, i);
    const esperado = anterior ? anterior.nextElementSibling : container.firstElementChild;
    if (no !== esperado) container.insertBefore(no, esperado);
    anterior = no;
  });
  for (const no of existentes.values()) no.remove();
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
