(function () {
  const busca = document.getElementById("busca");
  const filtroTipo = document.getElementById("filtro-tipo");
  const filtroCategoria = document.getElementById("filtro-categoria");
  const botaoLimpar = document.getElementById("limpar");
  const contagem = document.getElementById("contagem");
  const lista = document.getElementById("lista");
  const vazio = document.getElementById("vazio");

  const itens = window.ACERVO || [];

  // Remove acentos e diferenças de caixa para a busca funcionar com "usinagem" ou "Usinàgem"
  function normalizar(texto) {
    return String(texto ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function valoresUnicos(campo) {
    const valores = itens.map(item => item[campo]).filter(Boolean);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function preencherSelect(select, valores) {
    valores.forEach(valor => {
      const opcao = document.createElement("option");
      opcao.value = valor;
      opcao.textContent = valor;
      select.appendChild(opcao);
    });
  }

  function textoPesquisavel(item) {
    return normalizar([
      item.titulo,
      item.equipamento,
      item.autor,
      item.categoria,
      ...(item.tags || [])
    ].join(" "));
  }

  function filtrar() {
    const termos = normalizar(busca.value).split(/\s+/).filter(Boolean);

    return itens.filter(item => {
      if (filtroTipo.value && item.tipo !== filtroTipo.value) return false;
      if (filtroCategoria.value && item.categoria !== filtroCategoria.value) return false;

      const texto = textoPesquisavel(item);
      return termos.every(termo => texto.includes(termo));
    });
  }

  function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function criarCard(item) {
    const card = criarElemento("article", "card");

    card.appendChild(criarElemento("span", "badge", item.tipo));
    card.appendChild(criarElemento("h2", "", item.titulo));

    const meta = [item.equipamento, item.categoria, item.ano, item.idioma]
      .filter(Boolean)
      .join(" · ");
    card.appendChild(criarElemento("p", "meta", meta));

    if (item.tags && item.tags.length) {
      const tags = criarElemento("div", "tags");
      item.tags.forEach(tag => tags.appendChild(criarElemento("span", "tag", tag)));
      card.appendChild(tags);
    }

    const acoes = criarElemento("div", "acoes");
    if (item.arquivo) {
      const link = criarElemento("a", "", "Abrir arquivo");
      link.href = item.arquivo;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      acoes.appendChild(link);
    } else {
      acoes.appendChild(criarElemento("span", "", "Arquivo não cadastrado"));
    }
    card.appendChild(acoes);

    return card;
  }

  function render() {
    const resultado = filtrar();

    lista.replaceChildren(...resultado.map(criarCard));
    contagem.textContent = `${resultado.length} de ${itens.length} itens`;
    vazio.hidden = resultado.length > 0;
  }

  function limparFiltros() {
    busca.value = "";
    filtroTipo.value = "";
    filtroCategoria.value = "";
    render();
  }

  function iniciar() {
    preencherSelect(filtroTipo, valoresUnicos("tipo"));
    preencherSelect(filtroCategoria, valoresUnicos("categoria"));

    busca.addEventListener("input", render);
    filtroTipo.addEventListener("change", render);
    filtroCategoria.addEventListener("change", render);
    botaoLimpar.addEventListener("click", limparFiltros);

    render();
  }

  iniciar();
})();