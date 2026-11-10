(function () {
  'use strict';
  const M = window.BibliotecaModelo;
  let estado = M.modelo('jardim'), arquivos = new Map();
  const A = window.ArtesBiblioteca.criar(() => arquivos);
  const $ = id => document.getElementById(id);
  function imagem(slot, classe) {
    const img = document.createElement('img');
    img.className = (classe || '') + (estado[slot] === 'custom' ? ' art-' + estado.efeito : '');
    img.src = A.urlArte(slot, estado); img.alt = '';
    return img;
  }
  function aplicar(doc) {
    estado = M.normalizar(doc.estado);
    arquivos = new Map((doc.arquivos || []).map(a => [a.id, a]));
    const r = document.body.style;
    const fontes = { literaria: 'Georgia,serif', classica: '"Palatino Linotype",Palatino,serif', contemporanea: '"Segoe UI",system-ui,sans-serif' };
    const contraste = M.contraste(estado.cor, '#ffffff') >= M.contraste(estado.cor, '#191d19') ? '#ffffff' : '#191d19';
    const variaveis = {
      fundo: estado.papel, superficie: estado.superficie, texto: estado.tinta,
      'texto-suave': `color-mix(in srgb,${estado.tinta} 75%,${estado.papel})`,
      primario: estado.cor, 'primario-hover': estado.cor, 'contraste-primario': contraste,
      destaque: estado.suave, borda: `color-mix(in srgb,${estado.cor} 30%,${estado.superficie})`,
      'borda-leve': `color-mix(in srgb,${estado.cor} 18%,${estado.superficie})`,
      'fonte-titulo': fontes[estado.fonte], 'fonte-texto': fontes[estado.fonte],
      raio: { retos: '1px', suaves: '10px', redondos: '22px' }[estado.cantos],
      'espaco-acervo': { compacto: '12px', confortavel: '22px', amplo: '32px' }[estado.espaco],
      'tamanho-logo': estado.tamanhoLogo + 'px', 'largura-lateral': estado.larguraLaterais + 'px',
    };
    for (const [k, v] of Object.entries(variaveis)) r.setProperty('--' + k, v);
    document.body.dataset.personalizacao = 'v3';
    for (const k of ['cabecalho', 'cartao', 'paginacao', 'espaco']) document.body.dataset[k] = estado[k];
    const cenario = $('cenario-biblioteca'); cenario.replaceChildren();
    if (estado.mostrarFundo) {
      const bg = document.createElement('div'); bg.className = 'cenario-fundo' + (estado.fundo === 'custom' ? ' art-' + estado.efeito : '');
      bg.style.opacity = estado.opacidadeFundo / 100;
      if (estado.ajusteFundo === 'repetir') { bg.style.backgroundImage = 'url("' + A.urlArte('fundo', estado) + '")'; bg.classList.add('repetir'); }
      else { const img = imagem('fundo'); img.className = ''; img.style.objectFit = estado.ajusteFundo === 'conter' ? 'contain' : 'cover'; img.style.objectPosition = { topo: 'center top', centro: 'center', base: 'center bottom' }[estado.posicaoFundo]; bg.append(img); }
      cenario.append(bg);
    }
    if (estado.mostrarLaterais) for (const slot of ['esquerda', 'direita']) {
      const n = document.createElement('div'); n.className = 'cenario-lateral ' + slot + (estado.laterais === 'base' ? ' estreita' : '') + (estado[slot] === 'custom' ? ' art-' + estado.efeito : '');
      n.style.backgroundImage = 'url("' + A.urlArte(slot, estado) + '")'; n.style.opacity = estado.opacidadeLaterais / 100;
      if (slot === 'direita' && estado.laterais === 'espelho') n.style.transform = 'scaleX(-1)'; cenario.append(n);
    }
    const original = document.querySelector('.marca > svg'); if (original) original.setAttribute('hidden', '');
    $('logo-personalizado')?.remove();
    if (estado.mostrarLogo) { const img = imagem('logo', 'logo-personalizado'); img.id = 'logo-personalizado'; img.alt = 'Logo de ' + estado.nome; document.querySelector('.marca').prepend(img); }
    $('nome-biblioteca').textContent = estado.nome; $('subtitulo').textContent = estado.subtitulo;
    document.querySelector('.cabecalho-pagina h2').textContent = estado.chamada;
    document.querySelector('.cabecalho-pagina p').textContent = estado.descricao;
    const divisor = document.querySelector('.divisor-floral'); divisor.replaceChildren(); divisor.hidden = !estado.mostrarDivisor;
    if (estado.mostrarDivisor) divisor.append(imagem('divisor', 'separador-personalizado'));
    document.title = estado.nome + (window.Conta?.visitante() ? ' · Visita' : '');
  }
  function limpar() {
    estado = M.modelo('jardim'); arquivos.clear(); $('cenario-biblioteca').replaceChildren(); $('logo-personalizado')?.remove();
    const original = document.querySelector('.marca > svg'); if (original) original.removeAttribute('hidden');
    document.querySelector('.divisor-floral').replaceChildren();
    for (const k of ['personalizacao', 'cabecalho', 'cartao', 'paginacao', 'espaco']) delete document.body.dataset[k];
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
  }
  function simbolo(preenchido = true, tamanho) {
    const img = imagem('nota', 'simbolo-avaliacao' + (preenchido ? '' : ' apagado'));
    img.dataset.baseSize = tamanho || 20; img.style.width = img.style.height = ((tamanho || 20) * estado.tamanhoNota / 20) + 'px'; img.setAttribute('aria-hidden', 'true'); return img;
  }
  function capa(livro) {
    const img = document.createElement('img'); img.src = A.capa(livro, estado); img.alt = 'Capa de ' + livro.titulo;
    if (!livro.capa_url && estado.capa === 'custom') img.className = 'art-' + estado.efeito;
    return img;
  }
  function pictograma(tipo) {
    const formas = {
      'arte-check': '<circle cx="50" cy="50" r="35"/><path d="M32 50L45 63L70 36"/>',
      'arte-marca': '<path d="M25 12H75V88L50 69L25 88Z"/>',
      'arte-pessoas': '<circle cx="39" cy="28" r="14"/><path d="M10 87V72Q10 51 39 51Q68 51 68 72V87M70 18Q88 18 88 32Q88 43 76 46M78 58Q95 63 95 82"/>',
    };
    const img = document.createElement('img'); img.className = 'arte'; img.alt = '';
    img.src = tipo === 'arte-livros' ? A.arte('livro', estado, 'logo') : A.svgUrl('<g fill="none" stroke="' + estado.cor + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' + formas[tipo] + '</g>', 100, 100);
    return img;
  }
  window.TemaBiblioteca = { aplicar, limpar, simbolo, capa, pictograma, estado: () => estado };
})();
