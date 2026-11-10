(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let cliente = null;
  let sessao = null;
  let bibliotecaAtual = null;
  let bibliotecas = [];
  const visita = /^\/visita\/([^/]+)\/?$/.exec(location.pathname);
  let dadosVisita = null;
  let usuarioAtual = null;
  let modo = "entrar";
  let geracao = 0;
  let carregandoConta = false;
  let autenticando = false;
  let inicializando = true;
  let recuperacao = /(?:[?#&])type=recovery(?:&|$)/.test(location.hash + location.search);
  let backupSelecionado = null;
  let bibliotecaDoBackup = null;

  function mensagem(id, texto, erro = false) {
    const el = $(id);
    el.textContent = texto;
    el.dataset.erro = String(erro);
    el.hidden = !texto;
  }

  function erroLegivel(erro) {
    const texto = String(erro?.message || erro || "Não foi possível concluir a operação.");
    if (/Invalid login credentials/i.test(texto)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(texto)) return "Confirme seu e-mail pelo link recebido antes de entrar.";
    if (/User already registered/i.test(texto)) return "Este e-mail já tem uma conta. Entre ou recupere sua senha.";
    if (/rate limit|too many requests|after \d+ seconds/i.test(texto)) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
    if (/Password should|weak password/i.test(texto)) return "Escolha uma senha mais forte, com pelo menos 8 caracteres.";
    if (/Failed to fetch|NetworkError|fetch failed/i.test(texto)) return "Não foi possível conectar. Confira sua internet e tente novamente.";
    if (/Auth session missing|session.*expired|invalid.*refresh token/i.test(texto)) return "Sua sessão expirou. Entre novamente para continuar.";
    if (/expired|invalid.*token|otp_expired/i.test(texto)) return "O link expirou ou já foi usado. Solicite um novo link de recuperação.";
    return texto;
  }

  async function ocupado(form, tarefa) {
    const controles = [...form.querySelectorAll("button, input, select")];
    const anteriores = controles.map(el => el.disabled);
    controles.forEach(el => { el.disabled = true; });
    form.setAttribute("aria-busy", "true");
    try { return await tarefa(); }
    finally {
      controles.forEach((el, i) => { el.disabled = anteriores[i]; });
      form.removeAttribute("aria-busy");
    }
  }

  function notificar() {
    window.dispatchEvent(new CustomEvent("conta:alterada", { detail: { biblioteca: bibliotecaAtual } }));
  }

  function guardarBiblioteca(id) {
    try {
      const chave = `biblioteca-ativa:${sessao?.user?.id || ""}`;
      if (id) localStorage.setItem(chave, id);
      return localStorage.getItem(chave);
    } catch { return null; }
  }

  function restaurarTema() {
    window.TemaBiblioteca.limpar();
    document.body.dataset.tema = "floral";
    ["--primario", "--primario-hover", "--contraste-primario"].forEach(p => document.documentElement.style.removeProperty(p));
    $("nome-biblioteca").textContent = "Biblioteca Particular";
    $("subtitulo").textContent = "";
    $("assinatura-logo").textContent = "Minha biblioteca";
    document.title = "Biblioteca Particular";
  }

  function aplicarBiblioteca() {
    const b = bibliotecaAtual;
    if (!b) return;
    document.title = b.nome || "Biblioteca Particular";
    $("nome-biblioteca").textContent = b.nome;
    $("subtitulo").textContent = b.subtitulo || "";
    $("assinatura-logo").textContent = (b.subtitulo || b.nome || "Minha biblioteca").slice(0, 25);
    document.body.dataset.tema = ["floral", "verde", "azul"].includes(b.tema) ? b.tema : "floral";
    const cor = /^#[0-9a-f]{6}$/i.test(b.cor_primaria || "") ? b.cor_primaria : "#b58e8d";
    const rgb = [1, 3, 5].map(n => parseInt(cor.slice(n, n + 2), 16));
    const brilho = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    document.documentElement.style.setProperty("--primario", cor);
    document.documentElement.style.setProperty("--primario-hover", `#${rgb.map(n => Math.round(n * .84).toString(16).padStart(2, "0")).join("")}`);
    document.documentElement.style.setProperty("--contraste-primario", brilho > 155 ? "#302d2a" : "#ffffff");
    $("conta-email").textContent = usuarioAtual?.email || sessao?.user?.email || "";
    $("conta-papel").textContent = visita ? "Visitante" : b.papel === "admin" ? "Administrador" : "Visualização";
    $("faixa-visitante").hidden = !visita;
    document.querySelector('.barra-conta').hidden = Boolean(visita);
    for (const id of ["conta-email","conta-atualizar","conta-senha","conta-sair","minha-biblioteca"]) $(id).hidden = Boolean(visita);
    if (visita) { $("acessos-recebidos").hidden = true; $("busca").placeholder = 'Buscar por título, autor, editora ou gênero…'; }
    $("minha-biblioteca").setAttribute("aria-current", b.proprietario_id === usuarioAtual?.id ? "page" : "false");
    $("abrir-novo").hidden = b.papel !== "admin";
    $("abrir-configuracao").hidden = b.papel !== "admin";
    $("aviso-visualizador").hidden = Boolean(visita) || b.papel === "admin";
  }

  function definirModo(novoModo) {
    modo = novoModo;
    const cadastro = modo === "cadastro";
    const recuperar = modo === "recuperar";
    $("acesso-titulo").textContent = cadastro ? "Sua próxima história começa aqui" : recuperar ? "Recupere seu acesso" : "Entre na sua biblioteca";
    $("acesso-descricao").textContent = cadastro ? "Crie sua conta e ganhe uma biblioteca só sua." : recuperar ? "Enviaremos um link para você definir uma nova senha." : "Use sua conta para acessar o mesmo acervo no computador e no celular.";
    $("campo-nome-conta").hidden = !cadastro;
    $("campo-senha").hidden = recuperar;
    $("campo-confirmar-senha").hidden = !cadastro;
    $("form-acesso").elements.senha.required = !recuperar;
    $("form-acesso").elements.confirmar_senha.required = cadastro;
    $("form-acesso").elements.senha.autocomplete = cadastro ? "new-password" : "current-password";
    $("acesso-enviar").textContent = cadastro ? "Criar minha biblioteca" : recuperar ? "Enviar link de recuperação" : "Entrar";
    $("acesso-cadastro").hidden = modo !== "entrar";
    $("acesso-recuperar").hidden = modo !== "entrar";
    $("acesso-voltar").hidden = modo === "entrar";
    mensagem("acesso-mensagem", "");
  }

  function limparConta() {
    geracao++;
    bibliotecaAtual = null;
    usuarioAtual = null;
    bibliotecas = [];
    backupSelecionado = null;
    bibliotecaDoBackup = null;
    carregandoConta = false;
    document.querySelectorAll("dialog[open]").forEach(d => d.close());
    $("area-biblioteca").hidden = true;
    $("acesso").hidden = false;
    $("form-acesso").hidden = !cliente;
    $("acesso-opcoes").hidden = !cliente;
    $("acesso-carregando").hidden = true;
    $("acesso-tentar").hidden = true;
    $("form-acesso").elements.senha.value = "";
    $("form-acesso").elements.confirmar_senha.value = "";
    restaurarTema();
    notificar();
  }

  async function requisicao(url, opcoes = {}) {
    const minhaGeracao = geracao;
    const bibliotecaId = bibliotecaAtual?.id;
    if (visita) {
      const alvo = /^\/api\/(filtros|itens(?:\/\d+)?)(\?.*)?$/.exec(url);
      if (!alvo || (opcoes.method && opcoes.method !== 'GET')) throw new Error('O visitante tem acesso somente para consulta.');
      return fetch('/api/visita/' + encodeURIComponent(visita[1]) + '/' + alvo[1] + (alvo[2] || ''), { cache:'no-store', credentials:'omit' });
    }
    if (!cliente || !sessao) throw new Error("Entre na sua conta para continuar.");
    const { data, error } = await cliente.auth.getSession();
    if (error) throw error;
    if (minhaGeracao !== geracao) throw new DOMException("A biblioteca em uso foi alterada.", "AbortError");
    if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    const headers = new Headers(opcoes.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    if (bibliotecaId) headers.set("X-Biblioteca-Id", bibliotecaId);
    const resposta = await fetch(url, { ...opcoes, headers, cache: "no-store" });
    if (minhaGeracao !== geracao) throw new DOMException("A biblioteca em uso foi alterada.", "AbortError");
    return resposta;
  }

  async function json(url, opcoes = {}) {
    const minhaGeracao = geracao;
    const resposta = await requisicao(url, opcoes);
    const dados = await resposta.json().catch(() => ({}));
    if (minhaGeracao !== geracao) throw new DOMException("A biblioteca em uso foi alterada.", "AbortError");
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
    return dados;
  }

  function enviar(url, method, body) {
    return json(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  async function carregarConta(escolhida) {
    if (!cliente || !sessao) return;
    const minhaGeracao = ++geracao;
    const userId = sessao.user.id;
    const bibliotecaId = escolhida || bibliotecaAtual?.id || guardarBiblioteca();
    carregandoConta = true;
    bibliotecaAtual = null;
    notificar();
    document.querySelectorAll("dialog[open]").forEach(d => d.close());
    $("area-biblioteca").hidden = true;
    $("acesso").hidden = false;
    $("form-acesso").hidden = true;
    $("acesso-opcoes").hidden = true;
    $("acesso-carregando").textContent = "Abrindo sua biblioteca…";
    $("acesso-carregando").hidden = false;
    $("acesso-tentar").hidden = true;
    mensagem("acesso-mensagem", "");
    try {
      const { data, error } = await cliente.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
      const headers = { Authorization: `Bearer ${data.session.access_token}` };
      if (bibliotecaId) headers["X-Biblioteca-Id"] = bibliotecaId;
      let resposta = await fetch("/api/conta", { headers, cache: "no-store" });
      // Uma biblioteca compartilhada pode ter sido revogada desde o último acesso.
      if (bibliotecaId && [403, 404].includes(resposta.status)) {
        delete headers["X-Biblioteca-Id"];
        resposta = await fetch("/api/conta", { headers, cache: "no-store" });
      }
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || "Não foi possível abrir sua biblioteca.");
      if (minhaGeracao !== geracao || userId !== sessao?.user?.id) return;
      bibliotecaAtual = dados.biblioteca;
      usuarioAtual = dados.usuario;
      if (!bibliotecaAtual?.id) throw new Error("Sua conta ainda não tem uma biblioteca disponível. Atualize a página ou contate o responsável pelo site.");
      bibliotecas = dados.bibliotecas || [];
      const recebidas = bibliotecas.filter(b => b.proprietario_id !== usuarioAtual.id);
      const vazio = document.createElement('option'); vazio.value=''; vazio.textContent='Escolha uma biblioteca compartilhada'; vazio.disabled=true;
      $("biblioteca-seletor").replaceChildren(vazio,...recebidas.map(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=b.nome;return o;}));
      $("acessos-recebidos").hidden = !recebidas.length;
      $("biblioteca-seletor").value = recebidas.some(b=>b.id===bibliotecaAtual.id)?bibliotecaAtual.id:'';
      guardarBiblioteca(bibliotecaAtual.id);
      aplicarBiblioteca();
      $("acesso").hidden = true;
      $("area-biblioteca").hidden = false;
      notificar();
      if (recuperacao) abrirNovaSenha();
    } catch (erro) {
      if (minhaGeracao !== geracao) return;
      bibliotecaAtual = null;
      mensagem("acesso-mensagem", erroLegivel(erro), true);
      $("acesso-carregando").hidden = true;
      $("acesso-tentar").hidden = false;
      $("acesso-opcoes").hidden = false;
      $("acesso-voltar").hidden = false;
    } finally {
      if (minhaGeracao === geracao) carregandoConta = false;
    }
  }

  async function carregarMembros() {
    $("lista-membros").textContent = "Carregando acessos…";
    const dados = await json("/api/membros");
    const membros = Array.isArray(dados) ? dados : dados.membros || [];
    const linhas = membros.map(m => {
      const linha = document.createElement("div");
      linha.className = "membro-conta";
      const email = document.createElement("span");
      email.className = "membro-email";
      email.textContent = m.email || "Conta cadastrada";
      const papel = document.createElement("span");
      papel.className = "badge";
      papel.textContent = m.papel === "admin" ? "Administrador" : "Visualização";
      linha.append(email, papel);
      if (m.papel !== "admin") {
        const remover = document.createElement("button");
        remover.type = "button";
        remover.textContent = "Revogar";
        remover.addEventListener("click", async () => {
          if (!confirm(`Revogar o acesso de ${m.email || "esta pessoa"} a esta biblioteca?`)) return;
          remover.disabled = true;
          try {
            await json(`/api/membros/${encodeURIComponent(m.user_id)}`, { method: "DELETE" });
            await carregarMembros();
            mensagem("configuracao-mensagem", "Acesso revogado.");
          } catch (erro) { mensagem("configuracao-mensagem", erroLegivel(erro), true); }
          finally { remover.disabled = false; }
        });
        linha.append(remover);
      }
      return linha;
    });
    $("lista-membros").replaceChildren(...linhas);
    if (!linhas.length) $("lista-membros").textContent = "Nenhum acesso compartilhado.";
  }

  function mudarAba(aba) {
    ["acessos", "backup"].forEach(nome => {
      $("aba-" + nome).setAttribute("aria-selected", String(nome === aba));
      $("aba-" + nome).tabIndex = nome === aba ? 0 : -1;
      $("painel-" + nome).hidden = nome !== aba;
    });
    mensagem("configuracao-mensagem", "");
    if (aba === "acessos") carregarMembros().catch(erro => mensagem("configuracao-mensagem", erroLegivel(erro), true));
  }

  function limparRestauracao() {
    backupSelecionado = null;
    bibliotecaDoBackup = null;
    $("form-restaurar").reset();
    $("resumo-backup").hidden = true;
    $("restaurar-enviar").disabled = true;
    $("nome-confirmacao").textContent = bibliotecaAtual ? `Nome atual: ${bibliotecaAtual.nome}` : "";
  }

  function podeRestaurar() {
    $("restaurar-enviar").disabled = !backupSelecionado || bibliotecaDoBackup !== bibliotecaAtual?.id || $("form-restaurar").elements.confirmacao.value !== bibliotecaAtual?.nome;
  }

  function abrirNovaSenha() {
    $("form-senha").reset();
    mensagem("senha-mensagem", "");
    if (!$("senha-dialogo").open) $("senha-dialogo").showModal();
  }

  $("acesso-cadastro").addEventListener("click", () => definirModo("cadastro"));
  $("acesso-recuperar").addEventListener("click", () => definirModo("recuperar"));
  $("acesso-voltar").addEventListener("click", async () => {
    if (sessao && cliente) {
      await cliente.auth.signOut({ scope: "local" });
      sessao = null;
      limparConta();
    }
    definirModo("entrar");
  });
  $("acesso-tentar").addEventListener("click", () => sessao ? carregarConta() : iniciar());
  $("form-acesso").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!cliente) return;
    const form = ev.currentTarget;
    // Capture valores antes de desabilitar os campos.
    const email = form.elements.email.value.trim();
    const password = form.elements.senha.value;
    const nome = form.elements.nome.value.trim();
    const modoEnviado = modo;
    if (modoEnviado === "cadastro" && password !== form.elements.confirmar_senha.value) {
      mensagem("acesso-mensagem", "As senhas precisam ser iguais.", true);
      return;
    }
    mensagem("acesso-mensagem", "");
    autenticando = true;
    try {
      await ocupado(form, async () => {
        const redirectTo = location.origin + location.pathname;
        if (modoEnviado === "recuperar") {
          const { error } = await cliente.auth.resetPasswordForEmail(email, { redirectTo });
          if (error) throw error;
          mensagem("acesso-mensagem", "Se este e-mail tiver uma conta, você receberá um link para recuperar o acesso. Confira também a caixa de spam.");
          return;
        }
        const resultado = modoEnviado === "cadastro"
          ? await cliente.auth.signUp({ email, password, options: { data: { nome }, emailRedirectTo: redirectTo } })
          : await cliente.auth.signInWithPassword({ email, password });
        if (resultado.error) throw resultado.error;
        form.elements.senha.value = "";
        form.elements.confirmar_senha.value = "";
        if (!resultado.data.session) {
          mensagem("acesso-mensagem", "Confira seu e-mail para confirmar a conta. Depois, entre aqui com sua senha.");
          return;
        }
        sessao = resultado.data.session;
        await carregarConta();
      });
    } catch (erro) { mensagem("acesso-mensagem", erroLegivel(erro), true); }
    finally { autenticando = false; }
  });

  $("biblioteca-seletor").addEventListener("change", ev => carregarConta(ev.target.value));
  $("minha-biblioteca").addEventListener("click",()=>{const propria=bibliotecas.find(b=>b.proprietario_id===usuarioAtual?.id);if(propria&&propria.id!==bibliotecaAtual?.id)carregarConta(propria.id);});
  $("conta-atualizar").addEventListener("click", () => carregarConta());
  $("conta-sair").addEventListener("click", async ev => {
    ev.currentTarget.disabled = true;
    try {
      const { error } = await cliente.auth.signOut({ scope: "local" });
      if (error) throw error;
      sessao = null;
      limparConta();
      definirModo("entrar");
    } catch (erro) { alert(erroLegivel(erro)); }
    finally { $("conta-sair").disabled = false; }
  });
  $("conta-senha").addEventListener("click", abrirNovaSenha);
  ["acessos", "backup"].forEach((aba, indice, abas) => {
    const el = $("aba-" + aba);
    el.addEventListener("click", () => mudarAba(aba));
    el.addEventListener("keydown", ev => {
      let destino;
      if (ev.key === "ArrowRight") destino = (indice + 1) % abas.length;
      else if (ev.key === "ArrowLeft") destino = (indice + abas.length - 1) % abas.length;
      else if (ev.key === "Home") destino = 0;
      else if (ev.key === "End") destino = abas.length - 1;
      else return;
      ev.preventDefault();
      mudarAba(abas[destino]);
      $("aba-" + abas[destino]).focus();
    });
  });

  $("form-compartilhar").addEventListener("submit", async ev => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const email = form.elements.email.value.trim();
    try {
      await ocupado(form, async () => {
        await enviar("/api/membros", "POST", { email });
        form.reset();
        await carregarMembros();
        mensagem("configuracao-mensagem", "Visualização liberada. A pessoa já pode entrar e selecionar esta biblioteca.");
      });
    } catch (erro) { mensagem("configuracao-mensagem", erroLegivel(erro), true); }
  });

  $("baixar-backup").addEventListener("click", async ev => {
    const b = ev.currentTarget;
    const minhaGeracao = geracao;
    b.disabled = true;
    try {
      const resposta = await requisicao("/api/backup");
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || "Não foi possível baixar o backup.");
      }
      const blob = await resposta.blob();
      if (minhaGeracao !== geracao) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `biblioteca-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mensagem("configuracao-mensagem", "Backup baixado. Guarde o arquivo em um lugar seguro.");
    } catch (erro) { mensagem("configuracao-mensagem", erroLegivel(erro), true); }
    finally { b.disabled = false; }
  });

  $("arquivo-backup").addEventListener("change", async ev => {
    backupSelecionado = null;
    bibliotecaDoBackup = null;
    $("resumo-backup").hidden = true;
    podeRestaurar();
    const arquivo = ev.target.files[0];
    const bibliotecaId = bibliotecaAtual?.id;
    if (!arquivo) return;
    try {
      if (arquivo.size > 24 * 1024 * 1024) throw new Error("O arquivo ultrapassa o limite de 24 MB.");
      const dados = JSON.parse(await arquivo.text());
      if (bibliotecaId !== bibliotecaAtual?.id || arquivo !== $("arquivo-backup").files[0]) return;
      if (dados.formato !== "biblioteca-particular" || dados.versao !== 1 || !Array.isArray(dados.livros) || !dados.personalizacao || typeof dados.personalizacao.nome !== "string") {
        throw new Error("Este arquivo não é um backup compatível da Biblioteca Particular.");
      }
      if (dados.livros.length > 10000) throw new Error("O backup pode conter no máximo 10.000 livros.");
      if (dados.livros.some(l => !l || typeof l !== "object" || typeof l.titulo !== "string" || !l.titulo.trim())) {
        throw new Error("O backup contém livros inválidos. Confira o arquivo antes de restaurar.");
      }
      const data = new Date(dados.exportado_em);
      $("resumo-backup").textContent = `Biblioteca no arquivo: ${dados.personalizacao.nome}\nLivros: ${dados.livros.length}\nData da cópia: ${Number.isNaN(data.getTime()) ? "não informada" : data.toLocaleString("pt-BR")}\nDestino da restauração: ${bibliotecaAtual.nome}`;
      $("resumo-backup").hidden = false;
      backupSelecionado = dados;
      bibliotecaDoBackup = bibliotecaId;
      mensagem("configuracao-mensagem", "Confira o resumo e digite o nome da biblioteca atual para habilitar a restauração.");
      podeRestaurar();
    } catch (erro) { mensagem("configuracao-mensagem", erro instanceof SyntaxError ? "Não foi possível ler este arquivo JSON." : erroLegivel(erro), true); }
  });
  $("form-restaurar").elements.confirmacao.addEventListener("input", podeRestaurar);
  $("form-restaurar").addEventListener("submit", async ev => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const confirmacao = form.elements.confirmacao.value;
    if (!backupSelecionado || bibliotecaDoBackup !== bibliotecaAtual?.id || confirmacao !== bibliotecaAtual?.nome) return;
    if (!confirm(`Substituir todos os livros e a personalização de “${bibliotecaAtual.nome}” pelos ${backupSelecionado.livros.length} livro(s) deste backup?`)) return;
    try {
      await ocupado(form, async () => {
        await enviar("/api/restaurar", "POST", { backup: backupSelecionado, confirmacao });
        limparRestauracao();
        await carregarConta();
      });
    } catch (erro) { mensagem("configuracao-mensagem", erroLegivel(erro), true); }
    finally { podeRestaurar(); }
  });

  $("form-senha").addEventListener("submit", async ev => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const password = form.elements.senha.value;
    if (password !== form.elements.confirmacao.value) {
      mensagem("senha-mensagem", "As senhas precisam ser iguais.", true);
      return;
    }
    try {
      await ocupado(form, async () => {
        const { error } = await cliente.auth.updateUser({ password });
        if (error) throw error;
        recuperacao = false;
        form.reset();
        mensagem("senha-mensagem", "Sua nova senha foi salva.");
      });
    } catch (erro) { mensagem("senha-mensagem", erroLegivel(erro), true); }
  });

  async function iniciar() {
    $("acesso-tentar").hidden = true;
    $("acesso-carregando").hidden = false;
    mensagem("acesso-mensagem", "");
    try {
      const resposta = await fetch("/api/config", { cache: "no-store" });
      if (!resposta.ok) throw new Error("Não foi possível carregar a configuração do site.");
      const config = await resposta.json();
      if (!config.configurado || !config.supabaseUrl || !config.supabaseAnonKey) {
        $("acesso-carregando").hidden = true;
        mensagem("acesso-mensagem", "Esta biblioteca está sendo preparada. O responsável pelo site precisa conectar a conta de armazenamento para liberar o acesso.");
        return;
      }
      if (!window.supabase?.createClient) throw new Error("Não foi possível carregar o serviço de acesso. Atualize a página para tentar novamente.");
      if (!cliente) {
        cliente = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        cliente.auth.onAuthStateChange((evento, novaSessao) => {
          const usuarioAnterior = sessao?.user?.id;
          sessao = novaSessao;
          if (evento === "PASSWORD_RECOVERY") recuperacao = true;
          if (inicializando || autenticando) return;
          // Trabalho assíncrono fica fora do callback de autenticação do SDK.
          if (evento === "SIGNED_OUT") setTimeout(() => { limparConta(); definirModo("entrar"); }, 0);
          else if (evento === "PASSWORD_RECOVERY" || (novaSessao && (usuarioAnterior !== novaSessao.user.id || (!bibliotecaAtual && !carregandoConta)))) {
            setTimeout(() => { carregarConta(); }, 0);
          }
        });
      }
      const { data, error } = await cliente.auth.getSession();
      if (error) throw error;
      sessao = data.session;
      inicializando = false;
      if (sessao) await carregarConta();
      else {
        limparConta();
        definirModo("entrar");
        const params = new URLSearchParams(location.hash.slice(1));
        if (params.has("error_description")) mensagem("acesso-mensagem", erroLegivel(params.get("error_description")), true);
      }
    } catch (erro) {
      inicializando = false;
      $("acesso-carregando").hidden = true;
      mensagem("acesso-mensagem", erroLegivel(erro), true);
      $("acesso-tentar").hidden = false;
    }
  }

  async function iniciarVisita() {
    $("acesso").hidden=true;
    try {
      const resposta=await fetch('/api/visita/'+encodeURIComponent(visita[1]),{cache:'no-store',credentials:'omit'});
      const dados=await resposta.json();if(!resposta.ok)throw new Error(dados.erro||'Não foi possível abrir o convite.');
      dadosVisita=dados;bibliotecaAtual=dados.biblioteca;usuarioAtual=null;
      aplicarBiblioteca();$("area-biblioteca").hidden=false;notificar();
    } catch(e) { $("visita-encerrada").hidden=false;$("visita-mensagem").textContent=erroLegivel(e); }
  }
  window.Conta = {
    fetch: requisicao,
    json,
    podeEditar: () => !visita && bibliotecaAtual?.papel === 'admin',
    visitante: () => Boolean(visita),
    dadosVisita: () => dadosVisita,
    bibliotecas: () => bibliotecas,
    usuario: () => usuarioAtual,
    biblioteca: () => bibliotecaAtual,
    geracao: () => geracao,
    atualizarBiblioteca: dados => {if(bibliotecaAtual&&dados?.id===bibliotecaAtual.id){bibliotecaAtual={...bibliotecaAtual,...dados};bibliotecas=bibliotecas.map(b=>b.id===dados.id?bibliotecaAtual:b);aplicarBiblioteca();}},
    abrirGestao: aba => {if(bibliotecaAtual?.papel!=='admin'||visita)return;limparRestauracao();mudarAba(aba||'acessos');$("configuracao").showModal();},
    pronta: null
  };
  window.Conta.pronta = visita ? iniciarVisita() : iniciar();
})();
