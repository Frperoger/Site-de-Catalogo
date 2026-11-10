const express = require("express");
const path = require("path");
const fs = require("fs");
const { STATUS } = require("./db");
const { criarAutenticacao, apenasAdmin, UUID } = require("./auth");
const { prepararImagem, prepararPacote, validarPacote, obterAparencia } = require("./lib/aparencia");
const { registrarVisitas, registrarConvites } = require("./lib/visitas");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

function criarApp(opcoes = {}) {
const app = express();
const { config, autenticar, publico } = criarAutenticacao(opcoes);
const rota = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (_req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true, configurado: config.configurado }));
app.get("/api/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(config);
});
app.get("/vendor/supabase.js", (_req, res) => res.sendFile(path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js")));
registrarVisitas(app, { config, publico, rota });
app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, autenticar);
app.post("/api/restaurar", apenasAdmin, express.json({ limit: "25mb" }), rota(async (req, res) => {
  if (req.body?.confirmacao !== req.biblioteca.nome) return res.status(400).json({ erro: "Confirme o nome da biblioteca antes de substituir o acervo." });
  const { dados, erro } = validarBackup(req.body?.backup);
  if (erro) return res.status(400).json({ erro });
  if (dados.personalizacao.aparencia) dados.personalizacao.aparencia = await prepararPacote(dados.personalizacao.aparencia);
  await req.db.restaurar(dados.livros, dados.personalizacao);
  res.json({ ok: true, total: dados.livros.length });
}));
app.post("/api/imagens/:slot", apenasAdmin, express.raw({ type: "application/octet-stream", limit: "25mb" }), rota(async (req, res) => {
  let nome = "Minha imagem";
  try { nome = decodeURIComponent(req.get("X-Nome-Imagem") || nome); } catch { /* O nome é apenas uma legenda. */ }
  res.json(await prepararImagem(req.body, req.params.slot, nome));
}));
app.put("/api/aparencia", apenasAdmin, express.json({ limit: "16mb" }), rota(async (req, res) => {
  const anterior = await obterAparencia(req.supabase, req.biblioteca);
  const pacote = await prepararPacote(req.body, anterior.arquivos);
  const { error } = await req.supabase.rpc("salvar_aparencia", { biblioteca_destino: req.biblioteca.id, dados: pacote });
  if (error) throw error;
  const s = pacote.estado;
  res.json({ ...pacote, biblioteca: { ...req.biblioteca, nome: s.nome, subtitulo: s.subtitulo, cor_primaria: s.cor, tema: s.modelo === "noturna" ? "azul" : s.modelo === "classica" ? "verde" : "floral" } });
}));
app.use(express.json({ limit: "200kb" }));
app.get("/api/aparencia", rota(async (req, res) => res.json(await obterAparencia(req.supabase, req.biblioteca))));
registrarConvites(app, { apenasAdmin, rota, UUID });

app.get("/api/conta", (req, res) => res.json({ usuario: { id: req.usuario.id, email: req.usuario.email }, bibliotecas: req.bibliotecas, biblioteca: req.biblioteca }));
app.patch("/api/biblioteca", apenasAdmin, rota(async (req, res) => {
  const { dados, erro } = validarPersonalizacao(req.body);
  if (erro) return res.status(400).json({ erro });
  const { aparencia: _aparencia, ...campos } = dados;
  const resultado = await req.supabase.from("bibliotecas").update(campos).eq("id", req.biblioteca.id).select().single();
  if (resultado.error) throw resultado.error;
  res.json({ ...resultado.data, papel: req.biblioteca.papel });
}));
app.get("/api/membros", apenasAdmin, rota(async (req, res) => {
  const { data, error } = await req.supabase.rpc("membros_da_biblioteca", { biblioteca_destino: req.biblioteca.id });
  if (error) throw error;
  res.json(data || []);
}));
app.post("/api/membros", apenasAdmin, rota(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Informe um e-mail válido." });
  const { error } = await req.supabase.rpc("compartilhar_biblioteca", { biblioteca_destino: req.biblioteca.id, email_destino: email });
  if (error) throw error;
  res.status(201).json({ ok: true });
}));
app.delete("/api/membros/:userId", apenasAdmin, rota(async (req, res) => {
  if (!UUID.test(req.params.userId)) return res.status(400).json({ erro: "Usuário inválido." });
  const { error } = await req.supabase.rpc("revogar_acesso", { biblioteca_destino: req.biblioteca.id, usuario_destino: req.params.userId });
  if (error) throw error;
  res.json({ ok: true });
}));
app.get("/api/backup", apenasAdmin, rota(async (req, res) => {
  const livros = await req.db.backup();
  if (livros.length > 10000) return res.status(413).json({ erro: "Este acervo excede o limite de 10.000 livros do backup pelo site." });
  const { nome, subtitulo, cor_primaria, tema } = req.biblioteca;
  const aparencia = await obterAparencia(req.supabase, req.biblioteca);
  const backup = { formato: "biblioteca-particular", versao: 1, exportado_em: new Date().toISOString(), personalizacao: { nome, subtitulo, cor_primaria, tema, aparencia }, livros };
  const conteudo = JSON.stringify(backup);
  if (Buffer.byteLength(conteudo, "utf8") > 24 * 1024 * 1024) return res.status(413).json({ erro: "O backup excede 24 MB. Exporte este acervo pelo painel do Supabase." });
  res.attachment(`biblioteca-backup-${new Date().toISOString().slice(0, 10)}.json`);
  res.type("application/json").send(conteudo);
}));

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
  if (!body || typeof body !== "object" || Array.isArray(body)) return { erro: "Dados do livro inválidos." };
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
  return Number.isSafeInteger(id) && id > 0 ? req.db.buscarPorId(id) : null;
}

