// Validação do snapshot recebido da API antes de usá-lo na interface.

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validarSnapshot(dados) {
  if (!ehObjeto(dados)) return false;
  if (!ehObjeto(dados.meta) || typeof dados.meta.intervaloMs !== 'number') return false;
  if (!ehObjeto(dados.status) || !Array.isArray(dados.status.erros)) return false;
  if (!Array.isArray(dados.regioes)) return false;
  if (dados.nacional !== null && (!ehObjeto(dados.nacional) || !Array.isArray(dados.nacional.candidatos))) return false;
  return true;
}

// Só aceita fotos por http(s), nunca outros esquemas.
export const urlSegura = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);
