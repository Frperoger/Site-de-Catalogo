(function () {
  const $ = (id) => document.getElementById(id);

  const STATUS_ROTULO = { nao_lido: "Não lido", lendo: "Lendo", lido: "Lido" };
  const LIMITE = 50;
  const FAIXAS = [
    ["", "Qualquer"],
    ["ate200", "Até 200 páginas"],
    ["de200a400", "201 a 400 páginas"],
    ["mais400", "Mais de 400 páginas"],
  ];
  const JANELAS = [
    ["", "Qualquer"],
    ["7", "Últimos 7 dias"],
    ["30", "Últimos 30 dias"],
    ["365", "Último ano"],
  ];
  const ORDENACOES = [
    ["titulo", "Título (A–Z)"],
    ["autor", "Autor"],
    ["recentes", "Mais recentes"],
    ["avaliacao", "Melhor avaliados"],
    ["paginas", "Mais páginas"],
  ];

  const estado = {
    q: "",
    status: "",
    genero: "",
    favorito: false,
    emprestado: false,
    avaliacao: "",
    faixa: "",
    cadastro: "",
    ordenar: "titulo",
    pagina: 1,
  };

  const selecionados = new Map(); // id -> título
  const lista = $("lista");
  const formLivro = $("form-livro");
  const salvarBtn = $("salvar-livro");

  let resumoFiltros = null;
  let ultimaRequisicao = 0;
  let timerBusca = null;
  let livroAberto = null;
  let editandoId = null;

  // ---------- Utilitários ----------

  async function api(url, opcoes = {}) {
    const resposta = await fetch(url, opcoes);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Falha na comunicação com o servidor.");
    return dados;
  }

  function enviarJson(url, metodo, corpo) {
    return api(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function criarOpcao(valor, texto = valor) {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  }

  function botao(texto, acao, classe = "") {
    const b = criar("button", classe, texto);
    b.type = "button";
    b.addEventListener("click", acao);
    return b;
  }

  function abrir(dialogo) {
    if (!dialogo.open) dialogo.showModal();
  }

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  // Aceita tanto ["Engenharia"] quanto [{ nome: "Engenharia", total: 2 }]
  function normalizarGeneros(generos) {
    return (generos || [])
      .map(g => (typeof g === "string" ? { nome: g, total: null } : { nome: g.nome, total: g.total }))
      .filter(g => g.nome && String(g.nome).trim());
  }

  function mostrarErro(mensagem) {
    $("erro-global").textContent = mensagem;
    $("erro-global").hidden = false;
  }

  function ocultarErro() {
    $("erro-global").hidden = true;
  }

  function mostrarErroDetalhe(mensagem) {
    const corpo = $("detalhe-corpo");
    corpo.querySelectorAll(".erro").forEach(e => e.remove());
    corpo.prepend(criar("p", "erro", mensagem));
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = criar("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function nomeDoArquivo(cabecalho) {
    const m = /filename="([^"]+)"/.exec(cabecalho || "");
    return m ? m[1] : null;
  }

  // ---------- Componentes visuais ----------

  function criarCapa(livro) {
    const capa = criar("div", "capa");
    if (livro.capa_url) {
      const img = document.createElement("img");
      img.src = livro.capa_url;
      img.alt = `Capa de ${livro.titulo}`;
      img.loading = "lazy";
      img.addEventListener("error", () => capa.replaceChildren(criar("span", "", "✿")));
      capa.appendChild(img);
    } else {
      capa.appendChild(criar("span", "", "✿"));
    }
    return capa;
  }

  function criarBadges(livro) {
    const area = criar("div", "badges");
    area.appendChild(criar("span", `badge ${livro.status}`, STATUS_ROTULO[livro.status]));
    if (livro.favorito) {
      const badgeFavorito = criar("span", "badge favorito");
      badgeFavorito.append(criarFlor(true, 14), document.createTextNode("Favorito"));
      area.appendChild(badgeFavorito);
    }
    if (livro.emprestado) area.appendChild(criar("span", "badge emprestado", "Emprestado"));
    return area;
  }

  function criarTags(tags) {
    const area = criar("div", "badges");
    tags.forEach(t => area.appendChild(criar("span", "badge", t)));
    return area;
  }

  function criarEstrelas(nota) {
    const area = criar("span", "flores-card");
    area.setAttribute("aria-label", `${nota} de 5 flores`);
    for (let i = 1; i <= 5; i++) {
      area.appendChild(criarFlor(i <= nota, 16));
    }
    return area;
  }

  // ---------- Filtros, métricas e pills ----------

  function preencherSelect(id, opcoes) {
    $(id).replaceChildren(...opcoes.map(([valor, texto]) => criarOpcao(valor, texto)));
  }

  function contarFiltrosAtivos() {
    const textuais = ["q", "status", "genero", "avaliacao", "faixa", "cadastro"]
      .filter(k => estado[k]).length;
    return textuais + (estado.favorito ? 1 : 0) + (estado.emprestado ? 1 : 0);
  }

  function atualizarResumoFiltros() {
    const n = contarFiltrosAtivos();
    $("filtros-ativos").textContent = n ? `${n} filtro(s) ativo(s)` : "Nenhum filtro ativo";
  }

  function sincronizarControles() {
    $("filtro-genero").value = estado.genero;
    $("filtro-status").value = estado.status;
    $("filtro-avaliacao").value = estado.avaliacao;
    $("filtro-faixa").value = estado.faixa;
    $("filtro-cadastro").value = estado.cadastro;
    $("filtro-ordenar").value = estado.ordenar;
    atualizarResumoFiltros();
  }

  function renderMetricas() {
    const f = resumoFiltros;
    const itens = [
      ["todos", "arte-livros", numero(f.total), "Livros no acervo", !estado.status && !estado.favorito && !estado.emprestado],
      ["lido", "arte-check", numero(f.lidos), "Já lidos", estado.status === "lido"],
      ["lendo", "arte-marca", numero(f.lendo), "Em leitura", estado.status === "lendo"],
      ["favorito", "arte-flor", numero(f.favoritos), "Favoritos", estado.favorito],
      ["emprestado", "arte-pessoas", numero(f.emprestados), "Emprestados", estado.emprestado],
    ];

    $("metricas").replaceChildren(...itens.map(([chave, arte, n, rotulo, ativo]) => {
      const b = criar("button", "metrica");
      b.type = "button";
      b.setAttribute("aria-pressed", String(ativo));

      const ilustracao = arte === "arte-flor"
        ? criarFlor(true, 34)
        : criar("span", `arte ${arte}`);
      if (arte === "arte-flor") ilustracao.classList.add("arte", "arte-flor-svg");

      b.append(ilustracao, criar("strong", "", n), criar("span", "", rotulo));
      b.addEventListener("click", () => alternarMetrica(chave));
      return b;
    }));
  }

  function criarPill(rotulo, ativo, acao) {
    const b = criar("button", "pill", rotulo);
    b.type = "button";
    b.setAttribute("aria-pressed", String(ativo));
    b.addEventListener("click", acao);
    return b;
  }

  function renderPills() {
    const generos = normalizarGeneros(resumoFiltros.generos);
    const totalGeral = numero(resumoFiltros.total);

    const pillTodos = criarPill(`Todos (${totalGeral})`, estado.genero === "", () => {
      alterarFiltro(() => { estado.genero = ""; });
    });

    const pills = generos.map(g => {
      const rotulo = g.total === null ? g.nome : `${g.nome} (${numero(g.total)})`;
      return criarPill(rotulo, estado.genero === g.nome, () => {
        alterarFiltro(() => { estado.genero = g.nome; });
      });
    });

    $("pills-generos").replaceChildren(pillTodos, ...pills);
  }

  function atualizarVisual() {
    if (resumoFiltros) {
      renderMetricas();
      renderPills();
    }
    atualizarResumoFiltros();
    renderGatilhoFlores();
  }

  function alterarFiltro(mudanca) {
    mudanca();
    sincronizarControles();
    atualizarVisual();
    recarregar();
  }

  function alternarMetrica(chave) {
    if (chave === "todos") {
      limparFiltros();
      return;
    }
    alterarFiltro(() => {
      if (chave === "favorito") estado.favorito = !estado.favorito;
      else if (chave === "emprestado") estado.emprestado = !estado.emprestado;
      else estado.status = estado.status === chave ? "" : chave;
    });
  }

  function limparFiltros() {
    clearTimeout(timerBusca);
    Object.assign(estado, {
      q: "", status: "", genero: "", favorito: false, emprestado: false,
      avaliacao: "", faixa: "", cadastro: "",
    });
    $("busca").value = "";
    sincronizarControles();
    atualizarVisual();
    recarregar();
  }

  function popularGeneros(f) {
    const generos = normalizarGeneros(f.generos);
    $("filtro-genero").replaceChildren(
      criarOpcao("", "Todos"),
      ...generos.map(g => criarOpcao(g.nome))
    );
    $("lista-generos").replaceChildren(...generos.map(g => criarOpcao(g.nome, "")));
  }

  async function carregarFiltros() {
    resumoFiltros = await api("/api/filtros");
    popularGeneros(resumoFiltros);
    sincronizarControles();
    atualizarVisual();
  }

  // ---------- Listagem ----------

  function criarCard(livro) {
    const card = criar("article", "card");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ver detalhes de ${livro.titulo}`);

    const marca = criar("input", "selecionar");
    marca.type = "checkbox";
    marca.dataset.id = String(livro.id);
    marca.checked = selecionados.has(livro.id);
    marca.setAttribute("aria-label", `Selecionar ${livro.titulo} para exportação`);
    marca.addEventListener("click", ev => ev.stopPropagation());
    marca.addEventListener("keydown", ev => ev.stopPropagation());
    marca.addEventListener("change", () => alternarSelecao(livro.id, livro.titulo, marca.checked));

    card.append(
      criarCapa(livro),
      marca,
      criar("h3", "", livro.titulo),
      criar("p", "autor", livro.autor || "Autor não informado"),
      criar("p", "local", livro.localizacao || "Localização não informada"),
      criarBadges(livro)
    );
    if (livro.avaliacao) card.appendChild(criarEstrelas(livro.avaliacao));

    card.addEventListener("click", () => abrirDetalhe(livro.id));
    card.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrirDetalhe(livro.id);
      }
    });
    return card;
  }

  async function carregar({ acumular = false } = {}) {
    const id = ++ultimaRequisicao;
    ocultarErro();

    try {
      const params = new URLSearchParams({
        q: estado.q,
        status: estado.status,
        genero: estado.genero,
        favorito: estado.favorito ? "1" : "",
        emprestado: estado.emprestado ? "1" : "",
        avaliacao: estado.avaliacao,
        ordenar: estado.ordenar,
        faixa: estado.faixa,
        cadastro: estado.cadastro,
        pagina: String(estado.pagina),
        limite: String(LIMITE),
      });
      const dados = await api(`/api/itens?${params}`);
      if (id !== ultimaRequisicao) return;

      const cards = dados.itens.map(criarCard);
      if (acumular) lista.append(...cards);
      else lista.replaceChildren(...cards);

      const exibidos = lista.children.length;
      $("contagem").textContent = dados.total
        ? `Exibindo ${exibidos} de ${dados.total} livro(s)`
        : "";
      $("vazio").hidden = dados.total > 0;
      $("carregar-mais").hidden = exibidos >= dados.total;
    } catch (e) {
      mostrarErro(e.message);
    }
  }

  function recarregar() {
    estado.pagina = 1;
    return carregar();
  }

  function sincronizarCheckboxes() {
    lista.querySelectorAll(".selecionar").forEach(cb => {
      cb.checked = selecionados.has(Number(cb.dataset.id));
    });
  }

  // ---------- Seleção e exportação ----------

  function alternarSelecao(id, titulo, marcado) {
    if (marcado) selecionados.set(id, titulo);
    else selecionados.delete(id);
    renderSelecao();
  }

  function renderSelecao() {
    const n = selecionados.size;
    $("barra-selecao").hidden = n === 0;
    $("contador-selecao").textContent = `${n} livro(s) selecionado(s)`;
  }

  function abrirExportacao() {
    $("erro-exportar").hidden = true;
    $("lista-exportar").replaceChildren(...[...selecionados].map(([id, titulo]) => {
      const label = criar("label");
      const cb = criar("input");
      cb.type = "checkbox";
      cb.value = String(id);
      cb.checked = true;
      label.append(cb, titulo);
      return label;
    }));
    abrir($("exportar"));
  }

  async function gerarExportacao() {
    const erro = $("erro-exportar");
    const ids = [...$("lista-exportar").querySelectorAll("input:checked")].map(cb => Number(cb.value));

    if (!ids.length) {
      erro.textContent = "Selecione ao menos um livro.";
      erro.hidden = false;
      return;
    }

    const botaoGerar = $("exportar-gerar");
    botaoGerar.disabled = true;
    try {
      const resposta = await fetch("/api/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || "Não foi possível gerar o arquivo.");
      }
      const nome = nomeDoArquivo(resposta.headers.get("Content-Disposition")) || "acervo.doc";
      baixar(await resposta.blob(), nome);
      $("exportar").close();
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    } finally {
      botaoGerar.disabled = false;
    }
  }

   // ---------- Detalhes ----------

  const NS_SVG = "http://www.w3.org/2000/svg";

  // Flor de cinco pétalas, no mesmo estilo do logo. "vazia" mostra só o contorno.
  function criarFlor(preenchida = true, tamanho = 18) {
    const svg = document.createElementNS(NS_SVG, "svg");
    svg.setAttribute("viewBox", "0 0 40 40");
    svg.setAttribute("width", String(tamanho));
    svg.setAttribute("height", String(tamanho));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", preenchida ? "flor" : "flor vazia");

    for (let i = 0; i < 5; i++) {
      const petala = document.createElementNS(NS_SVG, "ellipse");
      petala.setAttribute("class", "petala");
      petala.setAttribute("cx", "20");
      petala.setAttribute("cy", "11");
      petala.setAttribute("rx", "6");
      petala.setAttribute("ry", "9");
      petala.setAttribute("transform", `rotate(${i * 72} 20 20)`);
      svg.appendChild(petala);
    }

    const miolo = document.createElementNS(NS_SVG, "circle");
    miolo.setAttribute("class", "miolo");
    miolo.setAttribute("cx", "20");
    miolo.setAttribute("cy", "20");
    miolo.setAttribute("r", "4.5");
    svg.appendChild(miolo);

    return svg;
  }

  // Cinco flores clicáveis. Clicar na nota atual zera a avaliação.
  function criarAvaliacaoFlores(livro) {
    const area = criar("div", "campo-avaliacao");
    area.appendChild(criar("span", "", "Avaliação"));

    const flores = criar("div", "flores-avaliacao");
    flores.setAttribute("role", "radiogroup");
    flores.setAttribute("aria-label", "Avaliação do livro");

    for (let n = 1; n <= 5; n++) {
      const b = criar("button", "flor-btn");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(n === livro.avaliacao));
      b.setAttribute("aria-label", `${n} ${n === 1 ? "flor" : "flores"}`);
      b.title = `${n} ${n === 1 ? "flor" : "flores"}`;
      b.appendChild(criarFlor(n <= livro.avaliacao, 26));
      b.addEventListener("click", () => {
        const nova = n === livro.avaliacao ? 0 : n;
        atualizarEstado(livro.id, { avaliacao: nova });
      });
      flores.appendChild(b);
    }

    area.append(
      flores,
      criar("span", "ajuda", livro.avaliacao ? `${livro.avaliacao} de 5` : "Sem avaliação")
    );
    return area;
  }

  async function abrirDetalhe(id) {
    try {
      const livro = await api(`/api/itens/${id}`);
      livroAberto = livro;
      $("detalhe-titulo").textContent = livro.titulo;
      renderDetalhe(livro);
      abrir($("detalhe"));
    } catch (e) {
      mostrarErro(e.message);
    }
  }

  function renderDetalhe(livro) {
    const campos = [
      ["Autor", livro.autor],
      ["Editora", livro.editora],
      ["Gênero", livro.genero],
      ["Localização física", livro.localizacao],
      ["Ano", livro.ano],
      ["Idioma", livro.idioma],
      ["Páginas", livro.paginas],
      ["ISBN", livro.isbn],
    ].filter(([, v]) => v !== null && v !== undefined && v !== "");

    const dl = criar("dl", "detalhe-lista");
    campos.forEach(([rotulo, valor]) => dl.append(criar("dt", "", rotulo), criar("dd", "", String(valor))));
    if (livro.emprestado) {
      dl.append(
        criar("dt", "", "Emprestado para"),
        criar("dd", "", livro.emprestado_para || "Não informado")
      );
    }

    // Status (lido, lendo, não lido) aparece antes dos demais dados
    const info = criar("div");
    info.append(criarBadges(livro), dl);

    const topo = criar("div", "detalhe-topo");
    topo.append(criarCapa(livro), info);

    const blocos = [topo];
    if (livro.descricao) blocos.push(criar("p", "descricao", livro.descricao));
    if (livro.tags.length) blocos.push(criarTags(livro.tags));
    blocos.push(criarControlesEstado(livro));
    blocos.push(criarAcoesLivro(livro));
    blocos.push(criar("h3", "secao-titulo", "Livros relacionados"));
    blocos.push(criarRelacionados(livro.relacionados || []));

    $("detalhe-corpo").replaceChildren(...blocos);
  }

  function criarControlesEstado(livro) {
    const area = criar("div", "estado-livro");

    const selStatus = criar("select");
    Object.entries(STATUS_ROTULO).forEach(([v, t]) => selStatus.appendChild(criarOpcao(v, t)));
    selStatus.value = livro.status;
    selStatus.addEventListener("change", () => atualizarEstado(livro.id, { status: selStatus.value }));

    const rotuloStatus = criar("label");
    rotuloStatus.append("Status de leitura", selStatus);

    area.append(rotuloStatus, criarAvaliacaoFlores(livro));
    return area;
  }

  function criarAcoesLivro(livro) {
    const area = criar("div");

    const btnFavorito = criar("button", "com-flor");
    btnFavorito.type = "button";
    btnFavorito.append(
      criarFlor(livro.favorito, 18),
      document.createTextNode(livro.favorito ? " Remover favorito" : " Marcar como favorito")
    );
    btnFavorito.addEventListener("click", () => atualizarEstado(livro.id, { favorito: !livro.favorito }));

    const acoes = criar("div", "acoes-detalhe");
    acoes.append(
      btnFavorito,
      botao(
        selecionados.has(livro.id) ? "Remover da exportação" : "Adicionar à exportação",
        () => {
          if (selecionados.has(livro.id)) selecionados.delete(livro.id);
          else selecionados.set(livro.id, livro.titulo);
          renderSelecao();
          sincronizarCheckboxes();
          renderDetalhe(livro);
        }
      ),
      botao("Editar", () => abrirEdicao(livro)),
      botao("Excluir livro", () => excluirLivro(livro), "excluir")
    );
    area.appendChild(acoes);

    const emprestimo = criar("div");
    if (livro.emprestado) {
      emprestimo.appendChild(
        botao("Devolver livro", () => atualizarEstado(livro.id, { emprestado: false }))
      );
    } else {
      const bloco = criar("div", "bloco-emprestimo");
      const campo = criar("input");
      campo.type = "text";
      campo.maxLength = 100;
      campo.placeholder = "Nome de quem está com o livro";

      // O botão só é habilitado quando há um nome digitado
      const btnEmprestar = botao("Registrar empréstimo", () =>
        atualizarEstado(livro.id, { emprestado: true, emprestado_para: campo.value.trim() })
      );
      btnEmprestar.disabled = true;
      campo.addEventListener("input", () => {
        btnEmprestar.disabled = !campo.value.trim();
      });

      bloco.append(campo, btnEmprestar);
      emprestimo.appendChild(bloco);
    }
    area.appendChild(emprestimo);

    return area;
  }

  // Cada livro relacionado mostra a capa e o título
  function criarRelacionados(itens) {
    if (!itens.length) return criar("p", "ajuda", "Nenhum livro relacionado por autor ou gênero.");
    const area = criar("div", "relacionados");
    itens.forEach(r => {
      const b = criar("button", "relacionado");
      b.type = "button";
      const capa = criarCapa(r);
      capa.classList.add("capa-mini");
      b.append(capa, criar("span", "rel-titulo", r.titulo));
      b.addEventListener("click", () => abrirDetalhe(r.id));
      area.appendChild(b);
    });
    return area;
  }

  async function atualizarEstado(id, campos) {
    try {
      await enviarJson(`/api/itens/${id}/estado`, "PATCH", campos);
      await carregarFiltros();
      await recarregar();
      if (livroAberto && livroAberto.id === id) await abrirDetalhe(id);
    } catch (e) {
      mostrarErroDetalhe(e.message);
    }
  }

  async function excluirLivro(livro) {
    const confirmado = window.confirm(
      `Excluir "${livro.titulo}" do acervo? Esta ação não pode ser desfeita.`
    );
    if (!confirmado) return;

    try {
      await api(`/api/itens/${livro.id}`, { method: "DELETE" });
      selecionados.delete(livro.id);
      renderSelecao();
      livroAberto = null;
      $("detalhe").close();
      await carregarFiltros();
      await recarregar();
    } catch (e) {
      mostrarErroDetalhe(e.message);
    }
  }

  // ---------- Cadastro e edição ----------

  function mostrarErroForm(mensagem) {
    $("erro-form").textContent = mensagem;
    $("erro-form").hidden = false;
  }

  function abrirLivro() {
    $("erro-form").hidden = true;
    $("isbn-status").textContent = "";
    abrir($("livro"));
  }

  function abrirNovo() {
    editandoId = null;
    formLivro.reset();
    $("livro-titulo").textContent = "Novo livro";
    salvarBtn.textContent = "Salvar";
    abrirLivro();
  }

  function abrirEdicao(livro) {
    editandoId = livro.id;
    preencherFormulario(livro);
    $("livro-titulo").textContent = "Editar livro";
    salvarBtn.textContent = "Salvar alterações";
    $("detalhe").close();
    abrirLivro();
  }

  function preencherFormulario(livro) {
    formLivro.reset();
    ["titulo", "autor", "editora", "genero", "localizacao", "ano", "idioma",
     "paginas", "isbn", "capa_url", "descricao", "emprestado_para"].forEach(campo => {
      const el = formLivro.elements[campo];
      if (el) el.value = livro[campo] ?? "";
    });
    formLivro.elements.tags.value = (livro.tags || []).join(", ");
    formLivro.elements.emprestado.checked = Boolean(livro.emprestado);
  }

  function dadosDoFormulario() {
    const corpo = {};
    new FormData(formLivro).forEach((valor, chave) => { corpo[chave] = valor; });
    corpo.emprestado = formLivro.elements.emprestado.checked;
    return corpo;
  }

  function preencherSeVazio(campo, valor) {
    const el = formLivro.elements[campo];
    if (!el || el.value.trim()) return;
    if (valor === null || valor === undefined || valor === "") return;
    el.value = valor;
  }

  async function buscarIsbn() {
    const status = $("isbn-status");
    const isbn = formLivro.elements.isbn.value.trim();
    if (!isbn) {
      status.textContent = "Informe o ISBN antes de buscar.";
      return;
    }

    const botaoIsbn = $("buscar-isbn");
    botaoIsbn.disabled = true;
    status.textContent = "Consultando a Open Library...";
    try {
      const dados = await api(`/api/isbn/${encodeURIComponent(isbn)}`);
      ["titulo", "autor", "editora", "genero", "ano", "paginas", "capa_url"]
        .forEach(campo => preencherSeVazio(campo, dados[campo]));
      formLivro.elements.isbn.value = dados.isbn;
      status.textContent = "Dados preenchidos. Campos já digitados foram mantidos. Revise o gênero, que vem em inglês em alguns casos.";
    } catch (e) {
      status.textContent = e.message;
    } finally {
      botaoIsbn.disabled = false;
    }
  }

  formLivro.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const idEditado = editandoId;
    $("erro-form").hidden = true;
    salvarBtn.disabled = true;

    try {
      const corpo = dadosDoFormulario();
      if (idEditado) await enviarJson(`/api/itens/${idEditado}`, "PUT", corpo);
      else await enviarJson("/api/itens", "POST", corpo);

      $("livro").close();
      editandoId = null;
      await carregarFiltros();
      await recarregar();
      if (idEditado) await abrirDetalhe(idEditado);
    } catch (e) {
      mostrarErroForm(e.message);
    } finally {
      salvarBtn.disabled = false;
    }
  });

  // ---------- Eventos ----------

  $("busca").addEventListener("input", () => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.q = $("busca").value.trim();
      atualizarResumoFiltros();
      recarregar();
    }, 250);
  });

  $("filtro-genero").addEventListener("change", () =>
    alterarFiltro(() => { estado.genero = $("filtro-genero").value; })
  );
  $("filtro-status").addEventListener("change", () =>
    alterarFiltro(() => { estado.status = $("filtro-status").value; })
  );
  $("filtro-avaliacao").addEventListener("change", () =>
    alterarFiltro(() => { estado.avaliacao = $("filtro-avaliacao").value; })
  );
  $("filtro-faixa").addEventListener("change", () =>
    alterarFiltro(() => { estado.faixa = $("filtro-faixa").value; })
  );
  $("filtro-cadastro").addEventListener("change", () =>
    alterarFiltro(() => { estado.cadastro = $("filtro-cadastro").value; })
  );
  $("filtro-ordenar").addEventListener("change", () =>
    alterarFiltro(() => { estado.ordenar = $("filtro-ordenar").value; })
  );

  $("limpar").addEventListener("click", limparFiltros);
  $("abrir-novo").addEventListener("click", abrirNovo);
  $("carregar-mais").addEventListener("click", () => {
    estado.pagina += 1;
    carregar({ acumular: true });
  });

  $("exportar-abrir").addEventListener("click", abrirExportacao);
  $("exportar-gerar").addEventListener("click", gerarExportacao);
  $("limpar-selecao").addEventListener("click", () => {
    selecionados.clear();
    renderSelecao();
    sincronizarCheckboxes();
  });

  $("buscar-isbn").addEventListener("click", buscarIsbn);

  document.querySelectorAll("[data-fechar]").forEach(b => {
    b.addEventListener("click", () => $(b.dataset.fechar).close());
  });

    // ---------- Filtro de avaliação com flores ----------

  const OPCOES_AVALIACAO = [
    { valor: "", rotulo: "Qualquer avaliação" },
    { valor: "sem", rotulo: "Sem avaliação" },
    { valor: "1", rotulo: "1 flor" },
    { valor: "2", rotulo: "2 flores" },
    { valor: "3", rotulo: "3 flores" },
    { valor: "4", rotulo: "4 flores" },
    { valor: "5", rotulo: "5 flores" },
  ];

  let renderGatilhoFlores = () => {};

  // Conteúdo visual de uma opção: texto para "qualquer" e "sem", flores para 1 a 5
  function conteudoAvaliacao(valor) {
    const conteudo = criar("span", "flores-opcao");
    if (valor === "" || valor === "sem") {
      const texto = valor === "" ? "Qualquer avaliação" : "Sem avaliação";
      conteudo.appendChild(criar("span", "rotulo-opcao", texto));
      return conteudo;
    }
    for (let i = 0; i < Number(valor); i++) {
      conteudo.appendChild(criarFlor(true, 18));
    }
    return conteudo;
  }

  // Substitui o select visualmente. O select continua existindo e guarda o valor do filtro.
  function montarFiltroFlores() {
    const select = $("filtro-avaliacao");
    select.hidden = true;
    select.tabIndex = -1;

    const wrap = criar("div", "filtro-flores");
    const gatilho = criar("button", "gatilho-flores");
    gatilho.type = "button";
    gatilho.setAttribute("aria-haspopup", "listbox");
    gatilho.setAttribute("aria-expanded", "false");

    const seta = criar("span", "seta", "▾");
    const lista = criar("div", "opcoes-flores");
    lista.setAttribute("role", "listbox");
    lista.hidden = true;

    function fecharLista() {
      lista.hidden = true;
      gatilho.setAttribute("aria-expanded", "false");
    }

    OPCOES_AVALIACAO.forEach(({ valor, rotulo }) => {
      const op = criar("button", "opcao-flor");
      op.type = "button";
      op.setAttribute("role", "option");
      op.dataset.valor = valor;
      op.title = rotulo;
      op.setAttribute("aria-label", rotulo);
      op.appendChild(conteudoAvaliacao(valor));
      op.addEventListener("click", () => {
        fecharLista();
        if (select.value === valor) return;
        select.value = valor;
        select.dispatchEvent(new Event("change"));
      });
      lista.appendChild(op);
    });

    renderGatilhoFlores = function () {
      const valor = select.value;
      const opcao = OPCOES_AVALIACAO.find(o => o.valor === valor) || OPCOES_AVALIACAO[0];
      gatilho.replaceChildren(conteudoAvaliacao(opcao.valor), seta);
      gatilho.setAttribute("aria-label", `Avaliação: ${opcao.rotulo}`);
      lista.querySelectorAll(".opcao-flor").forEach(o =>
        o.setAttribute("aria-selected", String(o.dataset.valor === valor))
      );
    };

    gatilho.addEventListener("click", ev => {
      ev.stopPropagation();
      const abrir = lista.hidden;
      lista.hidden = !abrir;
      gatilho.setAttribute("aria-expanded", String(abrir));
    });
    document.addEventListener("click", ev => {
      if (!wrap.contains(ev.target)) fecharLista();
    });
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape") fecharLista();
    });

    wrap.append(gatilho, lista);
    select.insertAdjacentElement("afterend", wrap);
    renderGatilhoFlores();
  }
  // ---------- Inicialização ----------

  preencherSelect("filtro-faixa", FAIXAS);
  preencherSelect("filtro-cadastro", JANELAS);
  preencherSelect("filtro-ordenar", ORDENACOES);
  montarFiltroFlores();
  sincronizarControles();

  (async () => {
    try {
      await carregarFiltros();
      await carregar();
    } catch (e) {
      mostrarErro(e.message);
    }
  })();
})();