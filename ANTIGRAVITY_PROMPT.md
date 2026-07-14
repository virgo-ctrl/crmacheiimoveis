# Prompt — Antigravity: construir o CRM Omnichannel Imobiliário

> Cole este prompt no Antigravity com o repositório aberto como workspace. Ele referencia a especificação em `docs/`, `AGENTS.md` e `schema/schema.dbml`. **Leia esses arquivos antes de escrever qualquer código.**

---

## Papel

Você é o engenheiro responsável por implementar um **CRM de vendas para o mercado imobiliário** cujo núcleo é um **canal omnichannel**. A especificação de arquitetura já está pronta e é a fonte da verdade. Seu trabalho é transformá-la em código, respeitando os princípios e a estrutura de pastas existentes — não reprojete o sistema.

## Antes de começar (obrigatório)

1. Leia, nesta ordem: `AGENTS.md` → `docs/00-visao-geral.md` → `docs/01-acessos-rbac.md` → `docs/02-modelo-de-dados.md` → `schema/schema.dbml` → `docs/03-omnichannel.md` → `docs/09-estrutura-de-pastas.md`. Os demais docs conforme a fase.
2. Confirme comigo (o dono) o **stack** antes de escrever código de produção. Padrão proposto: **Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, RLS, Realtime) + n8n** para integrações. Se eu confirmar, siga; se eu mudar, adapte mantendo os limites de módulo.
3. Não invente requisitos. Se algo não estiver na spec, pergunte ou proponha e aguarde aprovação. Registre decisões novas em `docs/`.

## Stack de referência

- **Frontend + BFF:** Next.js (App Router) + TypeScript, em `apps/web`.
- **Banco/Auth:** Supabase (Postgres + Auth + **Row-Level Security** + Realtime). Migrações em `supabase/migrations`, políticas RLS em `supabase/policies`.
- **Assíncrono:** `apps/workers` (consumers de canal, filas, jobs agendados).
- **Integrações/automação:** n8n (`n8n/workflows`) para portais, RD Station e chatbots.
- **Domínio:** `packages/core` (TypeScript puro, sem framework).
- **WhatsApp:** **Cloud API oficial da Meta** (não BSP). Ver `docs/03-omnichannel.md`.

## Princípios inegociáveis (não viole)

1. **Lead é a fonte da verdade; conversa é anexo dele.** Toda mensagem resolve para um `lead_id`. Transferir corretor nunca move nem apaga histórico. `(D6)`
2. **Escopo de dados no backend, via RLS.** Corretor vê só o dele (`self`), gerente o time (`team`), admin tudo (`all`). Filtro no banco, não na UI. `docs/01-acessos-rbac.md`
3. **Qualidade de dados na entrada.** Validação de telefone (E.164)/e-mail + sanitização de nome + dedupe preventiva antes de salvar. `(D3, D4)`
4. **Auditoria por padrão.** Toda ação relevante grava em `audit_log` (append-only). Ação sem log = bug. `(D5)`
5. **Integrações desacopladas por eventos.** Webhooks/filas, nunca síncrono no core. Idempotência por `external_id`.
6. **Configurável sem deploy.** Etapas de funil, origens, motivos de perda, campanhas, regras de distribuição são dado, não código.
7. **Multi-tenant.** `tenant_id` em toda entidade + isolamento por linha.
8. **Regra de dependência:** `apps/* → packages/core`; adapters (`db`, `channels`, `integrations`) implementam interfaces do core. `core` nunca importa de `apps/*` nem de framework. `docs/09-estrutura-de-pastas.md`

## Dores a resolver (rastreadas em todo o código com o código `D#`)

`D1` leads esquecidos sem follow-up · `D2` push não chega ao corretor · `D3` dados sujos na entrada · `D4` empreendimentos duplicados · `D5` falta de auditoria · `D6` perda de histórico na transferência. Ao entregar uma feature, cite qual dor ela endereça e como.

## Ordem de execução (entregue fase por fase, com PR/checkpoint ao fim de cada uma)

