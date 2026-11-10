// Cada instância usa o JWT do usuário e uma biblioteca. A RLS no Supabase é
// uma segunda barreira: nunca é necessário usar uma chave service_role.
const STATUS = ["nao_lido", "lendo", "lido"];
const CAMPOS = [
  "titulo", "autor", "editora", "genero", "localizacao", "ano", "idioma",
  "paginas", "isbn", "capa_url", "descricao", "tags", "emprestado", "emprestado_para",
];

function normalizar(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function executar(consulta) {
  const { data, error, count } = await consulta;
  if (error) {
    const erro = new Error(error.message || "Não foi possível acessar os dados.");
    erro.code = error.code;
    throw erro;
  }
  return { data, count };
}

function formatar(livro) {
  if (!livro) return null;
  const { busca, biblioteca_id, ...dados } = livro;
  return dados;
}

function registro(dados) {
  const resultado = Object.fromEntries(CAMPOS.filter(c => dados[c] !== undefined).map(c => [c, dados[c]]));
  if (resultado.emprestado === false) resultado.emprestado_para = "";
  return resultado;
}

function criarRepositorio(client, bibliotecaId) {
  if (!client || !bibliotecaId) throw new Error("Selecione uma biblioteca autenticada.");
  const tabela = () => client.from("livros");
  const escopo = consulta => consulta.eq("biblioteca_id", bibliotecaId);

  async function buscarPorId(id) {
    const { data } = await executar(escopo(tabela().select("*")).eq("id", id).maybeSingle());
    return formatar(data);
  }

  async function listar(opcoes = {}) {
    const pagina = Math.max(1, Math.trunc(Number(opcoes.pagina) || 1));
    const limite = Math.min(100, Math.max(1, Math.trunc(Number(opcoes.limite) || 50)));
    let consulta = escopo(tabela().select("*", { count: "exact" }));
    for (const termo of normalizar(opcoes.q).split(/\s+/).filter(Boolean)) {
      consulta = consulta.ilike("busca", `%${termo.replace(/[\\%_]/g, "\\$&")}%`);
    }
    if (STATUS.includes(opcoes.status)) consulta = consulta.eq("status", opcoes.status);
    if (opcoes.genero) consulta = consulta.eq("genero", opcoes.genero);
    if (opcoes.favorito) consulta = consulta.eq("favorito", true);
    if (opcoes.emprestado) consulta = consulta.eq("emprestado", true);
    if (opcoes.semAvaliacao) consulta = consulta.eq("avaliacao", 0);
    else if (opcoes.avaliacaoExata != null) consulta = consulta.eq("avaliacao", opcoes.avaliacaoExata);
    if (opcoes.paginasMin != null) consulta = consulta.gte("paginas", opcoes.paginasMin);
    if (opcoes.paginasMax != null) consulta = consulta.lte("paginas", opcoes.paginasMax);
    if (opcoes.dias != null) consulta = consulta.gte("criado_em", new Date(Date.now() - Number(opcoes.dias) * 86400000).toISOString());
    switch (opcoes.ordenar) {
      case "autor": consulta = consulta.order("autor").order("titulo"); break;
      case "paginas": consulta = consulta.order("paginas", { ascending: false, nullsFirst: false }); break;
      case "avaliacao": consulta = consulta.order("avaliacao", { ascending: false }).order("titulo"); break;
      case "recentes": consulta = consulta.order("criado_em", { ascending: false }); break;
      default: consulta = consulta.order("titulo");
    }
    const inicio = (pagina - 1) * limite;
    const { data, count } = await executar(consulta.order("id").range(inicio, inicio + limite - 1));
    return { total: count ?? 0, itens: (data || []).map(formatar) };
  }

  async function filtros() {
    const { data } = await executar(client.rpc("resumo_biblioteca", { biblioteca_destino: bibliotecaId }));
    return data;
  }

  async function buscarVarios(ids) {
    const numeros = [...new Set(ids.map(Number).filter(Number.isSafeInteger))].slice(0, 500);
    if (!numeros.length) return [];
    const { data } = await executar(escopo(tabela().select("*")).in("id", numeros).order("titulo").order("id"));
    return (data || []).map(formatar);
  }

  async function relacionados(livro, limite = 6) {
    const consultar = async (campo, valor) => {
      if (!valor) return [];
      const { data } = await executar(escopo(tabela().select("*")).neq("id", livro.id).eq(campo, valor).order("titulo").order("id").limit(limite));
      return (data || []).map(formatar);
    };
    const [autores, generos] = await Promise.all([consultar("autor", livro.autor), consultar("genero", livro.genero)]);
    return [...new Map([...autores, ...generos].map(l => [l.id, l])).values()].slice(0, limite);
  }

  async function inserir(dados) {
    const { data } = await executar(tabela().insert({ ...registro(dados), biblioteca_id: bibliotecaId }).select("*").single());
    return formatar(data);
  }

  async function atualizar(id, dados) {
    const { data } = await executar(escopo(tabela().update(registro(dados))).eq("id", id).select("*").maybeSingle());
    return formatar(data);
  }

  async function atualizarEstado(id, campos) {
    const permitidos = ["status", "favorito", "avaliacao", "emprestado", "emprestado_para"];
    const dados = Object.fromEntries(permitidos.filter(c => campos[c] !== undefined).map(c => [c, campos[c]]));
    if (dados.emprestado === false) dados.emprestado_para = "";
    if (!Object.keys(dados).length) return buscarPorId(id);
    const { data } = await executar(escopo(tabela().update(dados)).eq("id", id).select("*").maybeSingle());
    return formatar(data);
  }

  async function excluir(id) {
    const { data } = await executar(escopo(tabela().delete()).eq("id", id).select("id"));
    return Boolean(data?.length);
  }

  async function backup() {
    // Um único snapshot evita perdas/duplicações se o acervo mudar durante o download.
    // O JSON agregado não sofre o limite de 1.000 linhas da API do Supabase.
    const { data } = await executar(client.rpc("backup_biblioteca", { biblioteca_destino: bibliotecaId }));
    return (data || []).map(formatar);
  }

  async function restaurar(livros, personalizacao) {
    const { data } = await executar(client.rpc("restaurar_biblioteca", {
      biblioteca_destino: bibliotecaId,
      dados: { livros, personalizacao: personalizacao ?? null },
    }));
    return data;
  }

  return { listar, filtros, buscarPorId, relacionados, inserir, atualizar, atualizarEstado, excluir, buscarVarios, backup, restaurar };
}

module.exports = { STATUS, criarRepositorio };
