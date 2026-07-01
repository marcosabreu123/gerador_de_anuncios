# Artes com IA — Micro SaaS (MVP)

Transforma uma foto simples de produto em uma arte publicitária profissional
(Instagram/WhatsApp/tráfego pago), por um fluxo guiado por perguntas — sem prompt manual.

**Stack:** Next.js 16 (App Router) · Supabase (Auth/DB/Storage) · Google Gemini (imagem) · OpenAI GPT-4.1 mini (montagem de prompt). Mobile-first.

**Produção:** https://gerador-de-anuncios-delta.vercel.app
(deploy automático a cada push na branch `main` — projeto Vercel `gerador-de-anuncios`)

---

## 1. Configuração inicial (uma vez)

### a) Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha os **segredos** (as chaves públicas já vêm preenchidas):

```
GEMINI_API_KEY=...        # geração de imagem
OPENAI_API_KEY=...        # montagem do prompt (opcional — há fallback sem ela)
SUPABASE_SERVICE_ROLE_KEY=  # opcional no MVP
FAL_KEY=                  # reservado (não usar ainda)
```

> Sem `GEMINI_API_KEY` a geração não funciona. Sem `OPENAI_API_KEY` o app ainda
> funciona usando um montador de prompt local (fallback determinístico).

### b) Banco de dados (Supabase)
No painel do Supabase → **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
Isso cria as tabelas, RLS, o bucket `produtos` (Storage), o provisionamento
automático de usuário (3 créditos de bônus) e as funções de débito/estorno de crédito.

---

## 2. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000

Fluxo: **Landing → Login/Cadastro → Dashboard → Nova arte** (foto → formato → estilo → infos) **→ Resultado** (variações + ajuste em linguagem natural + download).

---

## 3. Arquitetura (onde está cada coisa)

| Caminho | O quê |
|---|---|
| `src/proxy.ts` | Guarda de rotas + refresh de sessão (Next 16 renomeou `middleware`→`proxy`) |
| `src/lib/supabase/` | Clients (browser/server/admin) e helper de sessão |
| `src/lib/ai/models.ts` | IDs dos modelos (Gemini Pro/Flash, GPT-4.1 mini) |
| `src/lib/ai/prompt-builder.ts` | GPT-4.1 mini monta o prompt visual a partir do briefing (com fallback) |
| `src/lib/ai/gemini.ts` | Geração/edição de imagem via Gemini |
| `src/lib/ai/flux.ts` | **Stub** para edição localizada futura (fal.ai) — não implementado |
| `src/lib/credits.ts` | Débito/estorno de crédito (funções SQL atômicas) |
| `src/lib/storage.ts` | Upload de imagens para o Storage |
| `src/app/api/generate` | Gera 2–3 variações (debita 1 crédito por geração) |
| `src/app/api/adjust` | Ajuste em linguagem natural sobre uma arte |
| `src/app/novo` + `components/NovoWizard.tsx` | Fluxo guiado |
| `src/app/resultado/[projectId]` | Variações + ajustes + download |

### Segurança
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `FAL_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são
  usadas **somente** em API routes / server (nunca no client).
- RLS ativo: cada usuário só acessa os próprios dados.
- Storage: cada usuário só escreve na pasta `produtos/<seu_id>/`.

### Modelos por etapa
- **Rascunho / variações iniciais:** `gemini-3.1-flash-image` (Nano Banana 2 — rápido/barato).
- **Ajuste final:** `gemini-3-pro-image` (Nano Banana Pro — melhor texto legível).
  Ajuste em `src/lib/ai/models.ts`.

---

## 4. Fora do MVP (estrutura preparada, não implementado)
- Edição localizada via Flux/fal.ai (`src/lib/ai/flux.ts`)
- Pagamentos (Stripe/Mercado Pago) — créditos hoje são manuais
- Editor manual/camadas, marketplace de templates, multi-idioma

## 5. Deploy (Vercel)
Suba o repositório na Vercel e configure as mesmas variáveis de ambiente do `.env.local`
no painel do projeto (Settings → Environment Variables).