function validarPersonalizacao(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { erro: "Personalização inválida." };
  const dados = { nome: texto(body, "nome", 100), subtitulo: texto(body, "subtitulo", 160), cor_primaria: texto(body, "cor_primaria", 7), tema: texto(body, "tema", 20) };
  if (!dados.nome) return { erro: "Informe o nome da biblioteca." };
  if (!/^#[0-9a-f]{6}$/i.test(dados.cor_primaria)) return { erro: "Escolha uma cor válida." };
  if (!["floral", "verde", "azul"].includes(dados.tema)) return { erro: "Escolha um tema válido." };
  if (body.aparencia !== undefined) {
    try { validarPacote(body.aparencia); dados.aparencia = body.aparencia; }
    catch (e) { return { erro: e.message }; }
  }
  return { dados };
}

function validarBackup(backup) {
  if (!backup || backup.formato !== "biblioteca-particular" || backup.versao !== 1 || !Array.isArray(backup.livros)) return { erro: "Arquivo de backup inválido ou de versão incompatível." };
  if (backup.livros.length > 10000) return { erro: "O backup pode conter no máximo 10.000 livros." };
  const personalizacao = validarPersonalizacao(backup.personalizacao);
  if (personalizacao.erro) return personalizacao;
  const livros = [];
  for (const [indice, livro] of backup.livros.entries()) {
    const resultado = validarLivro(livro);
    if (resultado.erro) return { erro: `Livro ${indice + 1}: ${resultado.erro}` };
    const estado = livro.status ?? "nao_lido";
    const avaliacao = livro.avaliacao ?? 0;
    if (!STATUS.includes(estado) || !Number.isInteger(avaliacao) || avaliacao < 0 || avaliacao > 5) return { erro: `Livro ${indice + 1}: status ou avaliação inválidos.` };
    if ((livro.favorito !== undefined && typeof livro.favorito !== "boolean") || (livro.emprestado !== undefined && typeof livro.emprestado !== "boolean")) return { erro: `Livro ${indice + 1}: favorito ou empréstimo inválidos.` };
    // IDs e propriedade do arquivo são ignorados. A restauração sempre pertence à biblioteca autenticada.
    const datas = {};
    for (const campo of ["criado_em", "atualizado_em"]) {
      if (livro[campo] !== undefined) {
        const data = new Date(livro[campo]);
        if (!Number.isFinite(data.getTime())) return { erro: `Livro ${indice + 1}: data inválida.` };
        datas[campo] = data.toISOString();
      }
    }
    livros.push({ ...resultado.dados, status: estado, favorito: livro.favorito ?? false, avaliacao, ...datas });
  }
  return { dados: { livros, personalizacao: personalizacao.dados } };
}

// Faixas e janelas usadas pelos selects da barra de filtros
const FAIXAS_PAGINAS = {
  ate200: { paginasMax: 200 },
  de200a400: { paginasMin: 201, paginasMax: 400 },
  mais400: { paginasMin: 401 },
};
const JANELAS_CADASTRO = new Set([7, 30, 365]);

// Filtro de avaliação: "sem" = sem nota; "1" a "5" = nota mínima
function filtroAvaliacao(valor) {
  const v = String(valor || "");
  if (v === "sem") return { semAvaliacao: true, avaliacaoExata: null };
  if (/^[1-5]$/.test(v)) return { semAvaliacao: false, avaliacaoExata: Number(v) };
  return { semAvaliacao: false, avaliacaoExata: null };
}

// ---------- Filtros e listagem ----------

app.get("/api/filtros", rota(async (req, res) => {
  res.json(await req.db.filtros());
}));

app.get("/api/itens", rota(async (req, res) => {
  const limite = Math.min(Math.max(Math.floor(Number(req.query.limite)) || 50, 1), 100);
  const pagina = Math.min(Math.max(Math.floor(Number(req.query.pagina)) || 1, 1), 1000000);
  const cadastro = Number(req.query.cadastro);

  const resultado = await req.db.listar({
    q: String(req.query.q || ""),
    status: String(req.query.status || ""),
    genero: String(req.query.genero || ""),
    favorito: req.query.favorito === "1",
    emprestado: req.query.emprestado === "1",
    ...filtroAvaliacao(req.query.avaliacao),
    ordenar: String(req.query.ordenar || "titulo"),
    ...(FAIXAS_PAGINAS[req.query.faixa] || {}),
    dias: JANELAS_CADASTRO.has(cadastro) ? cadastro : null,
    pagina,
    limite,
  });

  res.json({ ...resultado, pagina, limite });
}));

app.get("/api/itens/:id", rota(async (req, res) => {
  const livro = await obterLivro(req);
  if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
  res.json({ ...livro, relacionados: await req.db.relacionados(livro) });
}));

// ---------- Cadastro e edição ----------

app.post("/api/itens", apenasAdmin, rota(async (req, res) => {
  const { dados, erro } = validarLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  res.status(201).json(await req.db.inserir(dados));
}));

app.put("/api/itens/:id", apenasAdmin, rota(async (req, res) => {
  if (!await obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });
  const { dados, erro } = validarLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  res.json(await req.db.atualizar(Number(req.params.id), dados));
}));

