-- ============================================================================
-- REMODELAGEM: de SaaS self-service para operação de agência de imagem
-- ============================================================================
-- ADITIVO POR DESIGN. Este arquivo só CRIA — nenhum drop, nenhum alter
-- destrutivo. Dois motivos:
--   1) Este projeto Supabase é COMPARTILHADO com outro app (tabelas
--      profiles/creations/chat_sessions). Derrubar algo aqui quebra lá.
--   2) As tabelas do modelo antigo (users, projects, images, credits,
--      templates) continuam intactas. credits/templates ficam órfãs e
--      inofensivas até alguém decidir aposentá-las de propósito.
--
-- VIRADA CONCEITUAL: no modelo antigo, uma linha em "users" era ao mesmo
-- tempo quem loga, quem usa e quem paga. Agora isso se parte em dois:
--   public.users    = operadores (sócios + designer). Logam no app.
--   public.clientes = empresas atendidas. NÃO logam — são dados, não contas.
--
-- Rode no SQL Editor do Supabase. Idempotente: pode rodar mais de uma vez.
-- ============================================================================


-- ---------- Empresas atendidas ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Nicho orienta a direção de arte (ver prompt-builder). O começo do negócio
  -- é fast-food/gastrobar, mas o campo é livre: nenhum nicho fica de fora.
  nicho text,
  contato_nome text,
  contato_telefone text,
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_clientes_ativo on public.clientes (ativo);


-- ---------- Identidade visual do cliente ----------
-- É o que faz o agente gerar "no estilo daquela empresa" em vez de genérico.
-- 1:1 com cliente (unique), separado só por clareza: clientes é cadastro,
-- brand_kits é direção criativa.
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,

  cores_primarias text,
  cores_secundarias text,
  tipografia text,
  estilo_visual text,
  tom_de_voz text,

  -- Regras duras. O agente trata como inegociável — é aqui que entra
  -- "sempre mostrar o WhatsApp" e "nunca usar fundo roxo".
  regras_obrigatorias text[] default array[]::text[],
  regras_proibidas text[] default array[]::text[],

  -- Informações comerciais recorrentes: evita o operador redigitar o
  -- WhatsApp e o endereço a cada pedido.
  whatsapp text,
  endereco text,
  horario_funcionamento text,
  instagram text,

  -- Direção de arte acumulada, refinada conforme as artes são aprovadas.
  -- É a memória criativa do cliente.
  direcao_arte jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- ---------- Biblioteca visual do cliente ----------
-- tipo: logo | produto | arte_aprovada | referencia_visual
--   arte_aprovada é a mais valiosa: alimenta o padrão do cliente com o que já
--   deu certo, reduzindo tentativa e erro (= custo) nos próximos pedidos.
create table if not exists public.referencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'referencia_visual',
  url text not null,
  descricao text,
  created_at timestamptz default now()
);
create index if not exists idx_referencias_cliente on public.referencias (cliente_id, tipo);


-- ---------- Pacotes vendidos ----------
-- Primeiro pacote: 10 imagens por R$ 34,90 (valor_centavos = 3490).
create table if not exists public.pacotes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null default 'Pacote 10 imagens',
  qtd_imagens integer not null,
  qtd_usadas integer not null default 0,
  valor_centavos integer not null,
  -- ativo | esgotado | expirado | cancelado
  status text not null default 'ativo',
  validade date,
  created_at timestamptz default now()
);
create index if not exists idx_pacotes_cliente on public.pacotes (cliente_id, status);


-- ---------- Pagamentos ----------
-- Nasce manual (o operador marca o Pix que caiu), mas já com os campos do
-- gateway: quando plugar Mercado Pago/Asaas é preencher referencia_externa,
-- não migrar schema.
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references public.pacotes(id) on delete set null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  valor_centavos integer not null,
  -- pix | dinheiro | transferencia | cartao | gateway
  metodo text not null default 'pix',
  -- pendente | confirmado | estornado
  status text not null default 'pendente',
  referencia_externa text,
  pago_em timestamptz,
  registrado_por uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_pagamentos_cliente on public.pagamentos (cliente_id, status);


-- ---------- Pedidos (o lote) ----------
-- Um pedido = uma solicitação do operador ("5 artes pra semana"), que vira N
-- peças. O plano fica em jsonb e precisa ser APROVADO antes de gerar — é o
-- ponto de controle de custo: se o agente entendeu errado o áudio, isso
-- aparece antes de queimar 5 gerações, não depois.
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  titulo text,
  pedido_original text,
  -- audio | texto
  origem text not null default 'texto',
  audio_url text,
  plano jsonb,
  -- rascunho | planejado | aprovado | processando | concluido | erro
  status text not null default 'rascunho',
  criado_por uuid references public.users(id) on delete set null,
  aprovado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_pedidos_cliente on public.pedidos (cliente_id, status);


