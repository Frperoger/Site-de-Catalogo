-- Execute este arquivo inteiro no SQL Editor de um projeto Supabase vazio.
-- Credenciais de service_role não são utilizadas pela aplicação.
begin;

create schema if not exists app_privado;
revoke all on schema app_privado from public, anon;
grant usage on schema app_privado to authenticated;

create table if not exists public.bibliotecas (
  id uuid primary key default gen_random_uuid(),
  proprietario_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null default 'Minha biblioteca' check (char_length(trim(nome)) between 1 and 100),
  subtitulo text not null default 'Histórias que fazem parte de mim.' check (char_length(subtitulo) <= 160),
  cor_primaria text not null default '#b58e8d' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  tema text not null default 'floral' check (tema in ('floral', 'verde', 'azul')),
  criado_em timestamptz not null default now()
);

create table if not exists public.membros_biblioteca (
  biblioteca_id uuid not null references public.bibliotecas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('admin', 'visualizador')),
  criado_em timestamptz not null default now(),
  primary key (biblioteca_id, user_id)
);
create index if not exists idx_membros_usuario on public.membros_biblioteca(user_id);

create table if not exists public.livros (
  id bigint generated always as identity primary key,
  biblioteca_id uuid not null references public.bibliotecas(id) on delete cascade,
  titulo text not null check (char_length(trim(titulo)) between 1 and 300),
  autor text not null default '' check (char_length(autor) <= 300),
  editora text not null default '' check (char_length(editora) <= 300),
  genero text not null default '' check (char_length(genero) <= 100),
  localizacao text not null default '' check (char_length(localizacao) <= 150),
  ano integer check (ano between 1000 and 2100),
  idioma text not null default 'Português' check (char_length(idioma) <= 50),
  paginas integer check (paginas between 1 and 100000),
  isbn text not null default '' check (isbn = '' or isbn ~ '^([0-9Xx]{10}|[0-9Xx]{13})$'),
  capa_url text not null default '' check (capa_url = '' or (char_length(capa_url) <= 500 and capa_url ~* '^https?://')),
  descricao text not null default '' check (char_length(descricao) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  status text not null default 'nao_lido' check (status in ('nao_lido', 'lendo', 'lido')),
  favorito boolean not null default false,
  avaliacao integer not null default 0 check (avaliacao between 0 and 5),
  emprestado boolean not null default false,
  emprestado_para text not null default '' check (char_length(emprestado_para) <= 100),
  busca text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_livros_biblioteca_titulo on public.livros(biblioteca_id, titulo, id);
create index if not exists idx_livros_biblioteca_status on public.livros(biblioteca_id, status);
create index if not exists idx_livros_biblioteca_genero on public.livros(biblioteca_id, genero);

-- SECURITY DEFINER restrito evita políticas recursivas na tabela de membros.
-- A identidade sempre vem de auth.uid(), nunca de metadados editáveis do usuário.
create or replace function app_privado.biblioteca_permitida(destino uuid, administrar boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.bibliotecas b where b.id = destino and b.proprietario_id = auth.uid())
    or exists (
      select 1 from public.membros_biblioteca m
      where m.biblioteca_id = destino and m.user_id = auth.uid()
        and (not administrar or m.papel = 'admin')
    )
  );
$$;
revoke all on function app_privado.biblioteca_permitida(uuid, boolean) from public, anon;
grant execute on function app_privado.biblioteca_permitida(uuid, boolean) to authenticated;

alter table public.bibliotecas enable row level security;
alter table public.membros_biblioteca enable row level security;
alter table public.livros enable row level security;

drop policy if exists bibliotecas_leitura on public.bibliotecas;
create policy bibliotecas_leitura on public.bibliotecas for select to authenticated
  using (app_privado.biblioteca_permitida(id));
drop policy if exists bibliotecas_configuracao on public.bibliotecas;
create policy bibliotecas_configuracao on public.bibliotecas for update to authenticated
  using (app_privado.biblioteca_permitida(id, true))
  with check (app_privado.biblioteca_permitida(id, true));
drop policy if exists membros_leitura on public.membros_biblioteca;
create policy membros_leitura on public.membros_biblioteca for select to authenticated
  using (user_id = auth.uid() or app_privado.biblioteca_permitida(biblioteca_id, true));
drop policy if exists livros_leitura on public.livros;
create policy livros_leitura on public.livros for select to authenticated
  using (app_privado.biblioteca_permitida(biblioteca_id));
drop policy if exists livros_insercao on public.livros;
create policy livros_insercao on public.livros for insert to authenticated
  with check (app_privado.biblioteca_permitida(biblioteca_id, true));
drop policy if exists livros_edicao on public.livros;
create policy livros_edicao on public.livros for update to authenticated
  using (app_privado.biblioteca_permitida(biblioteca_id, true))
  with check (app_privado.biblioteca_permitida(biblioteca_id, true));
drop policy if exists livros_exclusao on public.livros;
create policy livros_exclusao on public.livros for delete to authenticated
  using (app_privado.biblioteca_permitida(biblioteca_id, true));

revoke all on public.bibliotecas, public.membros_biblioteca, public.livros from anon, authenticated;
grant select on public.bibliotecas, public.membros_biblioteca, public.livros to authenticated;
-- Não é possível alterar proprietário ou criar um membro admin pela API pública.
grant update (nome, subtitulo, cor_primaria, tema) on public.bibliotecas to authenticated;
grant insert, update, delete on public.livros to authenticated;
grant usage, select on sequence public.livros_id_seq to authenticated;

create or replace function app_privado.preparar_livro()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.tags) t where t is null or char_length(t) > 30) then
    raise exception 'Cada etiqueta deve ter até 30 caracteres.' using errcode = '22023';
  end if;
  if not new.emprestado then new.emprestado_para := ''; end if;
  new.busca := lower(regexp_replace(normalize(
    concat_ws(' ', new.titulo, new.autor, new.editora, new.genero,
      new.localizacao, new.isbn, new.descricao, new.emprestado_para, array_to_string(new.tags, ' ')), NFD),
    U&'[\0300-\036f]', '', 'g'));
  new.atualizado_em := now();
  return new;
