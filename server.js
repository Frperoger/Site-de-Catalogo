const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Validação ----------

function texto(body, campo, max = 300) {
  return String(body[campo] ?? "").trim().slice(0, max);
}

// null se vazio, undefined se inválido, número se válido
function inteiro(valor, min, max) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

function booleano(valor) {
  return valor === true || valor === "true" || valor === "1" || valor === 1;
}

function validarLivro(body = {}) {
  const dados = {
    titulo: texto(body, "titulo"),
    autor: texto(body, "autor"),
    editora: texto(body, "editora"),
    genero: texto(body, "genero", 100),
    localizacao: texto(body, "localizacao", 150),
    idioma: texto(body, "idioma", 50) || "Português",
    isbn: texto(body, "isbn", 20).replace(/[^0-9Xx]/g, "").toUpperCase(),
    capa_url: texto(body, "capa_url", 500),
    descricao: texto(body, "descricao", 5000),
    emprestado: booleano(body.emprestado),
    emprestado_para: texto(body, "emprestado_para", 100),
    ano: inteiro(body.ano, 1000, 2100),
    paginas: inteiro(body.paginas, 1, 100000),
    tags: (Array.isArray(body.tags) ? body.tags : String(body.tags ?? "").split(","))
      .map(t => String(t).trim().slice(0, 30))
      .filter(Boolean)
      .slice(0, 20),
  };

  const erros = [];
  if (!dados.titulo) erros.push("Informe o título.");
  if (dados.ano === undefined) erros.push("Ano inválido.");
  if (dados.paginas === undefined) erros.push("Número de páginas inválido.");
  if (dados.isbn && ![10, 13].includes(dados.isbn.length)) {
    erros.push("ISBN deve ter 10 ou 13 caracteres.");
  }
  if (dados.capa_url && !/^https?:\/\//i.test(dados.capa_url)) {
    erros.push("A URL da capa deve começar com http:// ou https://.");
  }

  return erros.length ? { erro: erros.join(" ") } : { dados };
}

function obterLivro(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? db.buscarPorId(id) : null;
}

// Faixas e janelas usadas pelos selects da barra de filtros
const FAIXAS_PAGINAS = {
  ate200: { paginasMax: 200 },
  de200a400: { paginasMin: 201, paginasMax: 400 },
  mais400: { paginasMin: 401 },
};
const JANELAS_CADASTRO = new Set([7, 30, 365]);

// ---------- Filtros e listagem ----------

app.get("/api/filtros", (_req, res) => {
  res.json(db.filtros());
});

app.get("/api/itens", (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 100);
  const pagina = Math.max(Number(req.query.pagina) || 1, 1);
  const cadastro = Number(req.query.cadastro);

  const resultado = db.listar({
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    genero: String(req.query.genero || ""),
    favorito: req.query.favorito === "1",
    emprestado: req.query.emprestado === "1",
    ordenar: String(req.query.ordenar || "titulo"),
    ...(FAIXAS_PAGINAS[req.query.faixa] || {}),
    dias: JANELAS_CADASTRO.has(cadastro) ? cadastro : null,
    pagina,
    limite,
  });

  res.json({ ...resultado, pagina, limite });
});

app.get("/api/itens/:id", (req, res) => {
  const livro = obterLivro(req);
  if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
  res.json({ ...livro, relacionados: db.relacionados(livro) });
});

// ---------- Cadastro e edição ----------

app.post("/api/itens", (req, res) => {
  const { dados, erro } = validarLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  res.status(201).json(db.inserir(dados));
});

app.put("/api/itens/:id", (req, res) => {
  if (!obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });
  const { dados, erro } = validarLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  res.json(db.atualizar(Number(req.params.id), dados));
});

// Status, favorito, avaliação e empréstimo
app.patch("/api/itens/:id/estado", (req, res) => {
  if (!obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });

  const corpo = req.body ?? {};
  const campos = {};

  if (corpo.status !== undefined) {
    if (!db.STATUS.includes(corpo.status)) return res.status(400).json({ erro: "Status inválido." });
    campos.status = corpo.status;
  }
  if (corpo.favorito !== undefined) {
    if (typeof corpo.favorito !== "boolean") {
      return res.status(400).json({ erro: "Favorito deve ser verdadeiro ou falso." });
    }
    campos.favorito = corpo.favorito;
  }
  if (corpo.avaliacao !== undefined) {
    const nota = Number(corpo.avaliacao);
    if (!Number.isInteger(nota) || nota < 0 || nota > 5) {
      return res.status(400).json({ erro: "A avaliação deve ser de 0 a 5." });
    }
    campos.avaliacao = nota;
  }
  if (corpo.emprestado !== undefined) {
    if (typeof corpo.emprestado !== "boolean") {
      return res.status(400).json({ erro: "Empréstimo deve ser verdadeiro ou falso." });
    }
    campos.emprestado = corpo.emprestado;
  }
  if (corpo.emprestado_para !== undefined) {
    campos.emprestado_para = String(corpo.emprestado_para).trim().slice(0, 100);
  }

  res.json(db.atualizarEstado(Number(req.params.id), campos));
});

