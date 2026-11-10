"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { exportar } = require("../scripts/exportar-sqlite");

let DatabaseSync;
try { ({ DatabaseSync } = require("node:sqlite")); } catch { /* Teste requer SQLite nativo. */ }

test("migração lê inclusive WAL, preserva banco original e recusa sobrescrever backup", { skip: !DatabaseSync }, t => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "biblioteca-migracao-"));
  const entrada = path.join(pasta, "acervo.db");
  const saida = path.join(pasta, "backup.json");
  const banco = new DatabaseSync(entrada);
  t.after(() => {
    banco.close();
    for (const arquivo of fs.readdirSync(pasta)) fs.unlinkSync(path.join(pasta, arquivo));
    fs.rmdirSync(pasta);
  });
  banco.exec("PRAGMA journal_mode = WAL");
  banco.exec(`CREATE TABLE livros (
    id INTEGER PRIMARY KEY, titulo TEXT, tags TEXT, favorito INTEGER, emprestado INTEGER,
    busca TEXT, criado_em TEXT, atualizado_em TEXT
  )`);
  banco.prepare("INSERT INTO livros VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    1, "Livro de teste", '["Estudo"]', 1, 0, "livro de teste", "2026-11-09 09:30:00", "2026-11-09 10:00:00"
  );
  const hash = arquivo => crypto.createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex");
  const original = hash(entrada);
  const walOriginal = hash(entrada + "-wal");

  assert.equal(exportar(entrada, saida), 1);
  const backup = JSON.parse(fs.readFileSync(saida, "utf8"));
  assert.equal(backup.formato, "biblioteca-particular");
  assert.equal(backup.versao, 1);
  assert.equal(backup.livros[0].titulo, "Livro de teste");
  assert.deepEqual(backup.livros[0].tags, ["Estudo"]);
  assert.equal(backup.livros[0].favorito, true);
  assert.equal(backup.livros[0].emprestado, false);
  assert.equal(backup.livros[0].criado_em, "2026-11-09T09:30:00-03:00");
  assert.equal(backup.livros[0].atualizado_em, "2026-11-09T10:00:00-03:00");
  assert.equal("id" in backup.livros[0], false);
  assert.equal("busca" in backup.livros[0], false);
  assert.equal(hash(entrada), original);
  assert.equal(hash(entrada + "-wal"), walOriginal);

  const arquivoAnterior = hash(saida);
  assert.throws(() => exportar(entrada, saida), { code: "EEXIST" });
  assert.equal(hash(saida), arquivoAnterior);
  assert.equal(hash(entrada), original);
  assert.equal(hash(entrada + "-wal"), walOriginal);
  assert.throws(() => exportar(entrada, entrada), /diferente do banco original/);
  assert.equal(hash(entrada), original);
});