**Fase 0 — Fundação**
Monorepo (pnpm + Turborepo), TS base, lint/format. Migrações Supabase geradas a partir de `schema/schema.dbml` (todas as tabelas). Auth Supabase. RBAC: seed de `roles`, `permissions`, `role_permissions` (matriz de `docs/01`). **RLS** implementando os escopos self/team/all em `supabase/policies`. Testes de escopo por perfil.
*Aceite:* um corretor não consegue, por query direta, ler lead de outro; gerente lê os do time; admin lê tudo.

**Fase 1 — Lead + Qualidade de dados**
CRUD de lead, card 360º (todos os campos de `docs/06`), lista + Kanban com os filtros compartilhados, funil configurável. `packages/validation` (E.164, e-mail, sanitização de nome) e dedupe preventiva ligados a toda criação de lead/empreendimento. `(D1 parcial, D3, D4)`
*Aceite:* criar lead com telefone inválido é rejeitado; nome com assinatura de e-mail é sanitizado/barrado; empreendimento duplicado é bloqueado antes de salvar.

**Fase 2 — Omnichannel WhatsApp (núcleo)**
`packages/channels/gateway` (normalizador + idempotência) e `packages/channels/whatsapp` (Cloud API: recebimento por webhook com validação de assinatura, envio, templates, janela de 24h). `core/conversations` com **Lead Resolver** (vincula mensagem→lead; cria lead+distribui se novo; abre dedupe se ambíguo). Inbox unificada em `apps/web/inbox`. Presença/status via Realtime. `(D6)`
*Aceite:* mensagem recebida cria/atualiza conversa vinculada ao lead certo; transferir corretor preserva todo o histórico; fora da janela de 24h a UI força template.

**Fase 3 — Distribuição + Notificações confiáveis**
`core/distribution` (modos manual/roleta/grab/auto por critério) + `distribution_log`. Plantões (`shifts`) como critério. `packages/notifications`: push com **validação no onboarding** + fallback (e-mail/badge) + `jobs/push-healthcheck`. `jobs/no-task-leads` marcando leads sem tarefa. `(D1, D2)`
*Aceite:* cada atribuição registra a regra e o motivo; corretor sem push válido aparece sinalizado e recebe fallback; funil mostra contador de leads sem tarefa.

**Fase 4 — Demais canais**
Adapters Instagram Direct, Messenger, e-mail e webchat reaproveitando o gateway.

**Fase 5 — Dashboards, relatórios e auditoria**
Widgets com objetivo de decisão (pizza/linha/tabela de `docs/06`), relatórios (conversão por etapa, VGV, ticket médio, previsão), tela de auditoria (`admin/audit`). `(D5)`

**Fase 6 — Integrações externas + API aberta**
Webhooks de portais (OLX/VivaReal/Zap), Lead Ads, RD Station, chatbots via `n8n` + `api/webhooks/portals`. Publicar API REST + webhooks documentada (chave por tenant, escopos).

## Convenções

- Banco em `snake_case`, inglês; FKs `<entidade>_id`; timestamps em UTC. `schema/schema.dbml` é a fonte da verdade — mudou o modelo, atualize o DBML e gere migração.
- Segredos em cofre; `channels.credentials_ref` guarda a referência, nunca o segredo em claro.
- Eventos externos: responder webhook 200 rápido e processar assíncrono (fila em `apps/workers`).
- Todo caso de uso que altera etapa/transfere/exporta **emite evento de auditoria**.

## O que NÃO fazer

- Não esconder dado só na UI achando que é segurança — filtre via RLS no banco.
- Não acoplar integração externa de forma síncrona ao core.
- Não transformar papéis/etapas/origens/motivos em `enum` de código — são configuráveis.
- Não criar lead/empreendimento sem validação + checagem de duplicidade.
- Não reprojetar a arquitetura; se precisar divergir, proponha e aguarde aprovação.

## Formato de entrega esperado

Para cada fase: código nos pacotes corretos, migrações/políticas quando aplicável, testes (com foco em escopo/RLS, validação e Lead Resolver), e um resumo curto do que foi feito citando as dores `D#` endereçadas e como testei. Peça revisão ao fim de cada fase antes de avançar.