// Exclusão definitiva
app.delete("/api/itens/:id", (req, res) => {
  if (!obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });
  db.excluir(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- ISBN (Open Library) ----------

function anoDe(textoData) {
  const m = String(textoData ?? "").match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

app.get("/api/isbn/:isbn", async (req, res) => {
  const isbn = String(req.params.isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
  if (![10, 13].includes(isbn.length)) {
    return res.status(400).json({ erro: "O ISBN deve ter 10 ou 13 dígitos." });
  }

  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error(`Status ${resposta.status}`);

    const dados = (await resposta.json())[`ISBN:${isbn}`];
    if (!dados) {
      return res.status(404).json({ erro: "ISBN não encontrado. Preencha os dados manualmente." });
    }

    res.json({
      isbn,
      titulo: dados.title ?? "",
      autor: (dados.authors ?? []).map(a => a.name).join(", "),
      editora: (dados.publishers ?? []).map(p => p.name).join(", "),
      ano: anoDe(dados.publish_date),
      paginas: dados.number_of_pages ?? null,
      genero: dados.subjects?.[0]?.name ?? "",
      capa_url: dados.cover?.medium ?? "",
    });
  } catch (err) {
    console.error("Erro na consulta de ISBN:", err.message);
    res.status(502).json({
      erro: "Não foi possível consultar o ISBN. Verifique a internet ou preencha manualmente.",
    });
  }
});

// ---------- Exportação em .doc ----------

const STATUS_TEXTO = { nao_lido: "Não lido", lendo: "Lendo", lido: "Lido" };

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function textoEmprestimo(livro) {
  if (!livro.emprestado) return "Não";
  return livro.emprestado_para ? `Sim, com ${livro.emprestado_para}` : "Sim";
}

function fichaHtml(livro) {
  const campos = [
    ["Autor", livro.autor],
    ["Editora", livro.editora],
    ["Gênero", livro.genero],
    ["Localização física", livro.localizacao],
    ["Ano", livro.ano],
    ["Idioma", livro.idioma],
    ["Páginas", livro.paginas],
    ["ISBN", livro.isbn],
    ["Status de leitura", STATUS_TEXTO[livro.status]],
    ["Favorito", livro.favorito ? "Sim" : "Não"],
    ["Avaliação", livro.avaliacao ? `${livro.avaliacao} de 5` : "Sem avaliação"],
    ["Emprestado", textoEmprestimo(livro)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  const linhas = campos
    .map(([rotulo, valor]) => `<tr><td class="rot">${esc(rotulo)}</td><td>${esc(valor)}</td></tr>`)
    .join("");

  const tags = livro.tags.length
    ? `<p class="tags">${livro.tags.map(t => `<span>${esc(t)}</span>`).join(" ")}</p>`
    : "";

  return `
    <div class="ficha">
      <h2>${esc(livro.titulo)}</h2>
      <table class="dados">${linhas}</table>
      ${livro.descricao ? `<p class="desc">${esc(livro.descricao)}</p>` : ""}
      ${tags}
    </div>`;
}

function documentoDoc(livros) {
  const data = new Date().toLocaleDateString("pt-BR");
  const corpo = livros.map(fichaHtml).join('<hr class="sep">');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Acervo – Biblioteca Particular</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Lora, Georgia, serif; color: #4a3b38; background: #fbf7f4; font-size: 11pt; }
    h1 { font-family: "Cormorant Garamond", Georgia, serif; font-size: 26pt; font-weight: bold; margin: 0; }
    .sub { color: #8a7c78; font-size: 10pt; margin: 4pt 0 18pt 0; }
    h2 { font-family: "Cormorant Garamond", Georgia, serif; font-size: 16pt; margin: 0 0 8pt 0; color: #4a3b38; }
    table.dados { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
    table.dados td { border-bottom: 1px solid #e6dfdc; padding: 4pt 6pt; vertical-align: top; }
    td.rot { width: 35%; color: #8a7c78; }
    .desc { line-height: 1.5; margin: 6pt 0; }
    .tags span { border: 1px solid #d1c9c6; padding: 1pt 5pt; color: #8a7c78; font-size: 9pt; }
    hr.sep { border: none; border-top: 1px solid #d1c9c6; margin: 16pt 0; }
    .ficha { page-break-inside: avoid; }
  </style>
</head>
<body>
  <h1>Acervo – Biblioteca Particular</h1>
  <p class="sub">${livros.length} livro(s) · Gerado em ${esc(data)}</p>
  ${corpo}
</body>
</html>`;
}

app.post("/api/exportar", (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 500)
    : [];
  if (!ids.length) {
    return res.status(400).json({ erro: "Selecione ao menos um livro para exportar." });
  }

  const livros = db.buscarVarios(ids);
  if (!livros.length) return res.status(404).json({ erro: "Nenhum livro encontrado." });

  const nome = `acervo-${new Date().toISOString().slice(0, 10)}.doc`;
  res.setHeader("Content-Type", "application/msword; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(documentoDoc(livros));
});

// ---------- Erros ----------

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "Requisição com formato inválido." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ erro: "Requisição muito grande." });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

app.listen(PORT, HOST, () => {
  console.log(`Biblioteca rodando em http://localhost:${PORT}`);
});