const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { criarApp } = require("../server");
const { configuracao } = require("../auth");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FORA = "33333333-3333-4333-8333-333333333333";
const USUARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const biblioteca = id => ({ id, nome: id === A ? "Acervo A" : "Acervo B", subtitulo: "Meu acervo", cor_primaria: "#b58e8d", tema: "floral", proprietario_id: id === A ? USUARIO : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
const chamadas = [];
let falhar = false;
let restaurado;
let base;
let servidor;

async function supabaseSimulado(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url || String(input));
  const headers = new Headers(init.headers);
  const token = headers.get("authorization")?.replace("Bearer ", "");
  chamadas.push({ url, metodo: init.method || "GET", body: init.body && JSON.parse(init.body), token });
  const json = (dados, status = 200, extras = {}) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json", ...extras } });
  if (url.pathname === "/auth/v1/user") {
    return token === "invalido" ? json({ message: "Invalid JWT", code: "bad_jwt" }, 401) : json({ id: USUARIO, email: "teste@example.com" });
  }
  if (url.pathname.endsWith("/membros_biblioteca")) {
    return json(token === "viewer" ? [{ papel: "visualizador", biblioteca: biblioteca(B) }] : [{ papel: "admin", biblioteca: biblioteca(A) }, { papel: "visualizador", biblioteca: biblioteca(B) }]);
  }
  if (falhar) return json({ message: "Detalhe interno sensível", code: "XX000" }, 500);
  if (url.pathname.endsWith("/rpc/restaurar_biblioteca")) {
    restaurado = JSON.parse(init.body);
    return json({ ok: true });
  }
  if (url.pathname.endsWith("/rpc/backup_biblioteca")) return json([{ id: 7, titulo: "Livro A", biblioteca_id: A, busca: "privado", tags: [], status: "nao_lido", favorito: false, emprestado: false, avaliacao: 0 }]);
  if (url.pathname.endsWith("/rpc/compartilhar_biblioteca")) return json({ code: "22023", message: "Peça a esta pessoa para criar e confirmar a conta antes de compartilhar." }, 400);
  if (url.pathname.endsWith("/livros")) {
    const id = url.searchParams.get("biblioteca_id")?.replace("eq.", "");
    const livros = id === A ? [{ id: 7, titulo: "Livro A", autor: "Autora", biblioteca_id: A, busca: "privado", tags: [], status: "nao_lido", favorito: false, emprestado: false, avaliacao: 0 }] : [];
    return json(livros, 200, { "Content-Range": `0-0/${livros.length}` });
  }
  return json([]);
}

before(async () => {
  const app = criarApp({ supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "sb_publishable_test", createSupabaseClient: (url, key, options) => createClient(url, key, { ...options, global: { ...options.global, fetch: supabaseSimulado } }) });
  servidor = app.listen(0, "127.0.0.1");
  await new Promise(resolve => servidor.once("listening", resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => new Promise(resolve => servidor.close(resolve)));

function requisicao(path, { token = "admin", bibliotecaId, method = "GET", body } = {}) {
  return fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(bibliotecaId ? { "X-Biblioteca-Id": bibliotecaId } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("configuração nunca publica chave secreta ou service_role", () => {
  for (const key of ["sb_secret_test", "invalida", `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`]) {
    assert.deepEqual(configuracao({ supabaseUrl: "https://test.supabase.co", supabaseAnonKey: key }), { configurado: false, supabaseUrl: "", supabaseAnonKey: "" });
  }
  assert.equal(configuracao({ supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "sb_publishable_test" }).configurado, true);
});

test("health/config são públicos e API sem login ou com token inválido é negada", async () => {
  assert.equal((await requisicao("/api/health", { token: null })).status, 200);
  const config = await (await requisicao("/api/config", { token: null })).json();
  assert.equal(config.configurado, true);
  assert.equal((await requisicao("/api/itens", { token: null })).status, 401);
  assert.equal((await requisicao("/api/itens", { token: "invalido" })).status, 401);
});

test("conta seleciona biblioteca própria e respeita biblioteca compartilhada", async () => {
  const propria = await (await requisicao("/api/conta")).json();
  assert.equal(propria.biblioteca.id, A);
  assert.equal(propria.bibliotecas.length, 2);
  const compartilhada = await (await requisicao("/api/conta", { bibliotecaId: B })).json();
  assert.equal(compartilhada.biblioteca.papel, "visualizador");
});

test("cabeçalho não concede acesso a biblioteca de outra conta", async () => {
  const inicio = chamadas.length;
  assert.equal((await requisicao("/api/itens", { bibliotecaId: FORA })).status, 403);
  assert.equal(chamadas.slice(inicio).some(c => c.url.pathname.endsWith("/livros")), false);
  assert.equal((await requisicao("/api/itens", { bibliotecaId: "invalida" })).status, 400);
});

test("toda consulta e exportação é limitada à biblioteca escolhida", async () => {
  const dados = await (await requisicao("/api/itens?pagina=1&limite=20")).json();
  assert.equal(dados.itens[0].titulo, "Livro A");
  assert.equal(dados.itens[0].biblioteca_id, undefined);
  assert.equal(dados.itens[0].busca, undefined);
  assert.equal(chamadas.at(-1).url.searchParams.get("biblioteca_id"), `eq.${A}`);
  const resposta = await requisicao("/api/exportar", { method: "POST", bibliotecaId: B, body: { ids: [7] } });
  assert.equal(resposta.status, 404);
  assert.equal(chamadas.at(-1).url.searchParams.get("biblioteca_id"), `eq.${B}`);
});

test("visualizador consulta mas não altera dados, configurações ou acessos", async () => {
  assert.equal((await requisicao("/api/itens", { token: "viewer" })).status, 200);
  const rotas = [["POST", "/api/itens"], ["PUT", "/api/itens/7"], ["PATCH", "/api/itens/7/estado"], ["DELETE", "/api/itens/7"], ["PATCH", "/api/biblioteca"], ["POST", "/api/membros"], ["GET", "/api/membros"], ["DELETE", `/api/membros/${USUARIO}`], ["GET", "/api/backup"], ["POST", "/api/restaurar"], ["GET", "/api/isbn/1234567890"]];
  for (const [method, path] of rotas) {
    const resposta = await requisicao(path, { method, token: "viewer" });
    assert.equal(resposta.status, 403, `${method} ${path}`);
  }
});

test("admin também perde permissão ao escolher uma biblioteca de visualização", async () => {
  assert.equal((await requisicao("/api/itens", { method: "POST", bibliotecaId: B, body: { titulo: "Intruso" } })).status, 403);
});

test("backup contém dados e personalização da biblioteca autenticada", async () => {
  const resposta = await requisicao("/api/backup");
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers.get("content-disposition"), /attachment/);
  const backup = await resposta.json();
  assert.equal(backup.formato, "biblioteca-particular");
  assert.equal(backup.personalizacao.nome, "Acervo A");
  assert.equal(backup.livros.length, 1);
  assert.equal(backup.livros[0].biblioteca_id, undefined);
});

const backupValido = () => ({ formato: "biblioteca-particular", versao: 1, personalizacao: { nome: "Restaurada", subtitulo: "", cor_primaria: "#123456", tema: "verde" }, livros: [{ id: 200, biblioteca_id: FORA, titulo: "Importado", status: "lido", favorito: true, avaliacao: 4, tags: ["ficção"] }] });

test("restauração valida confirmação e todos os livros antes de gravar", async () => {
  restaurado = undefined;
  let resposta = await requisicao("/api/restaurar", { method: "POST", body: { confirmacao: "Outra", backup: backupValido() } });
  assert.equal(resposta.status, 400);
  const backup = backupValido();
  backup.livros.push({ titulo: "" });
  resposta = await requisicao("/api/restaurar", { method: "POST", body: { confirmacao: "Acervo A", backup } });
  assert.equal(resposta.status, 400);
  assert.equal(restaurado, undefined);
});

test("restauração ignora propriedade e IDs do arquivo preservando estados", async () => {
  const resposta = await requisicao("/api/restaurar", { method: "POST", body: { confirmacao: "Acervo A", backup: backupValido() } });
  assert.equal(resposta.status, 200);
  assert.equal(restaurado.biblioteca_destino, A);
  assert.equal(restaurado.dados.livros[0].id, undefined);
  assert.equal(restaurado.dados.livros[0].biblioteca_id, undefined);
  assert.equal(restaurado.dados.livros[0].favorito, true);
  assert.equal(restaurado.dados.livros[0].status, "lido");
});

test("validação impede livros e aparência inválidos", async () => {
  assert.equal((await requisicao("/api/itens", { method: "POST", body: null })).status, 400);
  assert.equal((await requisicao("/api/itens", { method: "POST", body: { titulo: "Teste", capa_url: "javascript:alert(1)" } })).status, 400);
  assert.equal((await requisicao("/api/biblioteca", { method: "PATCH", body: { nome: "Teste", cor_primaria: "#123456", tema: "inexistente" } })).status, 400);
});

test("erro de email não cadastrado retorna orientação útil", async () => {
  const resposta = await requisicao("/api/membros", { method: "POST", body: { email: "ausente@example.com" } });
  assert.equal(resposta.status, 400);
  assert.match((await resposta.json()).erro, /criar e confirmar/);
});

test("falhas assíncronas retornam JSON sem detalhes internos", async () => {
  falhar = true;
  try {
    const resposta = await requisicao("/api/itens");
    assert.equal(resposta.status, 500);
    assert.equal((await resposta.json()).erro, "Erro interno do servidor.");
  } finally { falhar = false; }
});
