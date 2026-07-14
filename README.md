# CRM Omnichannel Imobiliário — Especificação de Arquitetura

Repositório de **especificação** (design docs) de um CRM de vendas para o mercado imobiliário cujo núcleo é um **canal omnichannel** — inbox unificada onde o corretor conversa com o lead por WhatsApp, Instagram, Messenger, e-mail e chat do site, com cada conversa vinculada ao card do lead.

> Este repositório contém **documentação de arquitetura**, ainda sem código. Serve de contexto para o agente de desenvolvimento (Antigravity) implementar o sistema. Comece por `AGENTS.md`.

## Como navegar

| Arquivo | O que contém |
|---------|--------------|
| [`AGENTS.md`](./AGENTS.md) | **Leia primeiro.** Contexto do produto, princípios inegociáveis, convenções e dores a resolver |
| [`docs/00-visao-geral.md`](./docs/00-visao-geral.md) | Objetivo de negócio, princípios de arquitetura, mapa de módulos, dores do CRM atual |
| [`docs/01-acessos-rbac.md`](./docs/01-acessos-rbac.md) | Perfis, modelo RBAC (papel × escopo), matriz de permissões granulares, row-level security |
| [`docs/02-modelo-de-dados.md`](./docs/02-modelo-de-dados.md) | Entidades, campos e regras de integridade (espelha `schema/schema.dbml`) |
| [`docs/03-omnichannel.md`](./docs/03-omnichannel.md) | Núcleo omnichannel: gateway de canais, Lead Resolver, WhatsApp Cloud API, presença, notificações |
| [`docs/04-distribuicao.md`](./docs/04-distribuicao.md) | Motor de distribuição de leads, modos, fluxo de decisão, log de auditoria |
| [`docs/05-qualidade-e-auditoria.md`](./docs/05-qualidade-e-auditoria.md) | Validação na entrada, deduplicação, log de auditoria imutável |
| [`docs/06-leads-dashboard.md`](./docs/06-leads-dashboard.md) | Lead (lista/Kanban + card 360º), dashboards com objetivo de decisão, relatórios, configurações |
| [`docs/07-time-integracoes.md`](./docs/07-time-integracoes.md) | Gestão de time/permissões, escalas de plantão, integrações externas, API aberta |
| [`docs/08-roadmap.md`](./docs/08-roadmap.md) | Roadmap por fases, riscos e mitigação, resumo executivo |
| [`docs/09-estrutura-de-pastas.md`](./docs/09-estrutura-de-pastas.md) | Árvore de pastas do sistema (monorepo TS) + mapa módulo→pasta + regras de dependência |
| [`schema/schema.dbml`](./schema/schema.dbml) | Modelo ER completo em DBML (agnóstico de banco) — fonte da verdade do schema |
| [`ANTIGRAVITY_PROMPT.md`](./ANTIGRAVITY_PROMPT.md) | Prompt completo para o agente de código (Antigravity) construir o sistema |

## Estrutura de código (esqueleto já criado)

O repositório já contém o esqueleto de pastas do sistema (`apps/`, `packages/`, `supabase/`, `n8n/`, `infra/`), pronto para o agente popular. A árvore completa e anotada está em [`docs/09-estrutura-de-pastas.md`](./docs/09-estrutura-de-pastas.md).

## Escopo tecnológico

A arquitetura é **stack-agnóstica** de propósito: define *o quê* e *o porquê*, não a tecnologia. O agente que implementar deve confirmar o stack antes de escrever código (ver `AGENTS.md` › Decisões em aberto).

## Convenções de nomenclatura

- Tabelas e campos em `snake_case`, inglês (ver `schema/schema.dbml`).
- Toda entidade carrega `tenant_id`, `created_at`, `updated_at` (multi-tenant desde o dia 1).
- Chaves estrangeiras: `<entidade_singular>_id` (ex: `lead_id`, `responsible_broker_id`).

## Dores do CRM atual que guiam o design (referência rápida)

`D1` leads esquecidos sem follow-up · `D2` push não chega ao corretor · `D3` dados sujos na entrada · `D4` empreendimentos duplicados · `D5` falta de auditoria · `D6` perda de histórico na transferência. Cada dor é rastreada nos docs pelo seu código.
