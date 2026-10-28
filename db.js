const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "acervo.db"));
db.pragma("journal_mode = WAL");

const STATUS = ["nao_lido", "lendo", "lido"];

const ORDENACOES = {
  titulo: "titulo COLLATE NOCASE",
  autor: "autor COLLATE NOCASE, titulo COLLATE NOCASE",
  paginas: "paginas DESC",
  avaliacao: "avaliacao DESC, titulo COLLATE NOCASE",
  recentes: "id DESC",
};

const CAMPOS_TEXTO = [
  "titulo", "autor", "editora", "genero", "localizacao", "idioma",
  "isbn", "capa_url", "descricao", "emprestado_para",
];
const CAMPOS_NUMERO = ["ano", "paginas"];

db.exec(`
  CREATE TABLE IF NOT EXISTS livros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    autor TEXT NOT NULL DEFAULT '',
    editora TEXT NOT NULL DEFAULT '',
    genero TEXT NOT NULL DEFAULT '',
    localizacao TEXT NOT NULL DEFAULT '',
    ano INTEGER,
    idioma TEXT NOT NULL DEFAULT 'Português',
    paginas INTEGER,
    isbn TEXT NOT NULL DEFAULT '',
    capa_url TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'nao_lido',
    favorito INTEGER NOT NULL DEFAULT 0,
    avaliacao INTEGER NOT NULL DEFAULT 0,
    emprestado INTEGER NOT NULL DEFAULT 0,
    emprestado_para TEXT NOT NULL DEFAULT '',
    busca TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// Migração: bancos criados por versões anteriores recebem as colunas que faltam.
// As colunas antigas (tipo, categoria, equipamento), se existirem, são ignoradas.
function migrar() {
  const existentes = new Set(db.prepare("PRAGMA table_info(livros)").all().map(c => c.name));
  const novas = {
    localizacao: "TEXT NOT NULL DEFAULT ''",
    emprestado: "INTEGER NOT NULL DEFAULT 0",
    emprestado_para: "TEXT NOT NULL DEFAULT ''",
  };
  Object.entries(novas).forEach(([nome, definicao]) => {
    if (!existentes.has(nome)) db.exec(`ALTER TABLE livros ADD COLUMN ${nome} ${definicao}`);
  });
}

migrar();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_livros_status ON livros(status);
  CREATE INDEX IF NOT EXISTS idx_livros_genero ON livros(genero);
  CREATE INDEX IF NOT EXISTS idx_livros_autor ON livros(autor);
  CREATE INDEX IF NOT EXISTS idx_livros_titulo ON livros(titulo COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_livros_emprestado ON livros(emprestado);
`);

// Remove acentos e caixa para que "usinagem" encontre "Usinagem"
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function montarBusca(d) {
  return normalizar(
    [d.titulo, d.autor, d.editora, d.genero, d.localizacao, d.isbn, d.descricao, ...d.tags].join(" ")
  );
}

function formatar(row) {
  if (!row) return null;
  const { busca, tags, favorito, emprestado, ...resto } = row;
  return {
    ...resto,
    tags: JSON.parse(tags),
    favorito: favorito === 1,
    emprestado: emprestado === 1,
  };
}

function listar({
  q = "", status = "", genero = "", favorito = false, emprestado = false,
  ordenar = "titulo", pagina = 1, limite = 50,
  paginasMin = null, paginasMax = null, dias = null,
}) {
  const condicoes = [];
  const params = {};

  normalizar(q)
    .split(/\s+/)
    .filter(Boolean)
    .forEach((termo, i) => {
      condicoes.push(`busca LIKE @t${i}`);
      params[`t${i}`] = `%${termo}%`;
    });

  if (STATUS.includes(status)) {
    condicoes.push("status = @status");
    params.status = status;
  }
  if (genero) {
    condicoes.push("genero = @genero");
    params.genero = genero;
  }
  if (favorito) condicoes.push("favorito = 1");
  if (emprestado) condicoes.push("emprestado = 1");
  if (paginasMin !== null) {
    condicoes.push("paginas >= @pmin");
    params.pmin = paginasMin;
  }
  if (paginasMax !== null) {
    condicoes.push("paginas <= @pmax");
    params.pmax = paginasMax;
  }
  if (dias !== null) {
    condicoes.push("criado_em >= datetime('now', 'localtime', @janela)");
    params.janela = `-${dias} days`;
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const ordem = ORDENACOES[ordenar] ?? ORDENACOES.titulo;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM livros ${where}`).get(params).n;
  const itens = db
    .prepare(`SELECT * FROM livros ${where} ORDER BY ${ordem} LIMIT @limite OFFSET @offset`)
    .all({ ...params, limite, offset: (pagina - 1) * limite })
    .map(formatar);

  return { total, itens };
}

// Contagens globais (não afetadas pelos filtros) para métricas e pills
function filtros() {
  const contagem = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'lido' THEN 1 ELSE 0 END), 0) AS lidos,
      COALESCE(SUM(CASE WHEN status = 'lendo' THEN 1 ELSE 0 END), 0) AS lendo,
      COALESCE(SUM(CASE WHEN favorito = 1 THEN 1 ELSE 0 END), 0) AS favoritos,
      COALESCE(SUM(CASE WHEN emprestado = 1 THEN 1 ELSE 0 END), 0) AS emprestados
    FROM livros
  `).get();

  const generos = db.prepare(`
    SELECT genero AS nome, COUNT(*) AS total
    FROM livros
    WHERE genero <> ''
    GROUP BY genero
    ORDER BY genero COLLATE NOCASE
  `).all();

  return { ...contagem, generos };
}

