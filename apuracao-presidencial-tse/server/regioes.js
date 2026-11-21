// UFs e regiões geográficas (IBGE). "zz" = votos no exterior (só entra no total nacional).

const ESTADOS = {
  ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão',
  mg: 'Minas Gerais', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará',
  pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro',
  rn: 'Rio Grande do Norte', ro: 'Rondônia', rr: 'Roraima', rs: 'Rio Grande do Sul',
  sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo', to: 'Tocantins',
};

const REGIOES = [
  { id: 'norte', nome: 'Norte', ufs: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'] },
  { id: 'nordeste', nome: 'Nordeste', ufs: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
  { id: 'centro-oeste', nome: 'Centro-Oeste', ufs: ['df', 'go', 'ms', 'mt'] },
  { id: 'sudeste', nome: 'Sudeste', ufs: ['es', 'mg', 'rj', 'sp'] },
  { id: 'sul', nome: 'Sul', ufs: ['pr', 'rs', 'sc'] },
];

const UFS = Object.keys(ESTADOS);

module.exports = { ESTADOS, REGIOES, UFS };
