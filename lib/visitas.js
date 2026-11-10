"use strict";
const crypto = require("node:crypto");
const path = require("node:path");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function registrarVisitas(app, { config, publico, rota }) {
  app.get("/visita/:token", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });
  const consultar = acao => rota(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!TOKEN.test(req.params.token)) return res.status(410).json({ erro: "Este link expirou ou foi revogado. Peça um novo convite ao dono da biblioteca." });
    if (!config.configurado) return res.status(503).json({ erro: "Não foi possível abrir a biblioteca. Tente novamente mais tarde." });
    const texto = k => String(req.query[k] || "").slice(0, 300);
    const opcoes = Object.fromEntries(["q", "status", "genero", "favorito", "emprestado", "avaliacao", "ordenar", "faixa", "cadastro"].map(k => [k, texto(k)]));
    opcoes.pagina = Math.min(1000000, Math.max(1, Math.floor(Number(req.query.pagina)) || 1));
    opcoes.limite = Math.min(100, Math.max(1, Math.floor(Number(req.query.limite)) || 50));
    if (req.params.id) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ erro: "Livro não encontrado." });
      opcoes.id = id;
    }
    // Nunca transmite o JWT de uma pessoa que já esteja conectada no navegador.
    const { data, error } = await publico().rpc("consultar_visita", { chave: req.params.token, acao, opcoes });
    if (error) {
      if (error.code === "P0002") return res.status(410).json({ erro: "Este link expirou ou foi revogado. Peça um novo convite ao dono da biblioteca." });
      throw error;
    }
    if (acao === "detalhe" && !data) return res.status(404).json({ erro: "Livro não encontrado." });
    res.json(data);
  });
  app.get("/api/visita/:token", consultar("config"));
  app.get("/api/visita/:token/filtros", consultar("filtros"));
  app.get("/api/visita/:token/itens", consultar("itens"));
  app.get("/api/visita/:token/itens/:id", consultar("detalhe"));
  app.all("/api/visita/:token*", (_req, res) => res.status(405).set("Allow", "GET").json({ erro: "O link de visitante permite somente consultar a biblioteca." }));
}

function registrarConvites(app, { apenasAdmin, rota, UUID }) {
  app.get("/api/convites", apenasAdmin, rota(async (req, res) => {
    const { data, error } = await req.supabase.rpc("listar_convites", { biblioteca_destino: req.biblioteca.id });
    if (error) throw error;
    res.json(data || []);
  }));
  app.post("/api/convites", apenasAdmin, rota(async (req, res) => {
    const dias = Number(req.body?.dias);
    if (![1, 7, 30].includes(dias)) return res.status(400).json({ erro: "Escolha uma validade de 1, 7 ou 30 dias." });
    const token = crypto.randomBytes(32).toString("base64url");
    const { data, error } = await req.supabase.rpc("criar_convite", {
      biblioteca_destino: req.biblioteca.id, resumo_chave: crypto.createHash("sha256").update(token).digest("hex"),
      dias, mostrar_avaliacoes: req.body?.avaliacoes !== false, mostrar_localizacao: req.body?.localizacao === true,
    });
    if (error) throw error;
    res.status(201).json({ ...data, caminho: "/visita/" + token });
  }));
  app.delete("/api/convites/:id", apenasAdmin, rota(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ erro: "Convite inválido." });
    const { error } = await req.supabase.rpc("revogar_convite", { biblioteca_destino: req.biblioteca.id, convite_id: req.params.id });
    if (error) throw error;
    res.json({ ok: true });
  }));
}

module.exports = { registrarVisitas, registrarConvites, TOKEN };