function buscarPorId(id) {
  return formatar(db.prepare("SELECT * FROM livros WHERE id = ?").get(id));
}

function buscarVarios(ids) {
  const numeros = ids.map(Number).filter(Number.isInteger);
  if (!numeros.length) return [];
  const marcas = numeros.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM livros WHERE id IN (${marcas}) ORDER BY titulo COLLATE NOCASE`)
    .all(...numeros)
    .map(formatar);
}

// Mesmo autor primeiro, depois mesmo gênero
function relacionados(livro, limite = 6) {
  return db
    .prepare(`
      SELECT * FROM livros
      WHERE id <> @id
        AND ((@autor <> '' AND autor = @autor) OR (@genero <> '' AND genero = @genero))
      ORDER BY (autor = @autor) DESC, titulo COLLATE NOCASE
      LIMIT @limite
    `)
    .all({ id: livro.id, autor: livro.autor, genero: livro.genero, limite })
    .map(formatar);
}

function registro(d) {
  const tags = d.tags ?? [];
  const valores = {};
  CAMPOS_TEXTO.forEach(c => { valores[c] = d[c] ?? ""; });
  CAMPOS_NUMERO.forEach(c => { valores[c] = d[c] ?? null; });
  valores.emprestado = d.emprestado ? 1 : 0;
  if (!valores.emprestado) valores.emprestado_para = "";
  return {
    ...valores,
    tags: JSON.stringify(tags),
    busca: montarBusca({ ...valores, tags }),
  };
}

function inserir(d) {
  const r = registro(d);
  const colunas = Object.keys(r);
  const info = db
    .prepare(`INSERT INTO livros (${colunas.join(", ")}) VALUES (${colunas.map(c => "@" + c).join(", ")})`)
    .run(r);
  return buscarPorId(info.lastInsertRowid);
}

// Atualiza metadados e empréstimo. Status, favorito e avaliação ficam em atualizarEstado.
function atualizar(id, d) {
  const r = registro(d);
  const sets = Object.keys(r).map(c => `${c} = @${c}`).join(", ");
  db.prepare(`UPDATE livros SET ${sets}, atualizado_em = datetime('now','localtime') WHERE id = @id`)
    .run({ ...r, id });
  return buscarPorId(id);
}

function atualizarEstado(id, campos) {
  const sets = [];
  const params = { id };

  if (campos.status !== undefined) {
    sets.push("status = @status");
    params.status = campos.status;
  }
  if (campos.favorito !== undefined) {
    sets.push("favorito = @favorito");
    params.favorito = campos.favorito ? 1 : 0;
  }
  if (campos.avaliacao !== undefined) {
    sets.push("avaliacao = @avaliacao");
    params.avaliacao = campos.avaliacao;
  }
  if (campos.emprestado !== undefined) {
    sets.push("emprestado = @emprestado");
    params.emprestado = campos.emprestado ? 1 : 0;
    if (!campos.emprestado) sets.push("emprestado_para = ''");
  }
  if (campos.emprestado_para !== undefined && campos.emprestado !== false) {
    sets.push("emprestado_para = @emprestado_para");
    params.emprestado_para = campos.emprestado_para;
  }

  if (sets.length) {
    db.prepare(`UPDATE livros SET ${sets.join(", ")}, atualizado_em = datetime('now','localtime') WHERE id = @id`)
      .run(params);
  }
  return buscarPorId(id);
}

// Remove o livro definitivamente. Retorna true se algo foi apagado.
function excluir(id) {
  const info = db.prepare("DELETE FROM livros WHERE id = ?").run(id);
  return info.changes > 0;
}

// Dados iniciais, inseridos apenas se o banco estiver vazio
const EXEMPLOS = [
  {
    titulo: "Manual de Operação – Linha de Corte Longitudinal",
    autor: "GCR MAQ", editora: "GCR MAQ", localizacao: "Estante A, prateleira 1",
    ano: 2024, idioma: "Português", paginas: 60,
    descricao: "Procedimentos de partida, operação e parada da linha de corte longitudinal.",
    tags: ["operação", "segurança", "rolos"],
  },
  {
    titulo: "Manual de Manutenção – Linha de Corte Transversal",
    autor: "GCR MAQ", editora: "GCR MAQ", localizacao: "Estante A, prateleira 1",
    ano: 2024, idioma: "Português", paginas: 84,
    descricao: "Rotinas de lubrificação, inspeção e troca de lâminas.",
    tags: ["manutenção", "lubrificação", "lâminas"],
  },
  {
    titulo: "Fundamentos de Usinagem e Corte de Metais",
    genero: "Engenharia", autor: "Autor de exemplo", editora: "Editora de exemplo",
    localizacao: "Estante B, prateleira 3", ano: 2015, idioma: "Português", paginas: 320,
    descricao: "Conceitos básicos de usinagem e processos de corte.",
    tags: ["usinagem", "metalurgia"],
  },
  {
    titulo: "Guia de Segurança em Máquinas Industriais",
    genero: "Segurança", autor: "Autor de exemplo", editora: "Editora de exemplo",
    localizacao: "Estante B, prateleira 2", ano: 2019, idioma: "Português", paginas: 210,
    descricao: "Referência para proteções e procedimentos conforme a NR-12.",
    tags: ["NR-12", "segurança", "proteções"],
  },
];

function semearSeNecessario() {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM livros").get();
  if (n === 0) EXEMPLOS.forEach(item => inserir(item));
}

semearSeNecessario();

module.exports = {
  STATUS,
  listar,
  filtros,
  buscarPorId,
  buscarVarios,
  relacionados,
  inserir,
  atualizar,
  atualizarEstado,
  excluir,
};