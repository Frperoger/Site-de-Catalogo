(function () {
  'use strict';
  const M=window.BibliotecaModelo;
  const $=id=>document.getElementById(id);
  const copia=s=>JSON.parse(JSON.stringify(s));
  const categorias=[['modelos','✳','Modelos completos'],['identidade','◈','Identidade'],['cores','◐','Cores e fontes'],['cenario','❧','Fundo e laterais'],['simbolos','✧','Avaliações e capas'],['composicao','▤','Artes e layout'],['compartilhar','↗','Link de visitante'],['conta','◎','Conta e acessos'],['arquivo','↓','Guardar modelo']];
  let aplicado=M.modelo('jardim'),rascunho=copia(aplicado),aba='modelos',historico=[],mobile=false,arquivos=new Map(),linkAtual=null,toastTimer,visitante=false,opcoesVisita={avaliacoes:true,localizacao:true},pagina=1,busca='',soLidos=false;
  const notas=new Map();
  let bibliotecaId=null,pronto=false,convites=[],carregandoConvites=false,livrosPreview=M.livros,metricasPreview=[6,2,2];
  const A=window.ArtesBiblioteca.criar(()=>arquivos);
  const {svgUrl,marca,arte,urlArte,capa,rating}=A;
  function el(tag,classe,texto){const n=document.createElement(tag);if(classe)n.className=classe;if(texto!==undefined)n.textContent=texto;return n;}
  function botao(texto,acao,classe){const b=el('button',classe||'button',texto);b.type='button';if(acao)b.addEventListener('click',acao);return b;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function aviso(texto){clearTimeout(toastTimer);$('toast').textContent=texto;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
  function erroNo(container,texto){let n=container.querySelector('.validation');if(!n){n=el('p','validation');n.setAttribute('role','alert');container.append(n);}n.textContent=texto;return n;}
  function renderBiblioteca(target,s,preview){
    const publico=visitante&&!preview;
    const shell=el('div','library-shell');
    for(const [nome,valor]of Object.entries({cor:s.cor,papel:s.papel,superficie:s.superficie,tinta:s.tinta,suave:s.suave,logo:s.tamanhoLogo+'px',nota:s.tamanhoNota+'px',side:s.larguraLaterais+'px',radius:{retos:'1px',suaves:'10px',redondos:'22px'}[s.cantos],gap:{compacto:'13px',confortavel:'23px',amplo:'33px'}[s.espaco],font:{literaria:'Georgia,serif',classica:'"Palatino Linotype",Palatino,serif',contemporanea:'"Segoe UI",system-ui,sans-serif'}[s.fonte],'button-ink':M.contraste(s.cor,'#ffffff')>=M.contraste(s.cor,'#191d19')?'#ffffff':'#191d19'}))shell.style.setProperty('--lib-'+nome,valor);
    if(s.mostrarFundo){const bg=el('div','lib-bg'+(s.fundo==='custom'?' art-'+s.efeito:''));bg.style.opacity=s.opacidadeFundo/100;const src=urlArte('fundo',s);if(s.ajusteFundo==='repetir'){bg.classList.add('repeat');bg.style.backgroundImage='url("'+src+'")';}else{const img=el('img');img.src=src;img.alt='';img.style.objectFit=s.ajusteFundo==='conter'?'contain':'cover';img.style.objectPosition={topo:'center top',centro:'center',base:'center bottom'}[s.posicaoFundo];bg.append(img);}shell.append(bg);}
    if(s.mostrarLaterais)for(const [slot,dir]of [['esquerda','left'],['direita','right']]){const side=el('div','lib-side '+dir+(s.laterais==='base'?' base':''));side.style.backgroundImage='url("'+urlArte(slot,s)+'")';side.style.opacity=s.opacidadeLaterais/100;if(slot==='direita'&&s.laterais==='espelho')side.style.transform='scaleX(-1)';if(s[slot]==='custom')side.classList.add('art-'+s.efeito);shell.append(side);}
    if(publico){const strip=el('div','visitor-strip');strip.append(el('strong','', 'Visita à biblioteca · '),document.createTextNode('Somente leitura. Nenhuma conta é necessária.'));shell.append(strip);}
    const header=el('header','lib-header '+s.cabecalho),brand=el('div','lib-brand');
    if(s.mostrarLogo){const logo=el('img','lib-logo'+(s.logo==='custom'?' art-'+s.efeito:''));logo.src=urlArte('logo',s);logo.alt='Logo de '+s.nome;brand.append(logo);}
    const identidade=el('div');identidade.append(el('h1','lib-name',s.nome),el('p','lib-signature',s.subtitulo));brand.append(identidade);header.append(brand);
    if(!publico){const tools=el('div','lib-tools');tools.append(el('span','lib-role','Minha biblioteca'),el('span','lib-identity','Administrador'));if(!preview)tools.append(botao('Configurações',()=>abrirConfig('modelos'),'lib-filter'),botao('Compartilhar',()=>abrirConfig('compartilhar'),'lib-filter'));header.append(tools);}
    else header.append(el('span','lib-role','Visualização'));
    shell.append(header);
    const main=el('main','lib-content'),intro=el('div','lib-intro');intro.append(el('h2','',s.chamada),el('p','',s.descricao));main.append(intro);
    if(s.mostrarDivisor){const div=el('img','lib-divider'+(s.divisor==='custom'?' art-'+s.efeito:''));div.src=urlArte('divisor',s);div.alt='';main.append(div);}
    const metrics=el('div','lib-metrics');for(const [n,t]of [[metricasPreview[0],'livros no acervo'],[metricasPreview[1],'em leitura'],[metricasPreview[2],'já lidos']]){const item=el('div','lib-metric');item.append(el('strong','',String(n)),el('span','',t));metrics.append(item);}main.append(metrics);
    const controls=el('div','lib-controls'),search=el('input','lib-search');search.type='search';search.placeholder='Encontre sua próxima leitura…';search.setAttribute('aria-label','Buscar livros');search.value=preview?'':busca;
    search.addEventListener('input',()=>{if(preview)return;const pos=search.selectionStart;busca=search.value;pagina=1;renderHome();const novo=$('pagina-biblioteca').querySelector('.lib-search');novo.focus();try{novo.setSelectionRange(pos,pos);}catch{}});
    if(preview){search.readOnly=true;search.setAttribute('aria-label','Busca ilustrativa na prévia');}
    controls.append(search,botao('Todos',()=>{if(preview)return;soLidos=false;pagina=1;renderHome();},'lib-filter'+(!soLidos?' active':'')),botao('Já lidos',()=>{if(preview)return;soLidos=true;pagina=1;renderHome();},'lib-filter'+(soLidos?' active':'')));main.append(controls);
    let lista=livrosPreview.filter(l=>(preview||!soLidos||l.status==='Lido')&&(preview||!busca||(l.titulo+' '+l.autor).toLowerCase().includes(busca.toLowerCase())));
    const porPagina=preview?4:4,total=Math.max(1,Math.ceil(lista.length/porPagina));if(pagina>total&&!preview)pagina=total;
    const exibidos=lista.slice((preview?0:pagina-1)*porPagina,(preview?1:pagina)*porPagina);
    const grid=el('div','lib-grid '+s.cartao);
    for(const l of exibidos){const card=botao('',()=>abrirLivro(l,s,true),'lib-card');card.setAttribute('aria-label','Ver detalhes de '+l.titulo);const img=el('img','lib-cover'+(!l.capa&&s.capa==='custom'?' art-'+s.efeito:''));img.src=capa(l,s);img.alt='Capa ilustrativa de '+l.titulo;card.append(img,el('h3','',l.titulo),el('p','lib-author',l.autor),el('span','lib-status',l.status));if(!publico||opcoesVisita.avaliacoes)card.append(rating(notas.get(l.id)??l.nota,s));if(!publico||opcoesVisita.localizacao)card.append(el('p','lib-location',l.local));grid.append(card);}main.append(grid);
    if(!lista.length)main.append(el('p','lib-intro','Nenhum livro corresponde à sua busca.'));
    const pager=el('nav','lib-pagination '+s.paginacao);pager.setAttribute('aria-label','Páginas do catálogo');const paginas=preview?3:total;
    pager.append(botao('←',()=>{if(!preview&&pagina>1){pagina--;renderHome();}},''));for(let n=1;n<=paginas;n++){const b=botao(s.paginacao==='editorial'?'Cap. '+n:String(n),()=>{if(!preview){pagina=n;renderHome();}},'');if(n===(preview?1:pagina))b.setAttribute('aria-current','page');pager.append(b);}pager.append(botao('→',()=>{if(!preview&&pagina<total){pagina++;renderHome();}},''));main.append(pager);
    shell.append(main,el('footer','lib-footer',publico?'Compartilhado por '+s.nome+' · Acesso de visitante, somente leitura':'Uma biblioteca própria · Histórias para guardar e compartilhar'));
    target.replaceChildren(shell);
  }
  function renderHome(){window.TemaBiblioteca.aplicar(pacote(aplicado));}
  function renderPreview(){renderBiblioteca($('preview-biblioteca'),rascunho,true);$('preview-frame').classList.toggle('mobile',mobile);atualizarEstado();}
  function pendente(){return JSON.stringify(rascunho)!==JSON.stringify(aplicado);}
  function contrasteValido(s){return M.contraste(s.tinta,s.superficie)>=4.5&&M.contraste(s.tinta,s.papel)>=4.5;}
  function atualizarEstado(){const dirty=pendente(),ok=contrasteValido(rascunho);$('estado-rascunho').textContent=!ok?'Ajuste o contraste das cores para aplicar':dirty?'Alterações na prévia, ainda não salvas':'Personalização salva';$('aplicar').disabled=!ok;$('desfazer').disabled=!historico.length;$('descartar').disabled=!dirty;}
  function mudar(k,v,refazer){historico.push(copia(rascunho));if(historico.length>30)historico.shift();rascunho[k]=v;renderPreview();if(refazer)renderSecao();}
  function mudarConjunto(s){historico.push(copia(rascunho));rascunho=copia(s);renderPreview();renderSecao();}
  function titulo(kicker,nome,texto){const div=el('div');div.append(el('p','section-kicker',kicker),el('h2','section-title',nome),el('p','section-intro',texto));return div;}
  function textoCampo(k,rotulo,max){const label=el('label','form-label',rotulo),input=el(k==='descricao'?'textarea':'input','form-input');input.id='campo-'+k;input.value=rascunho[k];input.maxLength=max||180;if(k==='nome')input.required=true;input.addEventListener('input',()=>mudar(k,input.value,false));label.append(input);return label;}
  function selectCampo(k,rotulo,lista){const label=el('label','form-label',rotulo),sel=el('select','form-select');sel.id='campo-'+k;for(const [v,n]of lista||M.listas[k]){const o=el('option','',n);o.value=v;sel.append(o);}sel.value=rascunho[k];sel.addEventListener('change',()=>mudar(k,sel.value,false));label.append(sel);return label;}
  function checkCampo(k,rotulo){const label=el('label','checkbox-row'),input=el('input');input.type='checkbox';input.checked=rascunho[k];input.addEventListener('change',()=>mudar(k,input.checked,false));label.append(input,document.createTextNode(rotulo));return label;}
  function rangeCampo(k,rotulo,min,max,unidade){const label=el('label','form-label',rotulo),row=el('span','range-row'),input=el('input','form-input'),out=el('output','',rascunho[k]+(unidade||''));input.type='range';input.min=min;input.max=max;input.value=rascunho[k];input.id='campo-'+k;out.htmlFor=input.id;let inicio;
    input.addEventListener('pointerdown',()=>{inicio=copia(rascunho);});input.addEventListener('input',()=>{if(!inicio){inicio=copia(rascunho);}rascunho[k]=Number(input.value);out.value=input.value+(unidade||'');renderPreview();});input.addEventListener('change',()=>{if(inicio){historico.push(inicio);inicio=null;atualizarEstado();}});row.append(input,out);label.append(row);return label;}
  function grupo(nome){const field=el('fieldset','field-group');field.append(el('legend','',nome));return field;}
  function separador(){return el('hr','divider-line');}
  function caixa(texto){return el('p','subtle-box',texto);}
  function botaoEscolha(slot,id,nome){const b=botao('',()=>mudar(slot,id,true),'choice');b.id='escolha-'+slot+'-'+id;b.setAttribute('aria-pressed',String(rascunho[slot]===id));const visual=el('span','choice-art'),img=el('img');img.src=slot==='capa'?capa({id:0,titulo:'Sua próxima leitura',autor:'Capa padrão',capa:false},Object.assign({},rascunho,{capa:id})):arte(id,rascunho,slot);img.alt='';visual.append(img);b.append(visual,el('span','',nome));return b;}
  function componenteImagem(slot,nome){const field=grupo(nome),grid=el('div','choice-grid');for(const [id,n]of M.listas[slot])grid.append(botaoEscolha(slot,id,n));field.append(grid);
    const box=el('div','upload-box'),input=el('input');input.type='file';input.accept='image/*';input.hidden=true;input.id='arquivo-'+slot;
    const upload=botao('↑ Enviar minha imagem',()=>input.click());upload.id='enviar-'+slot;
    input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;upload.disabled=true;upload.textContent='Conferindo imagem…';box.querySelector('.validation')?.remove();try{const atual=bibliotecaId;const a=await prepararImagem(slot,file);if(atual!==bibliotecaId)return;arquivos.set(a.id,a);historico.push(copia(rascunho));rascunho.uploads[slot]=a.id;rascunho[slot]='custom';renderPreview();renderSecao();aviso(M.regras[slot].nome+': imagem pronta para a prévia.');}catch(e){erroNo(box,e.message);}finally{upload.disabled=false;upload.textContent='↑ Enviar minha imagem';input.value='';}});
    box.append(upload,input,el('p','hint',M.regras[slot].dica));const a=arquivos.get(rascunho.uploads[slot]);if(a){const linha=el('div','upload-name'),img=el('img');img.src=a.url;img.alt='Imagem enviada';linha.append(img,el('span','',a.nome+' · '+a.width+' × '+a.height+' px'));if(rascunho[slot]!=='custom')linha.append(botao('Usar',()=>mudar(slot,'custom',true),'text-button'));else linha.append(el('span','','Em uso'));box.append(linha);}field.append(box);return field;
  }
  function renderSecao(){const content=$('conteudo-config');const foco=document.activeElement?.id;const scroll=content.scrollTop;content.replaceChildren();
    if(aba==='modelos'){
      content.append(titulo('COMECE POR UMA COMPOSIÇÃO','Uma identidade inteira','Escolha um ponto de partida. Depois, misture cada detalhe à sua maneira.'));
      const list=el('div','preset-list');for(const [id,m]of Object.entries(M.modelos)){const s=M.modelo(id),b=botao('',()=>mudarConjunto(s),'preset-card');b.setAttribute('aria-pressed',String(rascunho.modelo===id));const art=el('span','preset-art');art.style.background=s.papel;art.style.color=s.cor;const img=el('img');img.src=arte(s.logo,s,'logo');img.alt='';const mini=el('span','mini-page');for(let i=0;i<3;i++){const n=el('span');n.style.background=[s.cor,s.suave,s.superficie][i];mini.append(n);}art.append(img,mini);const txt=el('span','preset-text');txt.append(el('strong','',m.nome),el('small','',m.descricao));b.append(art,txt);list.append(b);}content.append(list,caixa('Os modelos são totalmente combináveis. Trocar de modelo substitui a composição da prévia; o botão Desfazer recupera a anterior.'));
    }else if(aba==='identidade'){
      content.append(titulo('NOME E ASSINATURA','O começo da sua história','Uma biblioteca própria, reconhecível em cada detalhe.'),textoCampo('nome','Nome da biblioteca',100),textoCampo('subtitulo','Assinatura ou subtítulo',160),textoCampo('chamada','Título de boas-vindas'),textoCampo('descricao','Mensagem de apresentação'),separador(),checkCampo('mostrarLogo','Mostrar o logo'),componenteImagem('logo','Logo da biblioteca'),rangeCampo('tamanhoLogo','Tamanho do logo',40,110,' px'));
    }else if(aba==='cores'){
      content.append(titulo('ATMOSFERA E LEITURA','Cores que contam histórias','Três paletas prontas ou uma combinação só sua. O contraste é conferido antes de aplicar.'));
      const g=grupo('Paletas prontas'),grid=el('div','choice-grid');for(const [id,p]of Object.entries(M.paletas)){const b=botao('',()=>{const s=copia(rascunho);for(const k of ['cor','papel','superficie','tinta','suave'])s[k]=p[k];s.paleta=id;mudarConjunto(s);},'choice');b.setAttribute('aria-pressed',String(rascunho.paleta===id&&['cor','papel','superficie','tinta','suave'].every(k=>rascunho[k]===p[k])));const sw=el('span','choice-art swatch');for(const k of ['cor','papel','tinta']){const n=el('span');n.style.background=p[k];sw.append(n);}b.append(sw,el('span','',p.nome));grid.append(b);}g.append(grid);content.append(g);
      const colors=el('div','two-fields');for(const [k,n]of [['cor','Destaques e botões'],['papel','Fundo da página'],['superficie','Cartões e cabeçalho'],['tinta','Texto principal']]){const lab=el('label','form-label',n),input=el('input','form-input');input.type='color';input.value=rascunho[k];input.id='campo-'+k;input.addEventListener('input',()=>{mudar(k,input.value,false);const ratio=Math.min(M.contraste(rascunho.tinta,rascunho.superficie),M.contraste(rascunho.tinta,rascunho.papel));$('contraste-cor').textContent='Contraste do texto: '+ratio.toFixed(1)+':1. '+(ratio>=4.5?'Adequado para leitura.':'Ajuste as cores para atingir pelo menos 4,5:1.');$('contraste-cor').className='validation'+(ratio>=4.5?' success':'');});lab.append(input);colors.append(lab);}content.append(colors);
      const ratio=Math.min(M.contraste(rascunho.tinta,rascunho.superficie),M.contraste(rascunho.tinta,rascunho.papel));const status=el('p','validation'+(ratio>=4.5?' success':''),'Contraste do texto: '+ratio.toFixed(1)+':1. '+(ratio>=4.5?'Adequado para leitura.':'Ajuste as cores para atingir pelo menos 4,5:1.'));status.id='contraste-cor';status.setAttribute('role','status');content.append(status,separador(),selectCampo('fonte','Família de letras'));
    }else if(aba==='cenario'){
      content.append(titulo('CENÁRIO DO ACERVO','Um lugar para suas leituras','Ajuste o fundo e as duas laterais separadamente. Elas se repetem do topo ao fim da página e cedem espaço ao catálogo no celular.'),checkCampo('mostrarFundo','Mostrar imagem de fundo'),componenteImagem('fundo','Fundo da página'),rangeCampo('opacidadeFundo','Intensidade do fundo',0,100,'%'),selectCampo('ajusteFundo','Como ajustar a imagem'),selectCampo('posicaoFundo','Enquadramento'),separador(),checkCampo('mostrarLaterais','Mostrar artes laterais'),componenteImagem('esquerda','Lateral esquerda'),componenteImagem('direita','Lateral direita'),selectCampo('laterais','Composição das laterais'),rangeCampo('opacidadeLaterais','Intensidade das laterais',0,100,'%'),rangeCampo('larguraLaterais','Largura de cada lateral',60,220,' px'));
    }else if(aba==='simbolos'){
      content.append(titulo('PEQUENOS FAVORITOS','Uma nota com a sua cara','A escala continua de 0 a 5. Você escolhe o símbolo que representa cada ponto.'),componenteImagem('nota','Símbolo das avaliações'),rangeCampo('tamanhoNota','Tamanho do símbolo',14,32,' px'),caixa('A transparência é opcional. A imagem é ajustada ao espaço do símbolo, e os pontos não preenchidos aparecem suaves.'),separador(),componenteImagem('capa','Capa para livros sem imagem'));
    }else if(aba==='composicao'){
      content.append(titulo('DO TRAÇO AO ESPAÇAMENTO','O estilo está nos detalhes','O traço escolhido acompanha os logos, as artes e os ornamentos dos modelos prontos.'),selectCampo('arte','Estilo das artes prontas'),selectCampo('efeito','Tratamento das imagens enviadas'),separador(),checkCampo('mostrarDivisor','Mostrar separador decorativo'),componenteImagem('divisor','Separador entre seções'),separador(),selectCampo('cabecalho','Composição do cabeçalho'),selectCampo('cartao','Apresentação dos livros'),selectCampo('cantos','Formato dos cantos'),selectCampo('espaco','Espaçamento do acervo'),selectCampo('paginacao','Estilo da paginação'));
    }else if(aba==='compartilhar')renderCompartilhar(content);
    else if(aba==='conta')renderConta(content);
    else if(aba==='arquivo'){
      content.append(titulo('GUARDE SUA COMPOSIÇÃO','Um modelo para continuar depois','Salve sua identidade visual com as imagens que enviou. Este arquivo contém somente a personalização, sem livros nem contas.'),botao('↓ Exportar modelo da prévia',exportarModelo,'button primary'),separador(),el('h3','group-title','Continuar a partir de um arquivo'),el('p','section-intro','Importe um modelo de personalização exportado pela biblioteca. As imagens são conferidas novamente antes de aparecerem.'),botao('↑ Importar modelo',()=>$('importar-arquivo').click()),caixa('Salvar personalização guarda a composição na sua conta. O modelo exportado permite reutilizar suas escolhas e imagens em outra composição.'),separador(),botao('Restaurar Jardim de papel',()=>mudarConjunto(M.modelo('jardim'))));
    }
    if(aba==='arquivo')content.append(separador(),botao('Backup completo dos livros',()=>window.Conta.abrirGestao('backup')));
    content.scrollTop=scroll;
    if(foco&&document.getElementById(foco)&&content.contains(document.getElementById(foco)))document.getElementById(foco).focus({preventScroll:true});
    atualizarEstado();
  }
  function abrirConfig(nome){aba=nome||aba;for(const b of $('categorias').children)b.setAttribute('aria-current',b.dataset.aba===aba?'page':'false');$('conteudo-config').scrollTop=0;renderSecao();renderPreview();if(!$('configuracoes').open)$('configuracoes').showModal();if(aba==='compartilhar')carregarConvites();}
  async function api(rota,method,body){return window.Conta.json(rota,{method:method||'GET',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
  function pacote(s){const usados=new Set(Object.entries(s.uploads).filter(([k])=>s[k]==='custom').map(([,id])=>id));return {estado:copia(s),arquivos:[...usados].map(id=>arquivos.get(id)).filter(Boolean)};}
  async function aplicar(){
    const b=$('aplicar');b.disabled=true;b.textContent='Salvando…';const atual=bibliotecaId;
    try {
      if(!pronto||!window.Conta.podeEditar())throw new Error('Abra sua biblioteca antes de personalizar.');
      const estado=M.normalizar(rascunho);if(!contrasteValido(estado))throw new Error('Ajuste o contraste das cores para salvar.');
      const doc=await api('/api/aparencia','PUT',pacote(estado));
      if(atual!==bibliotecaId)return;
      aplicado=M.normalizar(doc.estado);rascunho=copia(aplicado);arquivos=new Map(doc.arquivos.map(a=>[a.id,a]));historico=[];
      window.Conta.atualizarBiblioteca(doc.biblioteca);renderHome();renderPreview();renderSecao();
      window.dispatchEvent(new Event('personalizacao:alterada'));aviso('Personalização salva na sua conta. Ela acompanha seus próximos acessos.');
    }catch(e){if(e.name!=='AbortError')aviso(e.message);}finally{b.textContent='Salvar personalização';atualizarEstado();}
  }
  async function prepararImagem(slot,file){
    const erro=M.validarArquivo(slot,file.size);if(erro)throw new Error(erro);
    const r=await window.Conta.fetch('/api/imagens/'+slot,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Nome-Imagem':encodeURIComponent(file.name)},body:file});
    const dados=await r.json();if(!r.ok)throw new Error(dados.erro||'Não foi possível preparar a imagem.');return dados;
  }
  async function importarDocumento(doc){const atual=bibliotecaId;
    if(!doc||doc.formato!=='atelier-biblioteca'||doc.versao!==1||!Array.isArray(doc.arquivos)||doc.arquivos.length>7)throw new Error('Este arquivo não é um modelo compatível.');
    const estado=M.normalizar(doc.estado),novos=new Map();
    for(const [slot,id]of Object.entries(estado.uploads)){
      if(estado[slot]!=='custom')continue;const a=doc.arquivos.find(item=>item.id===id);const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(a?.url||'');if(!match)throw new Error('Uma imagem do modelo é inválida.');
      const str=atob(match[2]);const dados=new Uint8Array(str.length);for(let i=0;i<str.length;i++)dados[i]=str.charCodeAt(i);const file=new File([dados],String(a.nome||'imagem'),{type:match[1]});const pronta=await prepararImagem(slot,file);estado.uploads[slot]=pronta.id;novos.set(pronta.id,pronta);
    }
    if(atual!==bibliotecaId)throw new DOMException('A biblioteca foi alterada.','AbortError');for(const [id,a]of novos)arquivos.set(id,a);return estado;
  }
  function download(conteudo,nome,tipo){const blob=new Blob([conteudo],{type:tipo}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=nome;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportarModelo(){try{const estado=M.normalizar(rascunho),doc={formato:'atelier-biblioteca',versao:1,exportado_em:new Date().toISOString(),...pacote(estado)};download(JSON.stringify(doc,null,2),'modelo-da-biblioteca.json','application/json');aviso('Modelo exportado com as imagens em uso.');}catch(e){aviso(e.message);}}
  function renderConta(content){
    content.append(titulo('UMA CONTA, UMA BIBLIOTECA','Seus acessos','Sua biblioteca própria fica em Minha biblioteca. Acervos de outras pessoas aparecem em Compartilhadas comigo.'));
    const propria=window.Conta.bibliotecas().find(b=>b.proprietario_id===window.Conta.usuario()?.id);
    const recebidas=window.Conta.bibliotecas().filter(b=>b.id!==propria?.id);
    if(propria){const row=el('div','access-row');row.append(el('span','avatar','◎'),el('strong','',propria.nome),el('span','shared-label','Minha biblioteca'));content.append(row);}
    content.append(el('h3','group-title','Compartilhadas comigo'));
    if(!recebidas.length)content.append(caixa('Você ainda não recebeu acesso a outras bibliotecas.'));
    for(const b of recebidas){const row=el('div','access-row');row.append(el('strong','',b.nome),el('span','shared-label','Só visualização'));content.append(row);}
    content.append(separador(),botao('Gerenciar acessos por e-mail',()=>window.Conta.abrirGestao('acessos')),botao('Backup e restauração',()=>window.Conta.abrirGestao('backup')));
  }
  async function carregarConvites(){
    if(carregandoConvites||!pronto)return;const atual=bibliotecaId;carregandoConvites=true;
    try{const lista=await api('/api/convites');if(atual!==bibliotecaId)return;convites=lista;if(aba==='compartilhar')renderSecao();}
    catch(e){if(e.name!=='AbortError')aviso(e.message);}finally{carregandoConvites=false;}
  }
  function renderCompartilhar(content){
    content.append(titulo('UM CONVITE PARA DESCOBRIR','Seu acervo, de portas abertas','Compartilhe somente esta biblioteca. A pessoa abre o catálogo sem cadastro, busca e consulta os livros; as alterações continuam com você.'),caixa('O link permite apenas consulta. Dados da conta e nomes de quem pegou livros emprestados não são enviados ao visitante.'));
    if(pendente())content.append(el('p','invalid-note','Salve a personalização antes de gerar um convite. O link mostra a composição salva na sua conta.'));
    const label=el('label','form-label','Validade do convite'),sel=el('select','form-select');sel.id='dias-link';
    for(const [v,n]of [[1,'24 horas'],[7,'7 dias'],[30,'30 dias']]){const o=el('option','',n);o.value=v;sel.append(o);}sel.value='7';label.append(sel);content.append(label);
    for(const [id,t,marcado]of [['link-notas','Mostrar avaliações',true],['link-local','Mostrar localização física dos livros',false]]){const lab=el('label','checkbox-row'),cb=el('input');cb.type='checkbox';cb.id=id;cb.checked=marcado;lab.append(cb,document.createTextNode(t));content.append(lab);}
    const gerar=botao('↗ Gerar link de visitante',async()=>{gerar.disabled=true;try{linkAtual=await api('/api/convites','POST',{dias:Number(sel.value),avaliacoes:$('link-notas').checked,localizacao:$('link-local').checked});renderSecao();await carregarConvites();aviso('Convite criado. Copie o endereço e envie à pessoa que vai visitar.');}catch(e){aviso(e.message);gerar.disabled=false;}},'button primary');gerar.disabled=pendente()||!pronto;content.append(gerar);
    if(linkAtual){
      const box=el('div','link-result');box.append(el('strong','group-title','Seu convite está pronto'));
      const lab=el('label','form-label','Endereço do convite'),input=el('input','share-url');input.readOnly=true;input.value=location.origin+linkAtual.caminho;input.id='link-visitante';lab.append(input);box.append(lab,el('p','hint','Válido até '+new Date(linkAtual.expira).toLocaleString('pt-BR')+'. Copie o endereço antes de sair desta biblioteca.'));
      const acts=el('div','action-row');acts.append(botao('Copiar link',async()=>{try{await navigator.clipboard.writeText(input.value);aviso('Link copiado.');}catch{input.focus();input.select();aviso('Selecione e copie o endereço exibido.');}}));
      const abrir=el('a','button','Abrir como visitante ↗');abrir.href=linkAtual.caminho;abrir.target='_blank';abrir.rel='noopener';acts.append(abrir);box.append(acts);content.append(box);
    }
    content.append(separador(),el('h3','group-title','Convites desta biblioteca'));
    if(!convites.length)content.append(el('p','hint','Nenhum convite gerado.'));
    for(const c of convites){
      const ativo=!c.revogado_em&&new Date(c.expira_em)>new Date(),row=el('div','access-row'),info=el('div');
      info.append(el('strong','',c.revogado_em?'Revogado':ativo?'Convite ativo':'Expirado'),el('small','','Válido até '+new Date(c.expira_em).toLocaleString('pt-BR')));row.append(info);
      if(ativo)row.append(botao('Revogar',async()=>{try{await api('/api/convites/'+c.id,'DELETE');if(linkAtual?.id===c.id)linkAtual=null;await carregarConvites();aviso('Convite revogado. Novas consultas por esse link serão bloqueadas.');}catch(e){aviso(e.message);}},'button danger'));content.append(row);
    }
    content.append(caixa('Qualquer pessoa com o link poderá consultar esta biblioteca até ele expirar ou ser revogado. Uma página já carregada pode continuar exibindo o conteúdo recebido.'),botao('Atualizar convites',carregarConvites));
  }
  function abrirLivro(l,s,publico){const corpo=$('livro-corpo');corpo.replaceChildren();const top=el('div','book-detail-top'),img=el('img',!l.capa&&s.capa==='custom'?'art-'+s.efeito:'');img.src=capa(l,s);img.alt='Capa de '+l.titulo;const texto=el('div'),nome=el('h2','',l.titulo);nome.id='livro-title';texto.append(nome,el('p','',l.autor+' · '+l.genero),el('span','lib-status',l.status));top.append(img,texto);corpo.append(top,el('p','book-detail-note','Prévia da apresentação do livro com as cores, artes e símbolos que você está escolhendo.'));
    if(!publico||opcoesVisita.avaliacoes)corpo.append(rating(notas.get(l.id)??l.nota,s,true));
    corpo.append(el('p','subtle-box','Prévia da apresentação do livro. Feche para continuar personalizando.'));
    if(!publico||opcoesVisita.localizacao)corpo.append(el('p','book-detail-note','Localização: '+l.local));if(!$('livro-dialog').open)$('livro-dialog').showModal();
  }
  async function carregarPersonalizacao(){
    const b=window.Conta.biblioteca();
    bibliotecaId=b?.id||null;pronto=false;arquivos=new Map();historico=[];linkAtual=null;convites=[];notas.clear();
    livrosPreview=M.livros;metricasPreview=[6,2,2];aplicado=M.modelo('jardim');rascunho=copia(aplicado);
    for(const id of ['preview-biblioteca','biblioteca-ampliada','conteudo-config','livro-corpo'])$(id).replaceChildren();
    $('abrir-configuracao').disabled=true;
    if(!b){window.TemaBiblioteca.limpar();return;}
    const id=b.id,g=window.Conta.geracao();
    try{
      const doc=window.Conta.visitante()?(window.Conta.dadosVisita()?.aparencia||{estado:M.legado(b),arquivos:[]}):await api('/api/aparencia');
      if(bibliotecaId!==id||window.Conta.geracao()!==g)return;
      aplicado=M.normalizar(doc.estado);rascunho=copia(aplicado);arquivos=new Map((doc.arquivos||[]).map(a=>[a.id,a]));pronto=true;renderHome();renderPreview();
      $('abrir-configuracao').disabled=false;window.dispatchEvent(new Event('personalizacao:alterada'));
      if(window.Conta.podeEditar()){
        const [itens,resumo]=await Promise.all([api('/api/itens?limite=4&pagina=1'),api('/api/filtros')]);
        if(bibliotecaId!==id||window.Conta.geracao()!==g)return;
        if(itens.itens?.length){livrosPreview=itens.itens.map(l=>({...l,nota:l.avaliacao||0,local:l.localizacao,capa:Boolean(l.capa_url),status:{nao_lido:'Não lido',lendo:'Lendo',lido:'Lido'}[l.status]||l.status}));metricasPreview=[resumo.total,resumo.lendo,resumo.lidos];}
        else{livrosPreview=M.livros;metricasPreview=[6,2,2];}
        $('contexto-previa').textContent=itens.itens?.length?'Prévia com os livros do seu acervo.':'Prévia com livros de exemplo. Sua biblioteca está vazia.';
        renderPreview();
      }
    }catch(e){if(e.name!=='AbortError'&&bibliotecaId===id){$('erro-global').textContent=e.message;$('erro-global').hidden=false;$('abrir-configuracao').disabled=false;}}
  }
  $('abrir-configuracao').addEventListener('click',async()=>{if(!window.Conta.podeEditar())return;if(!pronto)await carregarPersonalizacao();if(pronto)abrirConfig('modelos');});
  $('fechar-config').addEventListener('click',()=>$('configuracoes').close());
  $('aplicar').addEventListener('click',aplicar);
  $('desfazer').addEventListener('click',()=>{if(historico.length){rascunho=historico.pop();renderPreview();renderSecao();}});
  $('descartar').addEventListener('click',()=>{rascunho=copia(aplicado);historico=[];renderPreview();renderSecao();aviso('Prévia voltou à composição salva.');});
  $('preview-desktop').addEventListener('click',()=>{mobile=false;$('preview-desktop').setAttribute('aria-pressed','true');$('preview-mobile').setAttribute('aria-pressed','false');renderPreview();});
  $('preview-mobile').addEventListener('click',()=>{mobile=true;$('preview-desktop').setAttribute('aria-pressed','false');$('preview-mobile').setAttribute('aria-pressed','true');renderPreview();});
  $('ampliar-previa').addEventListener('click',()=>{renderBiblioteca($('biblioteca-ampliada'),rascunho,true);$('preview-ampliada').showModal();});
  $('fechar-previa').addEventListener('click',()=>$('preview-ampliada').close());
  $('fechar-livro').addEventListener('click',()=>$('livro-dialog').close());
  $('importar-arquivo').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>24*1024*1024)throw new Error('O arquivo excede 24 MB.');const estado=await importarDocumento(JSON.parse(await file.text()));mudarConjunto(estado);aviso('Modelo importado para a prévia. Salve para usar na sua biblioteca.');}catch(err){if(err.name!=='AbortError')aviso(err instanceof SyntaxError?'O arquivo não contém um modelo válido.':err.message);}finally{e.target.value='';}});
  for(const [id,icone,nome]of categorias){const b=botao('',()=>abrirConfig(id),'nav-item');b.dataset.aba=id;b.append(el('span','nav-mark',icone),el('span','',nome));$('categorias').append(b);}
  $('categorias').append(el('p','nav-note','Uma única biblioteca própria. Personalização salva na sua conta.'));
  window.addEventListener('conta:alterada',carregarPersonalizacao);
  if(window.Conta.biblioteca())carregarPersonalizacao();
})();
