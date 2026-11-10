const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { criarRepositorio } = require("../db");

let postgres;
let bibliotecas;
const usuarios = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  leitor: "33333333-3333-4333-8333-333333333333",
};

before(async () => {
  postgres = new PGlite();
  // A infraestrutura do Auth é substituída somente neste banco em memória.
  // Todas as tabelas, funções, grants e políticas da aplicação são as reais.
  await postgres.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const schema = fs.readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8");
  await postgres.exec(schema);
  // Reaplicar o schema não deve apagar dados ou duplicar bibliotecas.
  await postgres.exec(schema);
  await postgres.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'a@example.test','{}'), ($2,'b@example.test','{}'), ($3,'leitor@example.test', $4::jsonb)",
    [usuarios.a, usuarios.b, usuarios.leitor, JSON.stringify({ papel: "admin", biblioteca_id: usuarios.a })]);
  const libs = await postgres.query("select id, proprietario_id from public.bibliotecas");
  bibliotecas = Object.fromEntries(libs.rows.map(l => [l.proprietario_id, l.id]));
  await postgres.query("insert into public.livros(biblioteca_id,titulo,autor) values ($1,'Livro de A','João'), ($2,'Livro de B','Maria')", [bibliotecas[usuarios.a], bibliotecas[usuarios.b]]);
  await postgres.query("insert into public.membros_biblioteca(biblioteca_id,user_id,papel) values ($1,$2,'visualizador')", [bibliotecas[usuarios.a], usuarios.leitor]);
});

after(async () => { if (postgres) await postgres.close(); });

async function comoUsuario(usuario, acao) {
  await postgres.exec("begin; set local role authenticated;");
  try {
    await postgres.query("select set_config('request.jwt.claim.sub', $1, true)", [usuario]);
    await acao();
  } finally {
    await postgres.exec("rollback");
  }
}

async function erroSQL(sql, parametros, codigo) {
  await postgres.exec("savepoint operacao_rejeitada");
  await assert.rejects(postgres.query(sql, parametros), erro => erro.code === codigo);
  await postgres.exec("rollback to savepoint operacao_rejeitada; release savepoint operacao_rejeitada");
}

test("cada cadastro cria exatamente uma biblioteca e metadados não concedem acesso", async () => {
  assert.equal((await postgres.query("select count(*)::int total from public.bibliotecas")).rows[0].total, 3);
  await comoUsuario(usuarios.b, async () => {
    const { rows } = await postgres.query("select titulo from public.livros");
    assert.deepEqual(rows.map(l => l.titulo), ["Livro de B"]);
    assert.equal((await postgres.query("select count(*)::int total from public.bibliotecas")).rows[0].total, 1);
    await erroSQL("select public.resumo_biblioteca($1)", [bibliotecas[usuarios.a]], "42501");
  });
  await comoUsuario(usuarios.leitor, async () => {
    assert.equal((await postgres.query("select papel from public.membros_biblioteca where biblioteca_id=$1 and user_id=$2", [bibliotecas[usuarios.a], usuarios.leitor])).rows[0].papel, "visualizador");
  });
});

test("proprietário edita seu acervo e não consegue ler, editar ou inserir no acervo alheio", async () => {
  await comoUsuario(usuarios.a, async () => {
    await postgres.query("insert into public.livros(biblioteca_id,titulo,tags) values ($1,'Ação e coração',array['aviação'])", [bibliotecas[usuarios.a]]);
    const { rows } = await postgres.query("select busca from public.livros where titulo='Ação e coração'");
    assert.ok(rows[0].busca.includes("acao e coracao"));
    assert.ok(rows[0].busca.includes("aviacao"));
    assert.equal((await postgres.query("update public.livros set titulo='Invadido' where biblioteca_id=$1 returning id", [bibliotecas[usuarios.b]])).rows.length, 0);
    assert.equal((await postgres.query("delete from public.livros where biblioteca_id=$1 returning id", [bibliotecas[usuarios.b]])).rows.length, 0);
    await erroSQL("insert into public.livros(biblioteca_id,titulo) values($1,'Invadido')", [bibliotecas[usuarios.b]], "42501");
    await erroSQL("update public.bibliotecas set proprietario_id=$1 where id=$2", [usuarios.b, bibliotecas[usuarios.a]], "42501");
  });
});

