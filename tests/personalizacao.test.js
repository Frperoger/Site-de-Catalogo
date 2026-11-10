"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { prepararImagem, prepararPacote, Modelo } = require("../lib/aparencia");

test("todos os espaços aceitam imagens pequenas, opacas e de qualquer proporção", async () => {
  const bytes = await sharp({ create: { width: 19, height: 237, channels: 3, background: "#5f8263" } }).jpeg().toBuffer();
  for (const slot of Object.keys(Modelo.regras)) {
    assert.equal(Modelo.validarDimensoes(slot, 19, 237, false), "");
    const a = await prepararImagem(bytes, slot, "imagem em qualquer formato.jpg");
    assert.match(a.url, /^data:image\/webp;base64,/);
    assert.equal(a.width, 19); assert.equal(a.height, 237);
    assert.equal((await sharp(Buffer.from(a.url.split(",")[1], "base64")).metadata()).format, "webp");
  }
});
test("imagens grandes são ajustadas e arquivos falsos não são guardados", async () => {
  const bytes = await sharp({ create: { width: 4000, height: 1000, channels: 4, background: "#b58e8d" } }).png().toBuffer();
  const logo = await prepararImagem(bytes, "logo");
  assert.equal(logo.width, 640); assert.equal(logo.height, 160);
  await assert.rejects(prepararImagem(Buffer.from("<html>não sou uma imagem</html>"), "logo"), /Não foi possível abrir/);
  await assert.rejects(prepararImagem(bytes, "inexistente"), /espaço de imagem/);
});
test("pacote normaliza imagens importadas, rejeita URLs externas e guarda só as imagens em uso", async () => {
  const bytes = await sharp({ create: { width: 32, height: 17, channels: 3, background: "#567459" } }).png().toBuffer();
  const estado = { ...Modelo.modelo("jardim"), nota: "custom", uploads: { nota: "imagem-1" } };
  const doc = { estado, arquivos: [{ id: "imagem-1", url: "data:image/png;base64," + bytes.toString("base64"), nome: "nota.png" }, { id: "sem-uso", url: "não guardar" }] };
  const salvo = await prepararPacote(doc);
  assert.equal(salvo.arquivos.length, 1); assert.equal(salvo.arquivos[0].id, "imagem-1");
  assert.equal(salvo.arquivos[0].height, 17);
  await assert.rejects(prepararPacote({ estado, arquivos: [{ id: "imagem-1", url: "https://fora.test/nota.png" }] }), /imagem válida/);
  await assert.rejects(prepararPacote({ estado, arquivos: [] }), /imagem válida/);
});
test("modelos e personalização legada preservam o nome da biblioteca e o contraste", () => {
  for (const id of Object.keys(Modelo.modelos)) {
    const m = Modelo.modelo(id); assert.deepEqual(Modelo.normalizar(m), m);
    assert.ok(Modelo.contraste(m.tinta, m.papel) >= 4.5);
    for (const slot of Object.keys(Modelo.regras)) assert.equal(Modelo.listas[slot].length, 3);
  }
  const antiga = Modelo.legado({ nome: "Meu acervo", subtitulo: "Minha assinatura", tema: "verde", cor_primaria: "#345678" });
  assert.equal(antiga.nome, "Meu acervo"); assert.equal(antiga.cor, "#345678");
  assert.equal(antiga.modelo, "classica");
});
