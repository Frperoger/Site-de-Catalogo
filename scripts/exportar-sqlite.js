"use strict";

// Conversão somente de leitura: o SQLite original não é alterado.
const fs = require("node:fs");
const path = require("node:path");

function dataLegada(valor) {
  // A versão local gravava datetime('now', 'localtime') em São Paulo.
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(valor || ""))
    ? valor.replace(" ", "T") + "-03:00"
    : valor;
}

function abrirSomenteLeitura(caminhoBanco) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    throw new Error("Use Node.js 22.13 ou superior para exportar o SQLite com o conversor incluído no próprio Node.");
  }
  return new DatabaseSync(caminhoBanco, { readOnly: true });
}

function exportar(caminhoBanco, caminhoSaida) {
  if (!fs.existsSync(caminhoBanco)) throw new Error("Banco SQLite não encontrado no caminho informado.");
  if (path.resolve(caminhoBanco) === path.resolve(caminhoSaida)) {
    throw new Error("O arquivo de saída deve ser diferente do banco original.");
  }

  const banco = abrirSomenteLeitura(caminhoBanco);
  let livros;
  try {
    livros = banco.prepare("SELECT * FROM livros ORDER BY id").all().map(row => {
      const { id, biblioteca_id, busca, ...livro } = row;
      let tags;
      try {
        tags = JSON.parse(livro.tags || "[]");
      } catch {
        throw new Error("Uma lista de etiquetas no SQLite está inválida. Corrija uma cópia do banco antes de exportar.");
      }
      if (!Array.isArray(tags)) throw new Error("Uma lista de etiquetas no SQLite não é uma lista válida.");
      return {
        ...livro,
        localizacao: livro.localizacao || "",
        emprestado_para: livro.emprestado_para || "",
        tags,
        favorito: livro.favorito === 1,
        emprestado: livro.emprestado === 1,
        criado_em: dataLegada(livro.criado_em),
        atualizado_em: dataLegada(livro.atualizado_em),
      };
    });
  } finally {
    banco.close();
  }

  const backup = {
    formato: "biblioteca-particular",
    versao: 1,
    exportado_em: new Date().toISOString(),
    personalizacao: {
      nome: "Biblioteca Particular",
      subtitulo: "",
      cor_primaria: "#b58e8d",
      tema: "floral",
    },
    livros,
  };
  // 'wx' evita substituir um backup já existente por engano.
  fs.writeFileSync(caminhoSaida, JSON.stringify(backup, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return livros.length;
}

if (require.main === module) {
  const entrada = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "acervo.db"));
  const saida = path.resolve(process.argv[3] || path.join(__dirname, "..", "backup-local.json"));
  try {
    const quantidade = exportar(entrada, saida);
    console.log(`Backup criado com ${quantidade} livro(s). O banco original foi preservado.`);
    console.log(`Arquivo: ${saida}`);
  } catch (erro) {
    console.error(erro.code === "EEXIST" ? "O arquivo de saída já existe. Escolha outro nome para preservar o backup anterior." : erro.message);
    process.exitCode = 1;
  }
}

module.exports = { exportar };
