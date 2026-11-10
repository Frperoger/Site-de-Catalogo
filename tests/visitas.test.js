"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const { Modelo } = require("../lib/aparencia");

let db, a, b, convite;
const donoA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", donoB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", leitor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const chave = "a".repeat(43), chave2 = "b".repeat(43);
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
async function como(papel, uid, sql, params = []) {
  await db.exec("begin; set local role " + papel);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid || ""]);
    const r = await db.query(sql, params); await db.exec("commit"); return r;
  } catch (e) { await db.exec("rollback"); throw e; }
}
const publico = (acao, opcoes = {}, token = chave) => como("anon", null, "select public.consultar_visita($1,$2,$3::jsonb) as dados", [token, acao, JSON.stringify(opcoes)]).then(r => r.rows[0].dados);

before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  await db.exec(fs.readFileSync("supabase/schema.sql", "utf8"));
  await db.query("insert into auth.users(id,email) values($1,'a@exemplo.test'),($2,'b@exemplo.test'),($3,'leitor@exemplo.test')", [donoA, donoB, leitor]);
  const libs = (await db.query("select id,proprietario_id from public.bibliotecas")).rows;
  a = libs.find(l => l.proprietario_id === donoA).id; b = libs.find(l => l.proprietario_id === donoB).id;
  await db.query("insert into public.membros_biblioteca(biblioteca_id,user_id,papel) values($1,$2,'visualizador')", [a, leitor]);
  await db.query("insert into public.livros(biblioteca_id,titulo,autor,genero,localizacao,emprestado,emprestado_para,avaliacao) values($1,'Ação e coração','Autora A','Poesia','SALA_SECRETA',true,'PESSOA_PRIVADA',5),($1,'Outro de A','Autora A','Poesia','',false,'',2),($1,'Terceiro de A','Autora A','Poesia','',false,'',0),($2,'Livro particular de B','Autora B','Ficção','',false,'',4)", [a, b]);
  // Atualizar uma instalação que já contém livros preserva os dados. Reaplicar é seguro.
  const atualizacao = fs.readFileSync("supabase/migrations/003_personalizacao_visitas.sql", "utf8");
  await db.exec(atualizacao); await db.exec(atualizacao);
});
after(async () => { if (db) await db.close(); });