// Status, favorito, avaliação e empréstimo
app.patch("/api/itens/:id/estado", apenasAdmin, rota(async (req, res) => {
  if (!await obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });

  const corpo = req.body ?? {};
  const campos = {};

  if (corpo.status !== undefined) {
    if (!STATUS.includes(corpo.status)) return res.status(400).json({ erro: "Status inválido." });
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

  res.json(await req.db.atualizarEstado(Number(req.params.id), campos));
}));

// Exclusão definitiva
app.delete("/api/itens/:id", apenasAdmin, rota(async (req, res) => {
  if (!await obterLivro(req)) return res.status(404).json({ erro: "Livro não encontrado." });
  await req.db.excluir(Number(req.params.id));
  res.json({ ok: true });
}));

// ---------- ISBN (Open Library) ----------

function anoDe(textoData) {
  const m = String(textoData ?? "").match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

app.get("/api/isbn/:isbn", apenasAdmin, async (req, res) => {
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

app.post("/api/exportar", rota(async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 500)
    : [];
  if (!ids.length) {
    return res.status(400).json({ erro: "Selecione ao menos um livro para exportar." });
  }

  const livros = await req.db.buscarVarios(ids);
  if (!livros.length) return res.status(404).json({ erro: "Nenhum livro encontrado." });

  const nome = `acervo-${new Date().toISOString().slice(0, 10)}.doc`;
  res.setHeader("Content-Type", "application/msword; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(documentoDoc(livros));
}));

// ---------- Erros ----------

app.use("/api", (_req, res) => res.status(404).json({ erro: "Recurso não encontrado." }));
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "Requisição com formato inválido." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ erro: "Requisição muito grande." });
  }
  if (err.code === "42501") return res.status(403).json({ erro: "Você não tem permissão para esta operação." });
  if (["P0001", "22023"].includes(err.code)) return res.status(400).json({ erro: err.message || "Não foi possível concluir esta operação." });
  if (["23502", "23503", "23514", "22P02", "22007", "22008"].includes(err.code)) return res.status(400).json({ erro: "Dados inválidos. Revise os campos e tente novamente." });
  if (err.code === "23505") return res.status(409).json({ erro: "Este registro já existe." });
  if (["PGRST202", "42P01", "42883"].includes(err.code)) return res.status(503).json({ erro: "A atualização v3 do banco ainda não foi instalada. Siga o guia ATUALIZAR-V3 para concluir a configuração." });
  // Não registrar tokens, cabeçalhos ou conteúdo privado do acervo.
  console.error("Falha na biblioteca:", err.code || err.name || "erro desconhecido");
  res.status(500).json({ erro: "Erro interno do servidor." });
});
return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || "0.0.0.0";
  criarApp().listen(PORT, HOST, () => console.log(`Biblioteca rodando em http://localhost:${PORT}`));
}

module.exports = { criarApp };
