// Carregado de forma síncrona no <head>: aplica o tema salvo antes de o <body> ser renderizado,
// sem piscada. Fica num arquivo (e não inline) para a Content-Security-Policy não precisar de 'unsafe-inline'.
try {
  if (localStorage.getItem('tema') === 'claro') document.documentElement.classList.remove('dark');
} catch (e) {
  // armazenamento indisponível: mantém o tema escuro padrão
}
