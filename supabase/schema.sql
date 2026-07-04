-- ============================================================
--  Micro SaaS de Artes com IA — Schema inicial (Supabase/Postgres)
--  Rode no SQL Editor do painel do Supabase.
--  Seguro para reexecutar (idempotente onde possível).
-- ============================================================

-- ---------- Tabelas ----------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text unique not null,
  plano text default 'free',
  creditos_disponiveis integer default 10,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Migração para bancos já existentes (create table if not exists não altera colunas).
alter table public.users add column if not exists is_admin boolean default false;
alter table public.users alter column creditos_disponiveis set default 10;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  nome_projeto text,
  tipo_arte text,
  formato text,
  status text default 'rascunho',
  -- Transcrição da conversa guiada (agente conversacional) + briefing final
  -- resolvido. Guardado por auditoria/depuração — não é usado em queries.
  conversa jsonb,
  created_at timestamptz default now()
);

-- Migração para bancos já existentes (create table if not exists não adiciona colunas novas).
alter table public.projects add column if not exists conversa jsonb;

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  imagem_original_url text,
  imagem_gerada_url text,
  prompt_usado text,
  modelo_usado text,
  status text default 'gerada',
  created_at timestamptz default now()
);

create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  tipo text, -- 'consumo' | 'compra' | 'bonus'
  quantidade integer,
  motivo text,
  created_at timestamptz default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  nome text,
  categoria text,
  formato text,
  estilo text,
  prompt_base text,
  ativo boolean default true
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_images_user on public.images(user_id);
create index if not exists idx_images_project on public.images(project_id);
create index if not exists idx_credits_user on public.credits(user_id);

-- ---------- Provisionamento automático de usuário ----------
-- Cria a row em public.users sempre que alguém se cadastra no Auth,
-- já com 10 créditos de bônus.
--
-- NOME COM SUFIXO "_artes_ia": este projeto Supabase é compartilhado com
-- outro app (tabelas profiles/creations/chat_sessions), que já tem sua
-- própria trigger "on_auth_user_created" -> "handle_new_user()" na mesma
-- auth.users. Nomes únicos evitam substituir a trigger/função do outro app.

create or replace function public.handle_new_user_artes_ia()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, nome, creditos_disponiveis)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name'),
    10
  )
  on conflict (id) do nothing;

  insert into public.credits (user_id, tipo, quantidade, motivo)
  values (new.id, 'bonus', 10, 'Créditos de boas-vindas')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_artes_ia on auth.users;
create trigger on_auth_user_created_artes_ia
  after insert on auth.users
  for each row execute function public.handle_new_user_artes_ia();

-- ---------- Débito atômico de crédito ----------
-- Decrementa 1 crédito somente se houver saldo. Retorna o saldo novo,
-- ou -1 se não havia saldo. Evita corrida entre gerações simultâneas.
-- Admin (is_admin = true) tem créditos ilimitados: nunca debita.

create or replace function public.debitar_credito(p_user uuid, p_motivo text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  novo_saldo integer;
  eh_admin boolean;
begin
  select is_admin, creditos_disponiveis into eh_admin, novo_saldo
    from public.users where id = p_user;

  if coalesce(eh_admin, false) then
    return coalesce(novo_saldo, 0); -- admin: não debita, saldo é ilimitado
  end if;

  update public.users
    set creditos_disponiveis = creditos_disponiveis - 1
    where id = p_user and creditos_disponiveis > 0
    returning creditos_disponiveis into novo_saldo;

  if novo_saldo is null then
    return -1; -- sem saldo
  end if;

  insert into public.credits (user_id, tipo, quantidade, motivo)
  values (p_user, 'consumo', -1, coalesce(p_motivo, 'Geração de arte'));

  return novo_saldo;
end;
$$;

-- ---------- Admin: adicionar créditos a um usuário ----------
-- Só quem tem is_admin = true (verificado pelo auth.uid() da sessão que
-- está chamando, nunca por um parâmetro vindo do cliente) pode conceder
-- créditos a outra conta.

create or replace function public.adicionar_credito(p_user uuid, p_quantidade integer, p_motivo text default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  eh_admin boolean;
  novo_saldo integer;
begin
  select is_admin into eh_admin from public.users where id = auth.uid();

  if not coalesce(eh_admin, false) then
    raise exception 'Apenas administradores podem adicionar créditos.';
  end if;

  update public.users
    set creditos_disponiveis = creditos_disponiveis + p_quantidade
    where id = p_user
    returning creditos_disponiveis into novo_saldo;

  if novo_saldo is null then
    raise exception 'Usuário não encontrado.';
  end if;

  insert into public.credits (user_id, tipo, quantidade, motivo)
  values (p_user, 'compra', p_quantidade, coalesce(p_motivo, 'Créditos adicionados pelo admin'));

  return novo_saldo;
end;
$$;

-- Estorno de 1 crédito (usado quando a geração falha após o débito).
create or replace function public.estornar_credito(p_user uuid, p_motivo text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  novo_saldo integer;
begin
  update public.users
    set creditos_disponiveis = creditos_disponiveis + 1
    where id = p_user
    returning creditos_disponiveis into novo_saldo;

  insert into public.credits (user_id, tipo, quantidade, motivo)
  values (p_user, 'bonus', 1, coalesce(p_motivo, 'Estorno de geração'));

  return novo_saldo;
end;
$$;

-- ============================================================
--  RLS — cada usuário só enxerga os próprios dados
-- ============================================================

alter table public.users    enable row level security;
alter table public.projects enable row level security;
alter table public.images   enable row level security;
alter table public.credits  enable row level security;
alter table public.templates enable row level security;

-- users
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- projects
drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- images
drop policy if exists "images_all_own" on public.images;
create policy "images_all_own" on public.images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- credits (leitura própria; escrita fica a cargo das funções security definer)
drop policy if exists "credits_select_own" on public.credits;
create policy "credits_select_own" on public.credits
  for select using (auth.uid() = user_id);

-- templates (catálogo público de leitura para usuários autenticados)
drop policy if exists "templates_select_all" on public.templates;
create policy "templates_select_all" on public.templates
  for select using (ativo = true);

-- ============================================================
--  Storage — bucket "produtos" (fotos originais + artes geradas)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

-- Cada usuário só mexe na sua própria pasta: produtos/<user_id>/...
drop policy if exists "produtos_insert_own" on storage.objects;
create policy "produtos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "produtos_update_own" on storage.objects;
create policy "produtos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "produtos_delete_own" on storage.objects;
create policy "produtos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leitura pública (bucket público) para exibir/baixar as artes.
drop policy if exists "produtos_read_public" on storage.objects;
create policy "produtos_read_public" on storage.objects
  for select using (bucket_id = 'produtos');

-- ============================================================
--  Admin — promove a conta de dono do app
-- ============================================================
-- Idempotente: pode rodar de novo sem efeito colateral. Se a conta ainda
-- não tiver se cadastrado, este update não faz nada (rode de novo depois
-- que ela se cadastrar).

update public.users set is_admin = true
where email = 'marcosabreu.ben10000@gmail.com';
