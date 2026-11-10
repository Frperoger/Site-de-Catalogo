(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BibliotecaModelo = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const tipos = ['image/*'];
  const max = 25 * 1024 * 1024;
  const regras = {
    logo: { nome:'Logo', tipos, max, dica:'Sugestão: 512 × 512 px, com fundo transparente se preferir.' },
    fundo: { nome:'Imagem de fundo', tipos, max, dica:'Sugestão: 1.920 × 1.080 px, em paisagem.' },
    esquerda: { nome:'Arte lateral esquerda', tipos, max, dica:'Sugestão: 480 × 1.600 px, em pé. A arte se repete do topo ao fim da página.' },
    direita: { nome:'Arte lateral direita', tipos, max, dica:'Sugestão: 480 × 1.600 px, em pé. A arte se repete do topo ao fim da página.' },
    nota: { nome:'Símbolo de avaliação', tipos, max, dica:'Sugestão: 128 × 128 px. Fundo transparente dá um acabamento mais leve, mas é opcional.' },
    divisor: { nome:'Separador', tipos, max, dica:'Sugestão: 1.200 × 160 px, na horizontal. Transparência é opcional.' },
    capa: { nome:'Capa padrão', tipos, max, dica:'Sugestão: 600 × 900 px, em pé.' }
  };
  const paletas = {
    rosa: { nome: 'Pétalas e papel', cor: '#9b5967', papel: '#fbf6f0', superficie: '#fffdf9', tinta: '#453638', suave: '#eee0dc' },
    oliva: { nome: 'Tinta e oliva', cor: '#556b4c', papel: '#f4f1e8', superficie: '#fffdf6', tinta: '#343d32', suave: '#e4e8da' },
    noite: { nome: 'Azul da noite', cor: '#b99bda', papel: '#172031', superficie: '#222e42', tinta: '#f1ebdf', suave: '#344157' }
  };
  const base = {
    nome: 'Meu jardim de histórias', subtitulo: 'Livros que florescem comigo.', chamada: 'Uma história para cada momento.', descricao: 'Entre páginas, descobertas e pequenos favoritos.',
    modelo: 'jardim', paleta: 'rosa', cor: '#9b5967', papel: '#fbf6f0', superficie: '#fffdf9', tinta: '#453638', suave: '#eee0dc',
    fonte: 'literaria', arte: 'traco', efeito: 'original', logo: 'flor', fundo: 'papel', esquerda: 'ramos', direita: 'ramos', nota: 'flor', divisor: 'ramo', capa: 'botanica',
    mostrarLogo: true, mostrarFundo: true, mostrarLaterais: true, mostrarDivisor: true, opacidadeFundo: 45, opacidadeLaterais: 38, tamanhoLogo: 72, tamanhoNota: 20, larguraLaterais: 150,
    posicaoFundo: 'centro', ajusteFundo: 'cobrir', laterais: 'espelho', cabecalho: 'central', cartao: 'estante', cantos: 'suaves', espaco: 'confortavel', paginacao: 'numeros', uploads: {}
  };
  const modelos = {
    jardim: { nome: 'Jardim de papel', descricao: 'Botânica delicada, tons de pétala e leitura acolhedora.', estado: {} },
    classica: { nome: 'Biblioteca clássica', descricao: 'Uma composição editorial, gravuras e detalhes em oliva.', estado: { nome: 'Gabinete de leituras', subtitulo: 'Histórias que merecem ficar.', chamada: 'Seu próximo capítulo começa aqui.', descricao: 'Um acervo pessoal, escolhido com tempo e cuidado.', paleta: 'oliva', fonte: 'classica', arte: 'gravura', logo: 'livro', fundo: 'linhas', esquerda: 'livros', direita: 'livros', nota: 'estrela', divisor: 'editorial', capa: 'editorial', cabecalho: 'editorial', cartao: 'editorial', cantos: 'retos', espaco: 'compacto', paginacao: 'editorial' } },
    noturna: { nome: 'Noite de leitura', descricao: 'Recortes contemporâneos, lua e uma paleta para desacelerar.', estado: { nome: 'Sob a luz da lua', subtitulo: 'Mais uma página antes de dormir.', chamada: 'Há um universo em cada livro.', descricao: 'Suas leituras, descobertas e constelações particulares.', paleta: 'noite', fonte: 'contemporanea', arte: 'recorte', logo: 'lua', fundo: 'constelacao', esquerda: 'astros', direita: 'astros', nota: 'coracao', divisor: 'estelar', capa: 'celeste', cabecalho: 'linear', cartao: 'compacto', cantos: 'redondos', espaco: 'amplo', paginacao: 'marcadores' } }
  };
  const listas = {
    fonte: [['literaria','Literária'],['classica','Clássica'],['contemporanea','Contemporânea']],
    arte: [['traco','Traço delicado'],['gravura','Gravura'],['recorte','Recorte de papel']],
    efeito: [['original','Cores originais'],['harmonizado','Sépia suave'],['monocromatico','Preto e branco']],
    logo: [['flor','Flor e folhas'],['livro','Livro aberto'],['lua','Lua e estrelas']],
    fundo: [['papel','Papel artesanal'],['linhas','Linhas editoriais'],['constelacao','Constelação']],
    esquerda: [['ramos','Ramos botânicos'],['livros','Livros e folhagens'],['astros','Lua e astros']],
    direita: [['ramos','Ramos botânicos'],['livros','Livros e folhagens'],['astros','Lua e astros']],
    nota: [['flor','Flores'],['estrela','Estrelas'],['coracao','Corações']],
    divisor: [['ramo','Ramo floral'],['editorial','Ornamento editorial'],['estelar','Constelação']],
    capa: [['botanica','Herbário'],['editorial','Edição clássica'],['celeste','Céu de histórias']],
    posicaoFundo: [['topo','Topo'],['centro','Centro'],['base','Base']],
    ajusteFundo: [['cobrir','Preencher'],['conter','Imagem inteira'],['repetir','Repetir']],
    laterais: [['espelho','Espelhadas'],['independentes','Independentes'],['base','Moldura estreita']],
    cabecalho: [['central','Assinatura central'],['linear','Barra horizontal'],['editorial','Composição editorial']],
    cartao: [['estante','Estante'],['editorial','Ficha editorial'],['compacto','Lista compacta']],
    cantos: [['retos','Retos'],['suaves','Suaves'],['redondos','Arredondados']],
    espaco: [['compacto','Compacto'],['confortavel','Confortável'],['amplo','Amplo']],
    paginacao: [['numeros','Números'],['editorial','Capítulos'],['marcadores','Marcadores']]
  };
  function modelo(id) {
    const m = modelos[id] || modelos.jardim;
    const estado = Object.assign({}, base, m.estado, { modelo: modelos[id] ? id : 'jardim', uploads: {} });
    Object.assign(estado, paletas[estado.paleta]);
    // O nome da paleta não substitui o nome da biblioteca.
    estado.nome = m.estado.nome || base.nome;
    return estado;
  }
  function tipoReal(bytes) {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytes.length >= 12 && String.fromCharCode.apply(null, bytes.slice(0,4)) === 'RIFF' && String.fromCharCode.apply(null, bytes.slice(8,12)) === 'WEBP') return 'image/webp';
    return '';
  }
  function validarArquivo(slot,tamanho) {
    if(!regras[slot]) return 'Tipo de imagem desconhecido.';
    if(!tamanho) return 'O arquivo está vazio.';
    return tamanho>max?'Escolha uma imagem de até 25 MB. O site ajustará o peso depois do envio.':'';
  }
  function validarDimensoes(slot,w,h) {
    return regras[slot]&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0?'':'Não foi possível ler a imagem.';
  }
  function legado(b) {
    const s=modelo(b.tema==='azul'?'noturna':b.tema==='verde'?'classica':'jardim');
    s.nome=b.nome||'Minha biblioteca';s.subtitulo=b.subtitulo||'';
    if(/^#[0-9a-f]{6}$/i.test(b.cor_primaria||''))s.cor=b.cor_primaria;
    return s;
  }
  function contraste(a, b) {
    function luz(hex) { const c = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4)); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
    const x = luz(a), y = luz(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
  }
  function normalizar(origem) {
    const s = modelo('jardim');
    if (!origem || typeof origem !== 'object') throw new Error('Modelo inválido.');
    for (const k of ['nome','subtitulo','chamada','descricao']) s[k] = String(origem[k] || '').trim().slice(0,k === 'nome' ? 100 : k === 'subtitulo' ? 160 : 180);
    if (!s.nome) throw new Error('Informe o nome da biblioteca.');
    for (const k of ['cor','papel','superficie','tinta','suave']) { if (!/^#[0-9a-f]{6}$/i.test(origem[k] || '')) throw new Error('Cor inválida no modelo.'); s[k]=origem[k]; }
    for (const k of Object.keys(listas)) {
      const custom = regras[k] && origem[k] === 'custom';
      if (!custom && !listas[k].some(o => o[0] === origem[k])) throw new Error('Opção inválida: ' + k + '.');
      s[k] = origem[k];
    }
    for (const k of ['mostrarLogo','mostrarFundo','mostrarLaterais','mostrarDivisor']) s[k] = origem[k] !== false;
    const ranges = {opacidadeFundo:[0,100],opacidadeLaterais:[0,100],tamanhoLogo:[40,110],tamanhoNota:[14,32],larguraLaterais:[60,220]};
    for (const k of Object.keys(ranges)) { const n = Number(origem[k]); if (!Number.isFinite(n) || n < ranges[k][0] || n > ranges[k][1]) throw new Error('Ajuste inválido: ' + k + '.'); s[k]=n; }
    s.modelo = modelos[origem.modelo] ? origem.modelo : 'jardim'; s.paleta = paletas[origem.paleta] ? origem.paleta : 'rosa'; s.uploads = {};
    for (const k of Object.keys(regras)) if (origem.uploads && typeof origem.uploads[k] === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(origem.uploads[k])) s.uploads[k] = origem.uploads[k];
    for (const k of Object.keys(regras)) if (s[k] === 'custom' && !s.uploads[k]) throw new Error('Falta a imagem enviada para ' + regras[k].nome + '.');
    return s;
  }
  const livros = [
    { id:1,titulo:'Jardins da memória',autor:'Clara Duarte',genero:'Literatura',status:'Lendo',nota:4,local:'Estante da sala',capa:true,cor:'#507464' },
    { id:2,titulo:'O mapa das pequenas coisas',autor:'Helena Reis',genero:'Ficção',status:'Não lido',nota:0,local:'Prateleira 2',capa:true,cor:'#be8863' },
    { id:3,titulo:'Histórias para ficar',autor:'Lia Oliveira',genero:'Contos',status:'Lido',nota:5,local:'Estante da sala',capa:false,cor:'#866b88' },
    { id:4,titulo:'Sob o céu da tarde',autor:'Tomás Azevedo',genero:'Poesia',status:'Lido',nota:4,local:'Prateleira 2',capa:true,cor:'#657e96' },
    { id:5,titulo:'A arte de recomeçar',autor:'Ana Machado',genero:'Literatura',status:'Não lido',nota:0,local:'Estante do quarto',capa:false,cor:'#9d735b' },
    { id:6,titulo:'Cartas do silêncio',autor:'Miguel Fontes',genero:'Contos',status:'Lendo',nota:3,local:'Estante do quarto',capa:true,cor:'#7c875c' }
  ];
  return { legado,regras,paletas,modelos,listas,modelo,tipoReal,validarArquivo,validarDimensoes,normalizar,contraste,livros };
});
