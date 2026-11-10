-- Atualização da v2 para a v3. Execute uma vez no SQL Editor do projeto existente.
-- Não apaga livros, contas ou os acessos já concedidos.
begin;

create table if not exists public.personalizacoes_biblioteca (
  biblioteca_id uuid primary key references public.bibliotecas(id) on delete cascade,
  estado jsonb not null check (jsonb_typeof(estado) = 'object'),
  arquivos jsonb not null default '[]' check (jsonb_typeof(arquivos) = 'array' and jsonb_array_length(arquivos) <= 7),
  atualizado_em timestamptz not null default now()
);
alter table public.personalizacoes_biblioteca enable row level security;
revoke all on public.personalizacoes_biblioteca from anon, authenticated;
grant select, insert, update, delete on public.personalizacoes_biblioteca to authenticated;
drop policy if exists personalizacao_leitura on public.personalizacoes_biblioteca;
create policy personalizacao_leitura on public.personalizacoes_biblioteca for select to authenticated
  using (app_privado.biblioteca_permitida(biblioteca_id));
drop policy if exists personalizacao_edicao on public.personalizacoes_biblioteca;
create policy personalizacao_edicao on public.personalizacoes_biblioteca for all to authenticated
  using (app_privado.biblioteca_permitida(biblioteca_id, true))
  with check (app_privado.biblioteca_permitida(biblioteca_id, true));

create table if not exists public.convites_biblioteca (
  id uuid primary key default gen_random_uuid(),
  biblioteca_id uuid not null references public.bibliotecas(id) on delete cascade,
  chave_hash text not null unique check (chave_hash ~ '^[0-9a-f]{64}$'),
  mostrar_avaliacoes boolean not null default true,
  mostrar_localizacao boolean not null default false,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogado_em timestamptz
);
create index if not exists idx_convites_biblioteca on public.convites_biblioteca(biblioteca_id, criado_em desc);
alter table public.convites_biblioteca enable row level security;
-- Nem o hash do convite fica disponível pela API de tabelas.
revoke all on public.convites_biblioteca from public, anon, authenticated;

create or replace function public.obter_aparencia(biblioteca_destino uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino) then
    raise exception 'Biblioteca não encontrada.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('estado', p.estado, 'arquivos', p.arquivos)
    from public.personalizacoes_biblioteca p where p.biblioteca_id = biblioteca_destino);
end;
$$;

create or replace function public.salvar_aparencia(biblioteca_destino uuid, dados jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s jsonb;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem personalizar esta biblioteca.' using errcode = '42501';
  end if;
  s := dados->'estado';
  if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(dados->'arquivos') is distinct from 'array' then
    raise exception 'Modelo de personalização inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(dados->'arquivos') > 7 or octet_length(dados::text) > 11000000 then
    raise exception 'O modelo de personalização está muito grande.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(dados->'arquivos') a
    where jsonb_typeof(a) is distinct from 'object' or
      coalesce(a->>'url', '') !~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$' or
      char_length(a->>'url') > 1400000) then
    raise exception 'Uma imagem do modelo é inválida.' using errcode = '22023';
  end if;
  -- Nome, assinatura e a composição são gravados na mesma transação.
  perform 1 from public.bibliotecas where id = biblioteca_destino for update;
  update public.bibliotecas set nome = s->>'nome', subtitulo = coalesce(s->>'subtitulo', ''),
    cor_primaria = s->>'cor', tema = case s->>'modelo' when 'noturna' then 'azul' when 'classica' then 'verde' else 'floral' end
    where id = biblioteca_destino;
  insert into public.personalizacoes_biblioteca(biblioteca_id, estado, arquivos)
    values (biblioteca_destino, s, dados->'arquivos')
    on conflict (biblioteca_id) do update set estado = excluded.estado,
      arquivos = excluded.arquivos, atualizado_em = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.criar_convite(biblioteca_destino uuid, resumo_chave text, dias integer,
  mostrar_avaliacoes boolean default true, mostrar_localizacao boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare convite public.convites_biblioteca;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem criar convites.' using errcode = '42501';
  end if;
  if dias not in (1, 7, 30) or dias is null then
    raise exception 'Escolha a validade do convite.' using errcode = '22023';
  end if;
  insert into public.convites_biblioteca(biblioteca_id, chave_hash, mostrar_avaliacoes, mostrar_localizacao, expira_em)
    values (biblioteca_destino, resumo_chave, mostrar_avaliacoes, mostrar_localizacao, now() + make_interval(days => dias))
    returning * into convite;
  return jsonb_build_object('id', convite.id, 'expira', convite.expira_em,
    'opcoes', jsonb_build_object('avaliacoes', convite.mostrar_avaliacoes, 'localizacao', convite.mostrar_localizacao));
end;
$$;

create or replace function public.listar_convites(biblioteca_destino uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem consultar os convites.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select id, criado_em, expira_em, revogado_em, mostrar_avaliacoes, mostrar_localizacao
    from public.convites_biblioteca where biblioteca_id = biblioteca_destino
    order by criado_em desc, id limit 50) x);
