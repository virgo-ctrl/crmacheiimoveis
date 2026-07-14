# 09 — Estrutura de pastas do sistema

Estrutura para a **stack de referência**: monorepo TypeScript (pnpm workspaces + Turborepo) com **Next.js** (web + BFF), **Supabase** (Postgres + Auth + RLS + Realtime) e **n8n** (integrações/automações). Cada pasta aponta para o módulo que implementa e, quando aplicável, para a dor `D#` que resolve.

> Se o stack mudar, os limites de módulo (leads, conversations, distribution, quality, audit…) permanecem — muda só o invólucro. A regra de ouro: **o domínio vive em `packages/core` e não conhece framework**; web, workers e canais dependem dele, nunca o contrário.

## Árvore completa

```
imobiliaria-crm/
├─ README.md                     # índice do repositório
├─ AGENTS.md                     # contexto para o agente de código
├─ package.json                  # raiz do monorepo
├─ pnpm-workspace.yaml           # workspaces (apps/*, packages/*)
├─ turbo.json                    # pipeline de build/test/lint
├─ tsconfig.base.json            # TS compartilhado
├─ .env.example                  # variáveis (nunca commitar .env real)
│
├─ docs/                         # ESPECIFICAÇÃO (este diretório)
│  ├─ 00-visao-geral.md
│  ├─ 01-acessos-rbac.md
│  ├─ 02-modelo-de-dados.md
│  ├─ 03-omnichannel.md
│  ├─ 04-distribuicao.md
│  ├─ 05-qualidade-e-auditoria.md
│  ├─ 06-leads-dashboard.md
│  ├─ 07-time-integracoes.md
│  ├─ 08-roadmap.md
│  └─ 09-estrutura-de-pastas.md
│
├─ schema/
│  └─ schema.dbml                # modelo ER (fonte da verdade do schema)
│
├─ apps/
│  ├─ web/                       # Next.js — UI + API/BFF (todos os módulos de tela)
│  │  ├─ public/                 # estáticos
│  │  └─ src/
│  │     ├─ app/                 # App Router
│  │     │  ├─ (auth)/           # login, recuperação de senha
│  │     │  ├─ (app)/            # área autenticada
│  │     │  │  ├─ dashboard/     # Módulo 6 — dashboard operacional/gerencial
│  │     │  │  ├─ leads/         # Módulo 2 — lista, kanban, [id] (card 360º)
│  │     │  │  │  ├─ list/
│  │     │  │  │  ├─ kanban/
│  │     │  │  │  └─ [id]/       # card do lead + timeline
│  │     │  │  ├─ inbox/         # Módulo 3 — OMNICHANNEL (inbox unificada)
│  │     │  │  │  └─ [conversationId]/
│  │     │  │  ├─ products/      # Módulo 5 — developments/properties/developers
│  │     │  │  ├─ reports/       # Módulo 6 — relatórios gerenciais
│  │     │  │  ├─ settings/      # Módulo 8 — funil, origens, perdas, campanhas, scripts
│  │     │  │  └─ admin/         # Módulos 1/10 — usuários, equipes, papéis,
│  │     │  │     ├─ users/      #                 plantões, integrações, auditoria
│  │     │  │     ├─ teams/
│  │     │  │     ├─ roles/      # RBAC (papel × escopo)
│  │     │  │     ├─ shifts/     # escalas de plantão
│  │     │  │     ├─ integrations/
│  │     │  │     └─ audit/      # tela de auditoria (D5)
│  │     │  └─ api/              # route handlers (BFF) + webhooks
│  │     │     ├─ leads/
│  │     │     ├─ conversations/
│  │     │     ├─ distribution/
│  │     │     ├─ reports/
│  │     │     └─ webhooks/      # ENTRADA de canais/integrações (assíncrono)
│  │     │        ├─ whatsapp/   # Cloud API (Meta) — valida assinatura, 200 rápido
│  │     │        ├─ instagram/
│  │     │        ├─ messenger/
│  │     │        ├─ email/
│  │     │        └─ portals/    # OLX, VivaReal, Zap, Lead Ads, forms
│  │     ├─ features/            # UI por feature (colocada perto do domínio)
│  │     │  ├─ leads/
│  │     │  ├─ inbox/
│  │     │  ├─ dashboard/
│  │     │  ├─ distribution/
│  │     │  └─ products/
│  │     ├─ components/          # componentes genéricos da app
│  │     ├─ hooks/
│  │     ├─ lib/                 # clients (supabase, realtime), helpers de UI
│  │     └─ middleware.ts        # sessão + guarda de rota por perfil
│  │
│  └─ workers/                   # processamento ASSÍNCRONO (fora do request)
│     └─ src/
│        ├─ consumers/           # ingestão de canais (fila → Lead Resolver)
│        ├─ queues/              # definição/roteamento de filas
│        └─ jobs/                # rotinas agendadas
│           ├─ no-task-leads/    # D1 — leads sem próxima tarefa
│           ├─ dedupe-scan/      # D3/D4 — deduplicação detectiva
│           ├─ push-healthcheck/ # D2 — testa tokens de push
│           └─ sla-alerts/       # estagnação por etapa (funnel_stages.sla_hours)
│
├─ packages/
│  ├─ core/                      # DOMÍNIO — regras e casos de uso (sem framework)
│  │  └─ src/
│  │     ├─ leads/               # Módulo 2 — entidade lead, transferência, dedupe status
│  │     ├─ conversations/       # Módulo 3 — Lead Resolver, vínculo msg→lead, timeline
│  │     ├─ distribution/        # Módulo 4 — motor de regras + decisão + log
│  │     ├─ products/            # Módulo 5 — imóveis/empreendimentos/construtoras
│  │     ├─ tasks/               # Módulo 7 — tarefas/agenda (regra "lead precisa de tarefa")
│  │     ├─ proposals/           # propostas + aprovação
│  │     ├─ quality/             # D3/D4 — validação de entrada + matching de duplicados
│  │     └─ audit/               # D5 — emissão de eventos de auditoria
│  │
│  ├─ db/                        # camada de dados: repositórios + tipos gerados
│  │  └─ src/
│  │     ├─ repositories/        # acesso por entidade (respeita escopo/RLS)
│  │     └─ types/               # tipos gerados do schema (Supabase)
│  │
│  ├─ channels/                  # ADAPTERS de canal (transporte) — Módulo 3
│  │  └─ src/
│  │     ├─ gateway/             # normalizador p/ "Mensagem Canônica" + idempotência
│  │     ├─ whatsapp/            # Cloud API: templates, janela 24h, envio/recebimento
│  │     ├─ instagram/
│  │     ├─ messenger/
│  │     ├─ email/
│  │     └─ webchat/
│  │
│  ├─ auth/                      # Módulo 1 — RBAC: papéis, permissões, resolução de escopo
│  │  └─ src/
│  │     ├─ rbac/                # matriz papel × escopo
│  │     └─ policies/            # helpers de escopo (self/team/all) p/ queries
│  │
│  ├─ integrations/              # Módulo 11 — clients de RD Station, portais, chatbots
│  │  └─ src/
│  │
│  ├─ notifications/             # D2 — push + fallback (e-mail/badge) + health-check
│  │  └─ src/
│  │
│  ├─ ui/                        # design system compartilhado (componentes base)
│  │  └─ src/
│  │
│  ├─ validation/                # D3/D4 — telefone (E.164), e-mail, sanitização de nome
│  │  └─ src/                    #        + algoritmos de fuzzy match (compartilhado)
│  │
│  └─ config/                    # tsconfig/eslint/prettier compartilhados
│
├─ supabase/                     # banco: Supabase CLI
│  ├─ migrations/                # migrações versionadas (geradas do schema.dbml)
│  ├─ policies/                  # RLS — row-level security por escopo (Módulo 1)
│  ├─ functions/                 # edge functions (se necessário)
│  └─ seed/                      # dados iniciais (papéis, etapas, origens padrão)
│
├─ n8n/                          # Módulo 11 — automações/integrações
│  └─ workflows/                 # workflows exportados (.json) — portais, RD, chatbots
│
└─ infra/
   ├─ docker/                    # Dockerfiles + docker-compose (dev)
   ├─ ci/                        # pipelines (build, test, lint, deploy)
   └─ env/                       # exemplos e docs de variáveis por ambiente
```