end;
$$;
revoke all on function app_privado.preparar_livro() from public, anon, authenticated;
drop trigger if exists preparar_livro on public.livros;
create trigger preparar_livro before insert or update on public.livros
  for each row execute function app_privado.preparar_livro();

create or replace function app_privado.criar_biblioteca_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare biblioteca_nova uuid;
begin
  insert into public.bibliotecas(proprietario_id) values (new.id) returning id into biblioteca_nova;
  insert into public.membros_biblioteca(biblioteca_id, user_id, papel) values (biblioteca_nova, new.id, 'admin');
  return new;
end;
$$;
revoke all on function app_privado.criar_biblioteca_usuario() from public, anon, authenticated;
drop trigger if exists biblioteca_ao_criar_usuario on auth.users;
create trigger biblioteca_ao_criar_usuario after insert on auth.users
  for each row execute function app_privado.criar_biblioteca_usuario();

-- Permite instalar o projeto depois que usuários já foram cadastrados.
insert into public.bibliotecas(proprietario_id)
  select u.id from auth.users u on conflict (proprietario_id) do nothing;
insert into public.membros_biblioteca(biblioteca_id, user_id, papel)
  select id, proprietario_id, 'admin' from public.bibliotecas
  on conflict (biblioteca_id, user_id) do nothing;

create or replace function public.compartilhar_biblioteca(biblioteca_destino uuid, email_destino text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare usuario uuid;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem compartilhar esta biblioteca.' using errcode = '42501';
  end if;
  if char_length(trim(email_destino)) not between 3 and 254 then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  select id into usuario from auth.users where lower(email) = lower(trim(email_destino));
  if usuario is null then
    raise exception 'Peça a esta pessoa para criar e confirmar a conta antes de compartilhar.' using errcode = '22023';
  end if;
  -- DO NOTHING preserva o papel do dono e torna a operação idempotente.
  insert into public.membros_biblioteca(biblioteca_id, user_id, papel)
    values (biblioteca_destino, usuario, 'visualizador') on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revogar_acesso(biblioteca_destino uuid, usuario_destino uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem revogar acessos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.bibliotecas where id = biblioteca_destino and proprietario_id = usuario_destino) then
    raise exception 'O acesso do proprietário não pode ser removido.' using errcode = '22023';
  end if;
  delete from public.membros_biblioteca where biblioteca_id = biblioteca_destino and user_id = usuario_destino;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.membros_da_biblioteca(biblioteca_destino uuid)
returns table(user_id uuid, email text, papel text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem consultar os acessos.' using errcode = '42501';
  end if;
  return query select m.user_id, u.email::text, m.papel from public.membros_biblioteca m
    join auth.users u on u.id = m.user_id
    where m.biblioteca_id = biblioteca_destino order by m.papel, u.email;
end;
$$;

create or replace function public.resumo_biblioteca(biblioteca_destino uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare resumo jsonb; generos jsonb;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino) then
    raise exception 'Biblioteca não encontrada.' using errcode = '42501';
  end if;
  select jsonb_build_object('total', count(*), 'lidos', count(*) filter (where status = 'lido'),
    'lendo', count(*) filter (where status = 'lendo'), 'favoritos', count(*) filter (where favorito),
    'emprestados', count(*) filter (where emprestado)) into resumo
    from public.livros where biblioteca_id = biblioteca_destino;
  select coalesce(jsonb_agg(jsonb_build_object('nome', g.genero, 'total', g.total) order by g.genero), '[]'::jsonb)
    into generos from (select genero, count(*) total from public.livros
      where biblioteca_id = biblioteca_destino and genero <> '' group by genero) g;
  return resumo || jsonb_build_object('generos', generos);
end;
$$;

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
  return jsonb_build_object('ok', true, 'total', quantidade);
end;
$$;

create or replace function public.backup_biblioteca(biblioteca_destino uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare livros jsonb;
begin
  if not app_privado.biblioteca_permitida(biblioteca_destino, true) then
    raise exception 'Apenas administradores podem baixar o backup.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) into livros
    from public.livros l where l.biblioteca_id = biblioteca_destino;
  return livros;
end;
$$;

revoke all on function public.compartilhar_biblioteca(uuid, text) from public, anon;
revoke all on function public.revogar_acesso(uuid, uuid) from public, anon;
revoke all on function public.membros_da_biblioteca(uuid) from public, anon;
revoke all on function public.resumo_biblioteca(uuid) from public, anon;
revoke all on function public.restaurar_biblioteca(uuid, jsonb) from public, anon;
revoke all on function public.backup_biblioteca(uuid) from public, anon;
grant execute on function public.compartilhar_biblioteca(uuid, text) to authenticated;
grant execute on function public.revogar_acesso(uuid, uuid) to authenticated;
grant execute on function public.membros_da_biblioteca(uuid) to authenticated;
grant execute on function public.resumo_biblioteca(uuid) to authenticated;
grant execute on function public.restaurar_biblioteca(uuid, jsonb) to authenticated;
grant execute on function public.backup_biblioteca(uuid) to authenticated;

commit;