-- ---------- Peças (o que o cliente recebe) ----------
-- Separar peça de geração é o que torna o rateio possível: uma peça pode
-- custar 1 ou 6 gerações. Sem essa separação o custo real fica invisível,
-- que é exatamente o que acontecia no modelo antigo.
create table if not exists public.pecas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ordem integer not null default 0,
  titulo text,
  briefing jsonb,
  -- pendente | gerando | gerada | aprovada | rejeitada | erro
  status text not null default 'pendente',
  imagem_url text,
  prompt_usado text,
  erro text,
  -- Tempo HUMANO gasto revisando/ajustando. A margem do pacote depende mais
  -- disso do que do custo de API — por isso é medido junto.
  tempo_operacao_segundos integer,
  -- O cliente comprou 10 PEÇAS ENTREGUES, não 10 chamadas de API. Se a peça
  -- for rejeitada e regerada, o pacote não pode ser debitado de novo — esta
  -- flag garante o débito uma única vez por peça. O custo do retrabalho sai
  -- da margem da agência, não do saldo do cliente.
  pacote_consumido boolean not null default false,
  aprovada_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_pecas_pedido on public.pecas (pedido_id, ordem);
create index if not exists idx_pecas_cliente on public.pecas (cliente_id, status);


-- ---------- Gerações (onde mora o custo) ----------
-- UMA linha por chamada de API, inclusive as que FALHARAM: falha também custa
-- e precisa aparecer no rateio.
create table if not exists public.geracoes (
  id uuid primary key default gen_random_uuid(),
  peca_id uuid references public.pecas(id) on delete set null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,

  -- imagem | texto | transcricao | edicao
  tipo text not null,
  modelo text not null,
  qualidade text,
  tamanho text,

  -- Resposta crua de usage da API. Guardada porque tabela de preço muda, e
  -- com o dado bruto dá pra recalcular o histórico sem perder nada.
  usage_raw jsonb,

  custo_usd numeric(12,6),
  -- Câmbio do momento: sem isso, custo em BRL vira chute retroativo.
  cambio_brl numeric(10,4),
  custo_brl numeric(12,4),

  duracao_ms integer,
  sucesso boolean not null default true,
  erro text,
  created_at timestamptz default now()
);
create index if not exists idx_geracoes_cliente on public.geracoes (cliente_id, created_at desc);
create index if not exists idx_geracoes_peca on public.geracoes (peca_id);
create index if not exists idx_geracoes_periodo on public.geracoes (created_at desc);


-- ---------- Fila de jobs ----------
-- Um lote de 5 imagens leva de 3 a 8 minutos: não cabe numa request da
-- Vercel. A fila é uma tabela + worker acionado por cron. Zero serviço novo.
create table if not exists public.fila_jobs (
  id uuid primary key default gen_random_uuid(),
  -- gerar_peca | planejar_pedido
  tipo text not null,
  referencia_id uuid not null,
  payload jsonb,
  -- pendente | processando | concluido | erro
  status text not null default 'pendente',
  tentativas integer not null default 0,
  max_tentativas integer not null default 3,
  erro text,
  agendado_para timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_fila_pendente on public.fila_jobs (status, agendado_para);


-- ============================================================================
-- Função: consumir 1 imagem do pacote do cliente (atômica)
-- ============================================================================
-- Mesmo padrão do debitar_credito do modelo antigo: a condição
-- "qtd_usadas < qtd_imagens" dentro do próprio UPDATE evita corrida entre
-- duas entregas simultâneas. Retorna o saldo restante, ou -1 se não há
-- pacote com saldo.
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
  -- Consome primeiro o que vence antes, ignorando os vencidos; no empate, o
  -- mais antigo. Igual a schema-cobrancas.sql, para rodar este arquivo de novo
  -- não desfazer a ordem dos planos por tempo.
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


-- ============================================================================
-- Função: devolver 1 imagem ao pacote (estorno)
-- ============================================================================
create or replace function public.devolver_imagem_pacote(p_cliente uuid)
returns void
language plpgsql
security definer set search_path = public
as $fn$
declare
  v_pacote uuid;
begin
  select id into v_pacote
  from public.pacotes
  where cliente_id = p_cliente and qtd_usadas > 0
  order by created_at desc
  limit 1;

  if v_pacote is null then
    return;
  end if;

  update public.pacotes
     set qtd_usadas = qtd_usadas - 1,
         status = case when status = 'esgotado' then 'ativo' else status end
   where id = v_pacote;
end;
$fn$;


-- ============================================================================
-- RLS
-- ============================================================================
-- App 100% interno: todo usuário autenticado é operador de confiança. Não há
-- cliente final logando, então não existe isolamento por linha a fazer — a
-- política é simplesmente "precisa estar autenticado". Se um dia o cliente
-- ganhar acesso, é AQUI que o isolamento entra.
alter table public.clientes    enable row level security;
alter table public.brand_kits  enable row level security;
alter table public.referencias enable row level security;
alter table public.pacotes     enable row level security;
alter table public.pagamentos  enable row level security;
alter table public.pedidos     enable row level security;
alter table public.pecas       enable row level security;
alter table public.geracoes    enable row level security;
alter table public.fila_jobs   enable row level security;

do $rls$
declare
  t text;
begin
  foreach t in array array[
    'clientes','brand_kits','referencias','pacotes','pagamentos',
    'pedidos','pecas','geracoes','fila_jobs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_operador', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_operador', t
    );
  end loop;
end
$rls$;
