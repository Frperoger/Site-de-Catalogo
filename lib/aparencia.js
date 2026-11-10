"use strict";
const crypto = require("node:crypto");
const sharp = require("sharp");
const Modelo = require("../public/js/aparencia-modelo");

sharp.concurrency(1);
sharp.cache({ memory: 20, files: 0, items: 20 });
const MAX_ENVIO = 25 * 1024 * 1024;
const MAX_IMAGEM = 1024 * 1024;
const tamanhos = { logo: 640, fundo: 2560, esquerda: 2048, direita: 2048, nota: 256, divisor: 1600, capa: 1200 };

function invalido(mensagem) {
  return Object.assign(new Error(mensagem), { code: "22023" });
}

async function prepararImagem(bytes, slot, nome = "Minha imagem", id = crypto.randomUUID()) {
  if (!Modelo.regras[slot]) throw invalido("Escolha um espaço de imagem válido.");
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw invalido("Escolha uma imagem para enviar.");
  if (bytes.length > MAX_ENVIO) throw invalido("Escolha uma imagem de até 25 MB. Ela será ajustada automaticamente.");
  try {
    const entrada = sharp(bytes, { limitInputPixels: 60000000, animated: false });
    const meta = await entrada.metadata();
    if (!meta.width || !meta.height) throw new Error("Imagem sem dimensões.");
    // As dimensões indicadas na tela são sugestões. Não há corte ou exigência de transparência.
    let lado = tamanhos[slot];
    let resultado;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      resultado = await sharp(bytes, { limitInputPixels: 60000000, animated: false })
        .rotate().resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
        .webp({ quality: tentativa ? 72 : 84, effort: 3 }).toBuffer({ resolveWithObject: true });
      if (resultado.data.length <= MAX_IMAGEM) break;
      lado = Math.max(128, Math.floor(lado * .75));
    }
    if (resultado.data.length > MAX_IMAGEM) throw new Error("Não foi possível reduzir a imagem.");
    return {
      id, nome: String(nome).slice(0, 150), width: resultado.info.width, height: resultado.info.height,
      url: "data:image/webp;base64," + resultado.data.toString("base64"),
    };
  } catch {
    throw invalido("Não foi possível abrir esta imagem. Tente PNG, JPG, WebP, GIF, AVIF ou outra imagem válida.");
  }
}

function validarPacote(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.arquivos) || doc.arquivos.length > 7) throw invalido("Modelo de personalização inválido.");
  let estado;
  try { estado = Modelo.normalizar(doc.estado); } catch (e) { throw invalido(e.message); }
  if (Math.min(Modelo.contraste(estado.tinta, estado.papel), Modelo.contraste(estado.tinta, estado.superficie)) < 4.5) throw invalido("Ajuste o contraste das cores para manter o texto legível.");
  const usados = new Map();
  for (const slot of Object.keys(Modelo.regras)) if (estado[slot] === "custom") usados.set(estado.uploads[slot], slot);
  const arquivos = [];
  for (const [id, slot] of usados) {
    const a = doc.arquivos.find(item => item && item.id === id);
    const m = /^data:image\/(png|jpeg|webp|gif|avif|tiff|bmp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(a?.url || "");
    if (!m || m[2].length > MAX_ENVIO * 1.4) throw invalido("Falta uma imagem válida para " + Modelo.regras[slot].nome + ".");
    arquivos.push({ id, slot, nome: String(a.nome || "Minha imagem").slice(0, 150), bytes: Buffer.from(m[2], "base64") });
  }
  return { estado, arquivos };
}

async function prepararPacote(doc, atuais = []) {
  const validado = validarPacote(doc);
  const arquivos = [];
  for (const a of validado.arquivos) {
    const enviado = doc.arquivos.find(item => item.id === a.id);
    const anterior = atuais.find(item => item.id === a.id && item.url === enviado.url);
    // Uma alteração de nome/cor não recomprime as imagens já salvas.
    arquivos.push(anterior || await prepararImagem(a.bytes, a.slot, a.nome, a.id));
  }
  return { estado: validado.estado, arquivos };
}

async function obterAparencia(client, biblioteca) {
  const { data, error } = await client.rpc("obter_aparencia", { biblioteca_destino: biblioteca.id });
  if (error) throw error;
  return data || { estado: Modelo.legado(biblioteca), arquivos: [] };
}

module.exports = { prepararImagem, prepararPacote, validarPacote, obterAparencia, Modelo };
