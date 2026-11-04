-- ============================================================================
-- SEGURANÇA DE ACESSO
-- ============================================================================
-- O papel do usuário (sócio / colaborador / sem_acesso) só era conferido nas
-- telas e nas rotas. No banco, qualquer conta logada podia tudo: as policies de
-- schema-agencia.sql liberam "to authenticated using (true)". Como o cadastro
-- público do Supabase está aberto e confirma o e-mail sozinho, isso alcançava
-- qualquer pessoa com o endereço do app, porque a chave pública está no site.
--
-- O que este arquivo fecha:
--   1. Tabelas da agência: só sócio e colaborador. Dinheiro (pagamentos e custo
--      em geracoes) e a fila, só sócio.
--   2. public.users: ninguém altera a própria linha. Antes uma conta sem acesso
--      podia se promover a sócio com um UPDATE no próprio papel.
--   3. Funções de pacote: só o servidor. Antes qualquer visitante, mesmo sem
--      login, podia debitar ou estornar imagens de um cliente.
--
-- Não muda o que o app faz: o worker e as telas de gestão usam a service role,
-- que não passa por RLS, e o sócio continua alterando papéis por /configuracoes.
--
-- Depois de rodar, feche também o cadastro público no painel do Supabase:
-- Authentication > Sign In / Providers > "Allow new users to sign up" desligado.
-- Criar login por /configuracoes continua funcionando, porque usa a API de admin.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- ---------- Quem pode o quê ----------
-- security definer porque public.users tem RLS própria: sem isso a função só
-- enxergaria o que a policy de users deixa.
create or replace function public.eh_operador()
returns boolean
language sql
stable
security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.users
    where id = auth.uid() and ativo and papel in ('socio', 'colaborador')
  );
$fn$;

create or replace function public.eh_socio()
returns boolean
language sql
stable
security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.users
    where id = auth.uid() and ativo and papel = 'socio'
  );
$fn$;

-- ---------- Tabelas da agência ----------
do $rls$
declare
  t text;
begin
  foreach t in array array['clientes','brand_kits','referencias','pacotes','pedidos','pecas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_operador', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.eh_operador()) with check (public.eh_operador())',
      t || '_operador', t
    );
  end loop;

  foreach t in array array['pagamentos','geracoes','fila_jobs']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_operador', t);
    execute format('drop policy if exists %I on public.%I', t || '_socio', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.eh_socio()) with check (public.eh_socio())',
      t || '_socio', t
    );
  end loop;
end
$rls$;

-- ---------- public.users ----------
-- Leitura da própria linha continua (users_select_own). Escrita só pelo servidor.
drop policy if exists "users_update_own" on public.users;

-- ---------- Funções de pacote ----------
revoke execute on function public.consumir_imagem_pacote(uuid) from public, anon, authenticated;
revoke execute on function public.devolver_imagem_pacote(uuid) from public, anon, authenticated;
grant execute on function public.consumir_imagem_pacote(uuid) to service_role;
grant execute on function public.devolver_imagem_pacote(uuid) to service_role;
