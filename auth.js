const { createClient } = require("@supabase/supabase-js");
const { criarRepositorio } = require("./db");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configuracao(opcoes = {}) {
  const url = opcoes.supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const chave = opcoes.supabaseAnonKey ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  let chavePublica = Boolean(chave) && !chave.startsWith("sb_secret_");
  if (chave.split(".").length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(chave.split(".")[1], "base64url").toString());
      chavePublica = payload.role === "anon";
    } catch { chavePublica = false; }
  } else {
    chavePublica = chave.startsWith("sb_publishable_");
  }
  let urlValida = false;
  try {
    const parsed = new URL(url);
    urlValida = parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch { /* Configuração ainda não preenchida. */ }
  const configurado = urlValida && chavePublica;
  return { supabaseUrl: configurado ? url : "", supabaseAnonKey: configurado ? chave : "", configurado };
}

function criarAutenticacao(opcoes = {}) {
  const config = configuracao(opcoes);
  const criarCliente = opcoes.createSupabaseClient || createClient;
  return {
    config,
    autenticar: async (req, res, next) => {
      try {
        if (!config.configurado) return res.status(503).json({ erro: "Configure o projeto Supabase para começar a usar sua biblioteca." });
        const token = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1];
        if (!token) return res.status(401).json({ erro: "Entre na sua conta para acessar a biblioteca." });
        // Um cliente por requisição: credenciais e sessões nunca são compartilhadas entre usuários.
        const client = criarCliente(config.supabaseUrl, config.supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data, error } = await client.auth.getUser(token);
        if (error || !data?.user) return res.status(401).json({ erro: "Sua sessão expirou. Entre novamente." });
        req.usuario = data.user;
        req.supabase = client;
        const resultado = await client.from("membros_biblioteca")
          .select("papel,biblioteca:bibliotecas(id,nome,subtitulo,cor_primaria,tema,proprietario_id)")
          .eq("user_id", data.user.id);
        if (resultado.error) throw resultado.error;
        req.bibliotecas = (resultado.data || []).filter(m => m.biblioteca).map(m => ({ ...m.biblioteca, papel: m.papel }));
        const escolhida = req.get("X-Biblioteca-Id");
        if (escolhida && !UUID.test(escolhida)) return res.status(400).json({ erro: "Biblioteca inválida." });
        req.biblioteca = escolhida
          ? req.bibliotecas.find(b => b.id === escolhida)
          : req.bibliotecas.find(b => b.proprietario_id === data.user.id) || req.bibliotecas[0];
        if (!req.biblioteca) return res.status(403).json({ erro: "Você não tem acesso a esta biblioteca. Recarregue a página para atualizar seus acessos." });
        req.db = criarRepositorio(client, req.biblioteca.id);
        next();
      } catch (err) { next(err); }
    },
  };
}

function apenasAdmin(req, res, next) {
  if (req.biblioteca?.papel !== "admin") return res.status(403).json({ erro: "Esta conta tem acesso apenas para visualização nesta biblioteca." });
  next();
}

module.exports = { criarAutenticacao, apenasAdmin, configuracao, UUID };