end;
$$;

create or replace function public.revogar_convite(biblioteca_destino uuid, convite_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem revogar convites.' using errcode = '42501';
  end if;
  update public.convites_biblioteca set revogado_em = coalesce(revogado_em, now())
    where id = convite_id and biblioteca_id = biblioteca_destino;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app_privado.livro_visitante(l public.livros, notas boolean, local_fisico boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'titulo', l.titulo, 'autor', l.autor, 'editora', l.editora,
    'genero', l.genero, 'localizacao', case when local_fisico then l.localizacao else '' end,
    'ano', l.ano, 'idioma', l.idioma, 'paginas', l.paginas, 'isbn', l.isbn, 'capa_url', l.capa_url,
    'descricao', l.descricao, 'tags', l.tags, 'status', l.status, 'favorito', l.favorito,
    'avaliacao', case when notas then l.avaliacao else null end, 'emprestado', l.emprestado,
    'criado_em', l.criado_em, 'atualizado_em', l.atualizado_em);
$$;
revoke all on function app_privado.livro_visitante(public.livros, boolean, boolean) from public, anon, authenticated;

-- O único ponto de leitura anônima: a biblioteca sempre vem do convite válido.
-- Não há grants anônimos para as tabelas, nem aceitação de biblioteca_id do visitante.
create or replace function public.consultar_visita(chave text, acao text default 'config', opcoes jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.convites_biblioteca; b public.bibliotecas; l public.livros;
  resultado jsonb; relacionados jsonb; pesquisa text; ordenacao text;
  pagina_n integer; limite_n integer; dias_n integer; nota_n integer;
begin
  if chave is null or chave !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Convite encerrado.' using errcode = 'P0002';
  end if;
  select * into c from public.convites_biblioteca
    where chave_hash = encode(sha256(convert_to(chave, 'UTF8')), 'hex')
      and revogado_em is null and expira_em > now();
  if not found then raise exception 'Convite encerrado.' using errcode = 'P0002'; end if;
  if acao = 'config' then
    select * into b from public.bibliotecas where id = c.biblioteca_id;
    return jsonb_build_object('biblioteca', jsonb_build_object('id', b.id, 'nome', b.nome,
      'subtitulo', b.subtitulo, 'cor_primaria', b.cor_primaria, 'tema', b.tema, 'papel', 'visitante'),
      'aparencia', (select jsonb_build_object('estado', p.estado, 'arquivos', p.arquivos)
        from public.personalizacoes_biblioteca p where p.biblioteca_id = c.biblioteca_id),
      'opcoes', jsonb_build_object('avaliacoes', c.mostrar_avaliacoes, 'localizacao', c.mostrar_localizacao),
      'expira', c.expira_em);
  elsif acao = 'filtros' then
    select jsonb_build_object('total', count(*), 'lidos', count(*) filter (where status = 'lido'),
      'lendo', count(*) filter (where status = 'lendo'), 'favoritos', count(*) filter (where favorito),
      'emprestados', count(*) filter (where emprestado)) into resultado
      from public.livros where biblioteca_id = c.biblioteca_id;
    return resultado || jsonb_build_object('generos', (select coalesce(jsonb_agg(g order by g.nome), '[]'::jsonb)
      from (select genero as nome, count(*) as total from public.livros
        where biblioteca_id = c.biblioteca_id and genero <> '' group by genero) g));
  elsif acao = 'detalhe' then
    select * into l from public.livros where biblioteca_id = c.biblioteca_id and id = (opcoes->>'id')::bigint;
    if not found then return null; end if;
    select coalesce(jsonb_agg(app_privado.livro_visitante(r, c.mostrar_avaliacoes, c.mostrar_localizacao)), '[]'::jsonb)
      into relacionados from (select x.* from public.livros x where x.biblioteca_id = c.biblioteca_id
        and x.id <> l.id and ((l.autor <> '' and x.autor = l.autor) or (l.genero <> '' and x.genero = l.genero))
        order by x.titulo, x.id limit 6) r;
    return app_privado.livro_visitante(l, c.mostrar_avaliacoes, c.mostrar_localizacao)
      || jsonb_build_object('relacionados', relacionados);
  elsif acao <> 'itens' then
    raise exception 'Esta operação não está disponível para visitantes.' using errcode = '42501';
  end if;
  pagina_n := least(1000000, greatest(1, coalesce((opcoes->>'pagina')::integer, 1)));
  limite_n := least(100, greatest(1, coalesce((opcoes->>'limite')::integer, 50)));
  dias_n := case when opcoes->>'cadastro' in ('7','30','365') then (opcoes->>'cadastro')::integer else null end;
  nota_n := case when c.mostrar_avaliacoes and opcoes->>'avaliacao' ~ '^[1-5]$' then (opcoes->>'avaliacao')::integer else null end;
  ordenacao := coalesce(opcoes->>'ordenar', 'titulo');
  pesquisa := lower(regexp_replace(normalize(left(trim(coalesce(opcoes->>'q', '')),300), NFD), U&'[\0300-\036f]', '', 'g'));
  with filtrados as (
    select x as livro from public.livros x where x.biblioteca_id = c.biblioteca_id
      and (coalesce(opcoes->>'status','') = '' or x.status = opcoes->>'status')
      and (coalesce(opcoes->>'genero','') = '' or x.genero = opcoes->>'genero')
      and (coalesce(opcoes->>'favorito','') <> '1' or x.favorito)
      and (coalesce(opcoes->>'emprestado','') <> '1' or x.emprestado)
      and (nota_n is null or x.avaliacao = nota_n)
      and (not c.mostrar_avaliacoes or coalesce(opcoes->>'avaliacao','') <> 'sem' or x.avaliacao = 0)
      and (coalesce(opcoes->>'faixa','') <> 'ate200' or x.paginas <= 200)
      and (coalesce(opcoes->>'faixa','') <> 'de200a400' or x.paginas between 201 and 400)
      and (coalesce(opcoes->>'faixa','') <> 'mais400' or x.paginas > 400)
      and (dias_n is null or x.criado_em >= now() - make_interval(days => dias_n))
      -- Não pesquisa nomes de quem pegou emprestado ou campos que o dono ocultou.
      and (pesquisa = '' or strpos(lower(regexp_replace(normalize(concat_ws(' ', x.titulo, x.autor,
        x.editora, x.genero, x.descricao, x.isbn, array_to_string(x.tags,' '),
        case when c.mostrar_localizacao then x.localizacao else '' end), NFD), U&'[\0300-\036f]', '', 'g')), pesquisa) > 0)
  ), recorte as (
    select f.livro from filtrados f order by
      case when ordenacao = 'autor' then lower((f.livro).autor) end asc,
      case when ordenacao = 'recentes' then (f.livro).criado_em end desc,
      case when ordenacao = 'avaliacao' and c.mostrar_avaliacoes then (f.livro).avaliacao end desc,
      case when ordenacao = 'paginas' then (f.livro).paginas end desc nulls last,
      lower((f.livro).titulo), (f.livro).id
      limit limite_n offset (pagina_n - 1) * limite_n
  ) select jsonb_build_object('itens', (select coalesce(jsonb_agg(app_privado.livro_visitante(
      recorte.livro, c.mostrar_avaliacoes, c.mostrar_localizacao)), '[]'::jsonb) from recorte),
      'total', (select count(*) from filtrados), 'pagina', pagina_n, 'limite', limite_n) into resultado;
  return resultado;
end;
$$;

revoke all on function public.obter_aparencia(uuid) from public, anon;
revoke all on function public.salvar_aparencia(uuid, jsonb) from public, anon;
revoke all on function public.criar_convite(uuid, text, integer, boolean, boolean) from public, anon;
revoke all on function public.listar_convites(uuid) from public, anon;
revoke all on function public.revogar_convite(uuid, uuid) from public, anon;
revoke all on function public.consultar_visita(text, text, jsonb) from public;
grant execute on function public.obter_aparencia(uuid), public.salvar_aparencia(uuid, jsonb),
  public.criar_convite(uuid, text, integer, boolean, boolean), public.listar_convites(uuid),
  public.revogar_convite(uuid, uuid) to authenticated;
grant execute on function public.consultar_visita(text, text, jsonb) to anon, authenticated;

create or replace function public.restaurar_biblioteca(biblioteca_destino uuid, dados jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare livro jsonb; config jsonb; quantidade integer;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem restaurar esta biblioteca.' using errcode = '42501';
  end if;
  if jsonb_typeof(dados) is distinct from 'object' or jsonb_typeof(dados->'livros') is distinct from 'array' then
    raise exception 'O backup precisa conter uma lista de livros.' using errcode = '22023';
  end if;
  quantidade := jsonb_array_length(dados->'livros');
  if quantidade > 10000 then raise exception 'O backup excede 10.000 livros.' using errcode = '22023'; end if;
  config := dados->'personalizacao';
  if config is not null and config <> 'null'::jsonb and jsonb_typeof(config) <> 'object' then
    raise exception 'Personalização inválida.' using errcode = '22023';
  end if;
  -- Toda a função é uma transação: um item inválido também desfaz a exclusão.
  perform 1 from public.bibliotecas where id = biblioteca_destino for update;
  delete from public.livros where biblioteca_id = biblioteca_destino;
  for livro in select value from jsonb_array_elements(dados->'livros') loop
    if jsonb_typeof(livro) <> 'object' or
       (livro ? 'tags' and jsonb_typeof(livro->'tags') <> 'array') then
      raise exception 'Livro ou etiquetas inválidos no backup.' using errcode = '22023';
    end if;
    insert into public.livros(biblioteca_id, titulo, autor, editora, genero, localizacao, ano,
      idioma, paginas, isbn, capa_url, descricao, tags, status, favorito, avaliacao,
      emprestado, emprestado_para, criado_em)
    values (biblioteca_destino, trim(coalesce(livro->>'titulo', '')),
      coalesce(livro->>'autor', ''), coalesce(livro->>'editora', ''),
      coalesce(livro->>'genero', ''), coalesce(livro->>'localizacao', ''),
      nullif(livro->>'ano', '')::integer, coalesce(livro->>'idioma', 'Português'),
      nullif(livro->>'paginas', '')::integer, coalesce(livro->>'isbn', ''),
      coalesce(livro->>'capa_url', ''), coalesce(livro->>'descricao', ''),
      array(select jsonb_array_elements_text(coalesce(livro->'tags', '[]'::jsonb))),
      coalesce(livro->>'status', 'nao_lido'), coalesce((livro->>'favorito')::boolean, false),
      coalesce((livro->>'avaliacao')::integer, 0), coalesce((livro->>'emprestado')::boolean, false),
      coalesce(livro->>'emprestado_para', ''), coalesce(nullif(livro->>'criado_em', '')::timestamptz, now()));
  end loop;
  if config is not null and config <> 'null'::jsonb then
    update public.bibliotecas set nome = coalesce(config->>'nome', nome),
      subtitulo = coalesce(config->>'subtitulo', subtitulo),
      cor_primaria = coalesce(config->>'cor_primaria', cor_primaria), tema = coalesce(config->>'tema', tema)
      where id = biblioteca_destino;
  end if;
  if config is not null and config <> 'null'::jsonb then
    if config ? 'aparencia' then
      perform public.salvar_aparencia(biblioteca_destino, config->'aparencia');
    else
      delete from public.personalizacoes_biblioteca where biblioteca_id = biblioteca_destino;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'total', quantidade);
end;
$$;
revoke all on function public.restaurar_biblioteca(uuid, jsonb) from public, anon;
grant execute on function public.restaurar_biblioteca(uuid, jsonb) to authenticated;


commit;
