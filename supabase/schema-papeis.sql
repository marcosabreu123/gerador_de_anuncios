-- ============================================================================
-- PAPÉIS DE ACESSO (sócio / colaborador / sem acesso)
-- ============================================================================
-- ADITIVO: só adiciona coluna e índice, nada é removido.
--
-- POR QUE ISSO É URGENTE, não só uma funcionalidade nova:
-- as 12 contas do modelo antigo (lojistas que se cadastraram quando o app
-- era self-service) continuam conseguindo entrar. Sem papel, qualquer uma
-- delas cairia no painel novo e veria custo, margem e receita de TODOS os
-- clientes da agência. O default 'sem_acesso' fecha isso: acesso passa a ser
-- concedido explicitamente, nunca presumido.
--
-- papel:
--   socio        -> acesso total (gestão, custo, pacotes, pagamentos, config)
--   colaborador  -> só produção (clientes e geração), sem nada financeiro
--   sem_acesso   -> autentica mas não entra (contas antigas e desligados)
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.users
  add column if not exists papel text not null default 'sem_acesso';

create index if not exists idx_users_papel on public.users (papel);

-- Quem já era admin do app vira sócio (preserva o acesso de quem o tinha de
-- fato). O e-mail aparece aqui porque é o mesmo bootstrap que o schema.sql
-- original já fazia para is_admin.
update public.users
   set papel = 'socio'
 where papel = 'sem_acesso'
   and (is_admin = true or email = 'marcosabreu.ben10000@gmail.com');

-- Registro de quem convidou quem — útil quando a equipe crescer.
alter table public.users
  add column if not exists convidado_por uuid references public.users(id) on delete set null;

alter table public.users
  add column if not exists ativo boolean not null default true;