test("visualizador lê livros mas não altera estado, configuração, acessos ou restaura", async () => {
  await comoUsuario(usuarios.leitor, async () => {
    const destino = bibliotecas[usuarios.a];
    assert.equal((await postgres.query("select titulo from public.livros where biblioteca_id=$1", [destino])).rows[0].titulo, "Livro de A");
    assert.equal((await postgres.query("update public.livros set favorito=true where biblioteca_id=$1 returning id", [destino])).rows.length, 0);
    assert.equal((await postgres.query("delete from public.livros where biblioteca_id=$1 returning id", [destino])).rows.length, 0);
    assert.equal((await postgres.query("update public.bibliotecas set nome='Invadida' where id=$1 returning id", [destino])).rows.length, 0);
    await erroSQL("insert into public.livros(biblioteca_id,titulo) values($1,'Invadido')", [destino], "42501");
    await erroSQL("update public.membros_biblioteca set papel='admin' where biblioteca_id=$1 and user_id=$2", [destino, usuarios.leitor], "42501");
    await erroSQL("select public.compartilhar_biblioteca($1,'b@example.test')", [destino], "42501");
    await erroSQL("select public.membros_da_biblioteca($1)", [destino], "42501");
    await erroSQL("select public.restaurar_biblioteca($1,'{\"livros\":[]}')", [destino], "42501");
    await erroSQL("select public.backup_biblioteca($1)", [destino], "42501");
    await erroSQL("select public.revogar_acesso($1,$2)", [destino, usuarios.a], "42501");
  });
});

test("compartilhar concede somente visualização, preserva dono e permite revogação", async () => {
  await comoUsuario(usuarios.a, async () => {
    const destino = bibliotecas[usuarios.a];
    await postgres.query("select public.compartilhar_biblioteca($1,'B@example.test')", [destino]);
    await postgres.query("select public.compartilhar_biblioteca($1,'a@example.test')", [destino]);
    const { rows } = await postgres.query("select * from public.membros_da_biblioteca($1)", [destino]);
    assert.equal(rows.find(m => m.user_id === usuarios.b).papel, "visualizador");
    assert.equal(rows.find(m => m.user_id === usuarios.a).papel, "admin");
    await erroSQL("select public.revogar_acesso($1,$2)", [destino, usuarios.a], "22023");
    await postgres.query("select public.revogar_acesso($1,$2)", [destino, usuarios.leitor]);
    assert.equal((await postgres.query("select count(*)::int total from public.membros_biblioteca where biblioteca_id=$1 and user_id=$2", [destino, usuarios.leitor])).rows[0].total, 0);
    await erroSQL("select public.compartilhar_biblioteca($1,'inexistente@example.test')", [destino], "22023");
  });
});

test("restauração inválida desfaz exclusão e restauração válida troca somente a biblioteca escolhida", async () => {
  await comoUsuario(usuarios.a, async () => {
    const destino = bibliotecas[usuarios.a];
    const invalido = { livros: [{ titulo: "Primeiro válido" }, { titulo: "" }], personalizacao: { nome: "Não deve persistir" } };
    await erroSQL("select public.restaurar_biblioteca($1,$2::jsonb)", [destino, JSON.stringify(invalido)], "23514");
    assert.deepEqual((await postgres.query("select titulo from public.livros where biblioteca_id=$1", [destino])).rows.map(l => l.titulo), ["Livro de A"]);
    const valido = { livros: [{ id: 999, biblioteca_id: bibliotecas[usuarios.b], titulo: "Restaurado", status: "lido", favorito: true, avaliacao: 5, tags: ["memória"], criado_em: "2025-01-02T12:00:00Z" }], personalizacao: { nome: "Biblioteca restaurada", tema: "verde", cor_primaria: "#123456" } };
    const resultado = await postgres.query("select public.restaurar_biblioteca($1,$2::jsonb) resultado", [destino, JSON.stringify(valido)]);
    assert.equal(resultado.rows[0].resultado.total, 1);
    const livro = (await postgres.query("select * from public.livros where biblioteca_id=$1", [destino])).rows[0];
    assert.equal(livro.titulo, "Restaurado");
    assert.notEqual(Number(livro.id), 999);
    assert.equal(livro.biblioteca_id, destino);
    assert.equal(livro.status, "lido");
    assert.equal(livro.favorito, true);
    assert.deepEqual(livro.tags, ["memória"]);
    assert.equal((await postgres.query("select nome from public.bibliotecas where id=$1", [destino])).rows[0].nome, "Biblioteca restaurada");
    assert.equal((await postgres.query("select public.resumo_biblioteca($1) resumo", [destino])).rows[0].resumo.lidos, 1);
  });
  // A transação do teste não afeta a biblioteca de B nem os dados originais.
  assert.equal((await postgres.query("select titulo from public.livros where biblioteca_id=$1", [bibliotecas[usuarios.b]])).rows[0].titulo, "Livro de B");
});

