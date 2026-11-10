-- Financeiro da agência: o que o negócio gasta.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem efeito.

-- Cada gasto lançado pelos sócios: recarga da OpenAI, pagamento do funcionário,
-- ferramentas, impostos. O que entra continua em pagamentos.
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  -- Dia em que o dinheiro saiu.
  dia date not null,
  categoria text not null
    check (categoria in ('openai', 'funcionario', 'ferramentas', 'impostos', 'outros')),
  descricao text,
  valor_centavos integer not null check (valor_centavos > 0),
  -- Só na recarga da OpenAI: o crédito que entrou lá, em dólar. É com ele que o
  -- Financeiro estima quanto ainda resta para gerar.
  credito_usd numeric(12, 2) check (credito_usd is null or credito_usd > 0),
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_gastos_dia on public.gastos (dia);

-- Dinheiro é dos sócios, como pagamentos e o custo em geracoes.
alter table public.gastos enable row level security;
drop policy if exists gastos_socio on public.gastos;
create policy gastos_socio on public.gastos for all to authenticated
  using (public.eh_socio()) with check (public.eh_socio());

-- Quanto as gerações já gastaram na OpenAI, em dólar, desde o começo. Somado no
-- banco para a tela não trazer todas as linhas de geracoes. Roda com a permissão
-- de quem chama, então só o sócio enxerga a soma.
create or replace function public.custo_total_geracoes_usd()
returns numeric
language sql
stable
security invoker
set search_path = public
as $fn$
  select coalesce(sum(custo_usd), 0) from public.geracoes
$fn$;

revoke execute on function public.custo_total_geracoes_usd() from public, anon;
grant execute on function public.custo_total_geracoes_usd() to authenticated, service_role;