## Mapa rápido módulo → pasta

| Módulo | Domínio (`packages/core`) | Tela (`apps/web`) | Assíncrono / infra |
|--------|---------------------------|-------------------|--------------------|
| 1. Identidade & Acessos (RBAC) | `auth/` | `admin/{users,teams,roles}` | `supabase/policies` (RLS) |
| 2. Leads | `core/leads` | `leads/{list,kanban,[id]}` | `jobs/no-task-leads` (D1) |
| 3. Omnichannel | `core/conversations` + `channels/*` | `inbox/` | `workers/consumers`, `api/webhooks/*` |
| 4. Distribuição | `core/distribution` | `admin/…` / ação no lead | — |
| 5. Produtos | `core/products` | `products/` | — |
| 6. Dashboard & Relatórios | (consultas) | `dashboard/`, `reports/` | — |
| 7. Tarefas & Agenda | `core/tasks` | dentro do lead / dashboard | `jobs/sla-alerts` |
| 8. Configurações | (configs) | `settings/` | `supabase/seed` |
| 9. Qualidade de dados | `core/quality` + `validation/` | validação na criação | `jobs/dedupe-scan` (D3/D4) |
| 10. Auditoria | `core/audit` | `admin/audit` | `audit_log` (append-only) |
| 11. Integrações | `integrations/` | `admin/integrations` | `n8n/workflows`, `api/webhooks/portals` |
| — Notificações (D2) | — | badge in-app | `notifications/` + `jobs/push-healthcheck` |

## Regras de dependência (importante para o agente)

- `packages/core` **não importa** nada de `apps/*`, de framework web nem de banco concreto — só define regras e interfaces (ports). Repositórios e adapters são injetados.
- `packages/db`, `packages/channels`, `packages/integrations` **implementam** as interfaces de `core` (adapters).
- `apps/web` e `apps/workers` **orquestram**: chamam casos de uso de `core` passando as implementações.
- `packages/validation` e `packages/auth` são compartilhados por web e workers — regra de qualidade e de escopo mora num lugar só.
- Sentido das dependências: `apps/* → packages/core → (interfaces)`; adapters `→ core` também. Nunca `core → apps`.
