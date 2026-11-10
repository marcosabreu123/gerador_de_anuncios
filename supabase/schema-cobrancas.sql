-- ============================================================================
-- COBRANÇAS: PLANOS POR TEMPO
-- ============================================================================
-- ADITIVO: acrescenta colunas e regras em public.pacotes e troca a função que
-- debita a imagem. Nada é apagado, e o app que está no ar continua funcionando
-- com o banco já alterado.
--
-- Um plano por tempo é uma linha de pacotes com tipo 'tempo':
--   meses        1, 3, 6 ou 12
--   assinado_em  dia em que o plano foi fechado
--   validade     último dia do plano. Depois dele as imagens do plano deixam de
--                valer, e a geração bloqueia se o cliente não tiver outro saldo.
--   qtd_imagens  imagens para usar no período (10 por padrão, editável na tela)
--
-- Os pacotes que já existem viram tipo 'imagens', com assinado_em no dia em que
-- foram lançados.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.pacotes add column if not exists tipo text not null default 'imagens';
alter table public.pacotes add column if not exists meses integer;
alter table public.pacotes add column if not exists assinado_em date;

update public.pacotes
   set assinado_em = (coalesce(created_at, now()) at time zone 'America/Sao_Paulo')::date
 where assinado_em is null;

alter table public.pacotes
  alter column assinado_em set default ((now() at time zone 'America/Sao_Paulo')::date),
  alter column assinado_em set not null;

alter table public.pacotes drop constraint if exists pacotes_tipo_check;
alter table public.pacotes add constraint pacotes_tipo_check
  check (tipo in ('imagens', 'tempo'));

-- Plano sempre tem duração e vencimento; pacote de imagens não tem duração.
alter table public.pacotes drop constraint if exists pacotes_plano_check;
alter table public.pacotes add constraint pacotes_plano_check
  check (
    (tipo = 'imagens' and meses is null)
    or (tipo = 'tempo' and meses in (1, 3, 6, 12) and validade is not null)
  );

create index if not exists idx_pacotes_validade on public.pacotes (cliente_id, validade);


-- ---------- Débito da imagem ----------
-- Gasta primeiro o que vence antes: a imagem do plano que está acabando sai antes
-- da do pacote avulso, que não vence. No empate, o mais antigo.
--
-- O dia é o de São Paulo, o mesmo que o app usa para dizer se o plano venceu. Em
-- UTC, depois das 21h o plano já estaria vencido enquanto a tela ainda mostra
-- "vence hoje".
create or replace function public.consumir_imagem_pacote(p_cliente uuid)
returns integer
language plpgsql
security definer set search_path = public
as $fn$
declare
  v_pacote uuid;
  v_restante integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id into v_pacote
  from public.pacotes
  where cliente_id = p_cliente
    and status = 'ativo'
    and qtd_usadas < qtd_imagens
    and (validade is null or validade >= v_hoje)
  order by validade asc nulls last, created_at asc
  limit 1;

  if v_pacote is null then
    return -1;
  end if;

  update public.pacotes
     set qtd_usadas = qtd_usadas + 1
   where id = v_pacote
     and qtd_usadas < qtd_imagens
  returning (qtd_imagens - qtd_usadas) into v_restante;

  if v_restante is null then
    return -1;
  end if;

  if v_restante = 0 then
    update public.pacotes set status = 'esgotado' where id = v_pacote;
  end if;

  return v_restante;
end;
$fn$;

-- A função debita saldo: só o servidor chama (ver schema-seguranca.sql).
revoke execute on function public.consumir_imagem_pacote(uuid) from public, anon, authenticated;
grant execute on function public.consumir_imagem_pacote(uuid) to service_role;
