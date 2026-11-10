-- Gestão da carteira: cliente em teste e último pedido de cada cliente.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem efeito.

-- Cliente em teste produz normalmente, mas fica fora da receita, das cobranças
-- e dos totais do painel. O custo dele aparece separado.
alter table public.clientes add column if not exists em_teste boolean not null default false;

-- Último pedido de cada cliente. A lista de clientes e o painel separam quem
-- está pedindo de quem parou sem trazer todos os pedidos para o servidor.
-- Roda com a permissão de quem chama, então valem as mesmas regras de pedidos.
create or replace function public.ultimo_pedido_por_cliente()
returns table (cliente_id uuid, ultimo_pedido_em timestamptz)
language sql
stable
security invoker
set search_path = public
as $fn$
  select cliente_id, max(created_at) from public.pedidos group by cliente_id
$fn$;

revoke execute on function public.ultimo_pedido_por_cliente() from public, anon;
grant execute on function public.ultimo_pedido_por_cliente() to authenticated, service_role;