test("anônimo não pode ler tabelas ou executar os RPCs de compartilhamento e backup", async () => {
  await postgres.exec("begin; set local role anon");
  try {
    await erroSQL("select * from public.livros", [], "42501");
    await erroSQL("select public.compartilhar_biblioteca($1,'a@example.test')", [bibliotecas[usuarios.a]], "42501");
    await erroSQL("select public.restaurar_biblioteca($1,'{\"livros\":[]}')", [bibliotecas[usuarios.a]], "42501");
    await erroSQL("select public.backup_biblioteca($1)", [bibliotecas[usuarios.a]], "42501");
  } finally { await postgres.exec("rollback"); }
});

test("backup é um snapshot completo acima de 1.000 livros e não inclui outra biblioteca", async () => {
  await comoUsuario(usuarios.a, async () => {
    const destino = bibliotecas[usuarios.a];
    await postgres.query("insert into public.livros(biblioteca_id,titulo) select $1, 'Livro ' || i from generate_series(1, 1100) i", [destino]);
    const backup = (await postgres.query("select public.backup_biblioteca($1) livros", [destino])).rows[0].livros;
    assert.equal(backup.length, 1101);
    assert.equal(new Set(backup.map(l => l.id)).size, 1101);
    assert.ok(backup.every(l => l.biblioteca_id === destino));
    assert.ok(backup.every(l => Array.isArray(l.tags)));
    await erroSQL("select public.backup_biblioteca($1)", [bibliotecas[usuarios.b]], "42501");
  });
});

test("repositório inclui o filtro de biblioteca e normaliza busca sem compor expressões OR", async () => {
  const chamadas = [];
  const consulta = new Proxy({}, { get: (_obj, metodo) => {
    if (metodo === "then") return resolve => resolve({ data: [], count: 0, error: null });
    return (...args) => { chamadas.push([metodo, ...args]); return consulta; };
  } });
  const repo = criarRepositorio({ from: nome => { chamadas.push(["from", nome]); return consulta; } }, "biblioteca-escolhida");
  await repo.listar({ q: "Coração  aviação", status: "lido", pagina: 2, limite: 50 });
  assert.ok(chamadas.some(c => c[0] === "eq" && c[1] === "biblioteca_id" && c[2] === "biblioteca-escolhida"));
  assert.ok(chamadas.some(c => c[0] === "ilike" && c[2] === "%coracao%"));
  assert.ok(chamadas.some(c => c[0] === "ilike" && c[2] === "%aviacao%"));
  assert.ok(chamadas.some(c => c[0] === "range" && c[1] === 50 && c[2] === 99));
  assert.equal(chamadas.some(c => c[0] === "or"), false);
  chamadas.length = 0;
  await repo.atualizar(42, { titulo: "Meu livro", biblioteca_id: "outra", status: "lido", id: 900 });
  const payload = chamadas.find(c => c[0] === "update")[1];
  assert.deepEqual(payload, { titulo: "Meu livro" });
  assert.ok(chamadas.some(c => c[0] === "eq" && c[1] === "biblioteca_id" && c[2] === "biblioteca-escolhida"));
});
