(function(){'use strict';const M=window.BibliotecaModelo;window.ArtesBiblioteca={criar(obterArquivos){
  function el(tag,classe){const n=document.createElement(tag);if(classe)n.className=classe;return n;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function svgUrl(corpo,w,h){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+corpo+'</svg>');}
  function atributos(s){return ' stroke="'+s.cor+'" stroke-width="'+(s.arte==='gravura'?1.2:1.7)+'" stroke-linecap="round" stroke-linejoin="round" fill="'+(s.arte==='traco'?'none':s.suave)+'"';}
  function marca(tipo,s){
    const fill=s.arte==='traco'?'none':s.suave;
    let body='';
    if(tipo==='flor'){
      for(let i=0;i<5;i++)body+='<ellipse cx="50" cy="29" rx="11" ry="20" transform="rotate('+i*72+' 50 50)" fill="'+fill+'"/>';
      body+='<circle cx="50" cy="50" r="9" fill="'+s.cor+'"/><path d="M30 76Q10 80 13 60Q28 61 30 76M68 75Q86 83 87 62Q72 62 68 75"/>';
    }else if(tipo==='livro')body='<path d="M50 31Q32 15 10 23V76Q33 68 50 84Q68 68 90 76V23Q68 15 50 31Z"/><path d="M50 31V84M19 34Q32 29 42 37M19 44Q32 39 42 47M19 54Q32 49 42 57M58 37Q69 29 81 34M58 47Q69 39 81 44M58 57Q69 49 81 54"/><path d="M45 15L50 7L55 15"/>';
    else if(tipo==='lua')body='<path d="M66 13A37 37 0 1 0 88 65A35 35 0 0 1 66 13Z"/><path d="M79 13V29M71 21H87M38 43V55M32 49H44M82 43L84 48L90 50L84 52L82 57L80 52L74 50L80 48Z"/>';
    else if(tipo==='estrela')body='<path d="M50 7L61 35L92 37L68 57L76 89L50 72L24 89L32 57L8 37L39 35Z"/>';
    else if(tipo==='coracao')body='<path d="M50 86C44 79 8 57 8 33C8 8 38 6 50 27C62 6 92 8 92 33C92 57 56 79 50 86Z"/>';
    if(s.arte==='gravura')body+='<path d="M22 86L36 72M31 91L45 77M62 85L76 71M67 91L81 77" opacity=".4"/>';
    return '<g'+atributos(s)+'>'+body+'</g>';
  }
  function arte(tipo,s,slot){
    if(slot==='logo'||slot==='nota')return svgUrl(marca(tipo,s),100,100);
    if(slot==='fundo'){
      let body='<rect width="1200" height="800" fill="'+s.papel+'"/>';
      if(tipo==='papel'){
        body+='<defs><pattern id="paper" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M4 3h1M27 15h1M14 40h1M44 31h1" stroke="'+s.cor+'" opacity=".24"/><path d="M3 25h4M31 44h3" stroke="'+s.cor+'" opacity=".09"/></pattern></defs><rect width="1200" height="800" fill="url(#paper)"/>';
      }else if(tipo==='linhas')body+='<defs><pattern id="lines" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M0 46L46 0" stroke="'+s.cor+'" opacity=".1"/></pattern></defs><rect width="1200" height="800" fill="url(#lines)"/>';
      else{
        for(let i=0;i<80;i++){const x=(i*137+61)%1200,y=(i*97+23)%800;body+='<circle cx="'+x+'" cy="'+y+'" r="'+(i%3===0?2:1)+'" fill="'+s.cor+'" opacity=".45"/>';if(i%8===0)body+='<path d="M'+x+' '+y+'l42 25l-8 39" stroke="'+s.cor+'" fill="none" opacity=".13"/>';}
      }
      return svgUrl(body,1200,800);
    }
    if(slot==='esquerda'||slot==='direita'){
      let body='';
      if(tipo==='ramos'){
        body='<path d="M70 800C160 630 20 500 86 350S150 100 84 5" fill="none"/>';
        for(let i=0;i<10;i++){const y=80+i*71,x=85+Math.sin(i*1.3)*32,d=i%2?1:-1;body+='<path d="M'+x+' '+y+'q'+d*38+' -14 '+d*54+' -63q'+(-d*48)+' 9 '+(-d*54)+' 63Z"/><path d="M'+x+' '+y+'l'+d*38+' -42" opacity=".65"/>';if(i%3===0)body+='<g transform="translate('+(x+d*37-23)+' '+(y-75)+') scale(.46)">'+marca('flor',s)+'</g>';}
      }else if(tipo==='livros'){
        body='<path d="M92 800Q145 680 92 555T120 305T88 20" fill="none"/>';
        for(let i=0;i<5;i++){const y=50+i*150,x=50+(i%2)*40;body+='<g transform="translate('+x+' '+y+') rotate('+(i%2?13:-12)+' 55 50)"><path d="M0 8h106v25H0zM12 34h106v22H12zM-4 57h103v26H-4z"/><path d="M10 13v15M23 39v12M8 63v14M98 13v15M110 39v12M90 63v14" fill="none"/></g>';}
      }else{
        body='<path d="M80 65Q190 200 70 340T125 620T80 800" stroke-dasharray="3 8" fill="none"/>';
        for(let i=0;i<8;i++){const x=50+(i*57)%120,y=35+i*95;body+='<g transform="translate('+x+' '+y+') scale(.45)">'+marca(i%3===0?'lua':'estrela',s)+'</g>';}
      }
      return svgUrl('<g'+atributos(s)+'>'+body+'</g>',240,800);
    }
    if(slot==='divisor'){
      const icon=tipo==='ramo'?'flor':tipo==='editorial'?'livro':'estrela';
      let body='<path d="M5 60H420M580 60H995" stroke="'+s.cor+'" stroke-width="1.7" opacity=".4"/>';
      if(tipo==='editorial')body+='<path d="M30 53H400M600 53H970M430 60l20-10l-5 10l5 10ZM570 60l-20-10l5 10l-5 10Z" stroke="'+s.cor+'" fill="none"/>';
      else if(tipo==='ramo')body+='<path d="M330 60q35-40 75 0q-35 32-75 0M595 60q35-40 75 0q-35 32-75 0" stroke="'+s.cor+'" fill="none" opacity=".55"/>';
      body+='<g transform="translate(455 15) scale(.9)">'+marca(icon,s)+'</g>';return svgUrl(body,1000,120);
    }
    return '';
  }
  function urlArte(slot,s){const arquivos=obterArquivos();const id=s.uploads[slot];return s[slot]==='custom'&&arquivos.has(id)?arquivos.get(id).url:arte(s[slot]==='custom'?M.modelo('jardim')[slot]:s[slot],s,slot);}
  function capa(livro,s){const arquivos=obterArquivos();if(/^https?:\/\//i.test(livro.capa_url||''))return livro.capa_url;
    if(!livro.capa&&s.capa==='custom'&&arquivos.has(s.uploads.capa))return arquivos.get(s.uploads.capa).url;
    const tipo=livro.capa?['botanica','editorial','celeste'][(livro.id-1)%3]:s.capa;
    const cor=livro.capa?livro.cor:s.cor;
    let body='<rect width="300" height="450" fill="'+cor+'"/><path d="M15 0V450" stroke="#ffffff" opacity=".13" stroke-width="2"/><rect x="30" y="29" width="240" height="390" rx="2" fill="none" stroke="#ffffff" opacity=".42"/>';
    const st=Object.assign({},s,{cor:'#f6efdc',suave:cor});
    if(tipo==='botanica')body+='<g transform="translate(94 50) scale(1.1)">'+marca('flor',st)+'</g><path d="M64 389q35-45 0-80q-25 30 0 80M236 389q-35-45 0-80q25 30 0 80" stroke="#f6efdc" fill="none" opacity=".6"/>';
    else if(tipo==='editorial')body+='<path d="M55 71H245M55 77H245M55 346H245M55 352H245" stroke="#f6efdc" opacity=".6"/><g transform="translate(122 95) scale(.56)">'+marca('livro',st)+'</g>';
    else{body+='<g transform="translate(100 45) scale(1)">'+marca('lua',st)+'</g>';for(let i=0;i<24;i++)body+='<circle cx="'+(38+(i*47)%224)+'" cy="'+(45+(i*73)%344)+'" r="1.4" fill="#f6efdc" opacity=".5"/>';}
    const palavras=livro.titulo.split(' '),linhas=[];let atual='';for(const p of palavras){if((atual+' '+p).trim().length>18){linhas.push(atual);atual=p;}else atual=(atual+' '+p).trim();}if(atual)linhas.push(atual);
    const y=207-(linhas.length-2)*12;
    linhas.forEach((l,i)=>{body+='<text x="150" y="'+(y+i*35)+'" text-anchor="middle" font-family="Georgia,serif" font-size="27" fill="#fff8e8">'+esc(l)+'</text>';});
    body+='<text x="150" y="386" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" letter-spacing="2" fill="#fff8e8">'+esc(livro.autor.toUpperCase())+'</text>';
    return svgUrl(body,300,450);
  }
  function rating(nota,s,grande){const row=el('span','lib-rating');row.setAttribute('aria-label',nota+' de 5');if(grande)row.style.setProperty('--lib-nota','25px');for(let i=1;i<=5;i++){const img=el('img',(i>nota?'off ':'')+(s.nota==='custom'?'art-'+s.efeito:''));img.src=urlArte('nota',s);img.alt='';img.setAttribute('aria-hidden','true');row.append(img);}return row;}

return {svgUrl,marca,arte,urlArte,capa,rating};}};})();