test("atualização mantém os acervos e a personalização só pode ser salva por seu administrador", async () => {
  assert.equal((await db.query("select count(*)::int n from public.livros")).rows[0].n, 4);
  const pacote = { estado: { ...Modelo.modelo("noturna"), nome: "Noite de A" }, arquivos: [] };
  await como("authenticated", donoA, "select public.salvar_aparencia($1,$2::jsonb)", [a, JSON.stringify(pacote)]);
  const salvo = await como("authenticated", leitor, "select public.obter_aparencia($1) as p", [a]);
  assert.equal(salvo.rows[0].p.estado.nome, "Noite de A");
  await assert.rejects(como("authenticated", leitor, "select public.salvar_aparencia($1,$2::jsonb)", [a, JSON.stringify(pacote)]), e => e.code === "42501");
  await assert.rejects(como("authenticated", donoB, "select public.obter_aparencia($1)", [a]), e => e.code === "42501");
  assert.equal((await db.query("select nome from public.bibliotecas where id=$1", [a])).rows[0].nome, "Noite de A");
});
test("apenas o administrador cria convites; o endereço original não é guardado no banco", async () => {
  await assert.rejects(como("authenticated", leitor, "select public.criar_convite($1,$2,7,false,false)", [a, hash(chave)]), e => e.code === "42501");
  const r = await como("authenticated", donoA, "select public.criar_convite($1,$2,7,false,false) as c", [a, hash(chave)]);
  convite = r.rows[0].c;
  assert.ok(convite.id);
  const guardado = (await db.query("select * from public.convites_biblioteca where id=$1", [convite.id])).rows[0];
  assert.equal(guardado.chave_hash, hash(chave)); assert.ok(!JSON.stringify(guardado).includes(chave));
  await assert.rejects(como("authenticated", donoA, "select * from public.convites_biblioteca"), e => e.code === "42501");
});
test("visita sem conta abre só a biblioteca do convite e não expõe dados da conta", async () => {
  const config = await publico("config", { biblioteca_id: b });
  assert.equal(config.biblioteca.id, a); assert.equal(config.biblioteca.nome, "Noite de A");
  assert.equal(config.biblioteca.proprietario_id, undefined); assert.equal(config.usuario, undefined);
  assert.equal(config.aparencia.estado.modelo, "noturna");
  await assert.rejects(como("anon", null, "select * from public.livros"), e => e.code === "42501");
  await assert.rejects(como("anon", null, "select * from public.personalizacoes_biblioteca"), e => e.code === "42501");
  await assert.rejects(como("anon", null, "select public.listar_convites($1)", [a]), e => e.code === "42501");
  await assert.rejects(publico("editar", { id: 1 }), e => e.code === "42501");
});
test("busca, filtros, paginação e detalhes respeitam a biblioteca e ocultam campos privados", async () => {
  const resultado = await publico("itens", { pagina: 1, limite: 2 });
  assert.equal(resultado.total, 3); assert.equal(resultado.itens.length, 2);
  for (const livro of resultado.itens) {
    assert.equal(livro.biblioteca_id, undefined); assert.equal(livro.emprestado_para, undefined);
    assert.equal(livro.localizacao, ""); assert.equal(livro.avaliacao, null);
  }
  assert.equal((await publico("itens", { pagina: 2, limite: 2 })).itens.length, 1);
  assert.equal((await publico("itens", { q: "coracao" })).total, 1);
  assert.equal((await publico("itens", { q: "PESSOA_PRIVADA" })).total, 0);
  assert.equal((await publico("itens", { q: "SALA_SECRETA" })).total, 0);
  assert.equal((await publico("itens", { avaliacao: "5" })).total, 3);
  const detalhe = await publico("detalhe", { id: resultado.itens[0].id });
  assert.equal(detalhe.relacionados.length, 2); assert.equal(detalhe.emprestado_para, undefined);
  const alheio = (await db.query("select id from public.livros where biblioteca_id=$1", [b])).rows[0].id;
  assert.equal(await publico("detalhe", { id: alheio }), null);
  assert.equal((await publico("filtros")).total, 3);
});
test("convite pode exibir notas e localização sem liberar nomes de quem pegou emprestado", async () => {
  await como("authenticated", donoA, "select public.criar_convite($1,$2,1,true,true)", [a, hash(chave2)]);
  const r = await publico("itens", { q: "SALA_SECRETA", avaliacao: "5" }, chave2);
  assert.equal(r.total, 1); assert.equal(r.itens[0].avaliacao, 5); assert.equal(r.itens[0].localizacao, "SALA_SECRETA");
  assert.equal(r.itens[0].emprestado_para, undefined);
});
test("revogar e expirar bloqueiam consultas; outra biblioteca não revoga o convite", async () => {
  await como("authenticated", donoB, "select public.revogar_convite($1,$2)", [b, convite.id]);
  assert.equal((await publico("itens")).total, 3);
  await como("authenticated", donoA, "select public.revogar_convite($1,$2)", [a, convite.id]);
  await assert.rejects(publico("config"), e => e.code === "P0002");
  await db.query("update public.convites_biblioteca set expira_em=now()-interval '1 second' where chave_hash=$1", [hash(chave2)]);
  await assert.rejects(publico("itens", {}, chave2), e => e.code === "P0002");
  await assert.rejects(publico("config", {}, "z".repeat(43)), e => e.code === "P0002");
});
test("backup restaura a composição e imagens na mesma transação; backups v2 continuam válidos", async () => {
  const pacote = { estado: { ...Modelo.modelo("classica"), nome: "Restaurada" }, arquivos: [] };
  const dados = { livros: [{ titulo: "Livro restaurado" }], personalizacao: { nome: "Restaurada", aparencia: pacote } };
  await como("authenticated", donoA, "select public.restaurar_biblioteca($1,$2::jsonb)", [a, JSON.stringify(dados)]);
  assert.equal((await como("authenticated", donoA, "select public.obter_aparencia($1) as p", [a])).rows[0].p.estado.modelo, "classica");
  delete dados.personalizacao.aparencia;
  await como("authenticated", donoA, "select public.restaurar_biblioteca($1,$2::jsonb)", [a, JSON.stringify(dados)]);
  assert.equal((await como("authenticated", donoA, "select public.obter_aparencia($1) as p", [a])).rows[0].p, null);
  assert.equal((await db.query("select count(*)::int n from public.livros where biblioteca_id=$1", [b])).rows[0].n, 1);
});
