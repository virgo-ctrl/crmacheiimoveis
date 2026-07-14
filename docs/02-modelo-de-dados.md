# 02 — Modelo de dados

> Fonte da verdade do schema: [`../schema/schema.dbml`](../schema/schema.dbml). Este doc explica as entidades em prosa; o DBML tem os tipos e relacionamentos precisos.

Notação: `PK` chave primária, `FK` chave estrangeira, `→` referência. Todas as entidades carregam `tenant_id`, `created_at`, `updated_at` (omitidos por brevidade).

## Identidade e organização

**users** — pessoas com acesso
`id (PK)` · `tenant_id` · `name` · `email (único)` · `phone` · `status` · `avatar_url` · `push_token` · `push_validated_at` (D2) · `last_seen_at` · `presence` (online/offline/typing)

**roles** · `id (PK)` · `tenant_id` · `name` · `is_system`
**permissions** · `id (PK)` · `key` · `domain` · `description`
**role_permissions** · `role_id (FK)` · `permission_id (FK)` · `scope` (self/team/all)
**user_roles** · `user_id (FK)` · `role_id (FK)`
**teams** · `id (PK)` · `tenant_id` · `name`
**team_members** · `team_id (FK)` · `user_id (FK)` · `role_in_team` (member/manager)
**shifts** (plantão) · `id (PK)` · `team_id (FK)` · `user_id (FK)` · `location` · `starts_at` · `ends_at` · `recurrence`

## Núcleo comercial — Lead

**leads** — entidade central
`id (PK)` · `tenant_id` · `code` (único legível, ex `LD-2026-004512`) · `name` · `phone` (E.164, validado — D3) · `email` (validado — D3) · `entered_at` · `estimated_value` · `source_id (FK → lead_sources)` · `tracking_source` · `campaign_id (FK → campaigns)` · `temperature` (frio/morno/quente) · `stage_id (FK → funnel_stages)` · `loss_reason_id (FK → loss_reasons, nullable)` · `responsible_broker_id (FK → users)` · `last_interaction_at` · `last_interaction_channel` · `next_task_id (FK → tasks, nullable)` · `duplicate_of (FK → leads, nullable)` · `dedupe_status` (unique/suspect/merged) · `notes`

**lead_interests** — lead ↔ empreendimento (N:N) · `lead_id (FK)` · `development_id (FK)` · `property_id (FK, nullable)` · `priority`
**lead_tags** · `lead_id (FK)` · `tag`
**lead_transfers** (D6) · `id (PK)` · `lead_id (FK)` · `from_broker_id` · `to_broker_id` · `reason` · `by_user_id` · `via_rule_id (FK, nullable)` · `created_at`
**timeline_events** — linha do tempo unificada · `id (PK)` · `lead_id (FK)` · `type` (message/stage_change/task/transfer/note/system) · `channel (nullable)` · `actor_id` · `payload (json)` · `occurred_at`

## Omnichannel — Conversa e Mensagem

**channels** · `id (PK)` · `tenant_id` · `type` (whatsapp/instagram/messenger/email/webchat) · `identity` (nº WABA, @handle, caixa...) · `owner_user_id (nullable)` · `status` · `credentials_ref` (ref a segredo, nunca em claro)
**conversations** · `id (PK)` · `tenant_id` · `lead_id (FK)` · `channel_id (FK)` · `assigned_broker_id (FK)` · `status` (open/pending/closed) · `unread_count` · `last_message_at` · `wa_window_expires_at` (janela 24h WhatsApp)
**messages** · `id (PK)` · `conversation_id (FK)` · `direction` (in/out) · `external_id` (idempotência) · `sender` · `content_type` (text/image/audio/doc/template) · `body` · `media_url` · `template_id (nullable)` · `status` (sent/delivered/read/failed) · `occurred_at`
**message_templates** · `id (PK)` · `tenant_id` · `channel_type` · `name` · `category` · `body` · `variables (json)` · `wa_approval_status` · `active`

## Produtos

**developers** (construtoras) · `id (PK)` · `tenant_id` · `name` · `cnpj` (validado, anti-duplicidade — D4) · `contact`
**developments** (empreendimentos) · `id (PK)` · `tenant_id` · `developer_id (FK)` · `name` · `type` (lançamento/em obra/pronto) · `address` · `city` · `region` · `status` · `vgv` · `normalized_key` (nome normalizado p/ dedupe — D4)
**properties** (imóveis) · `id (PK)` · `tenant_id` · `development_id (FK, nullable)` · `code` · `type` · `price` · `area` · `bedrooms` · `status` (disponível/reservado/vendido)

## Funil, tarefas e propostas

**funnel_stages** · `id (PK)` · `tenant_id` · `name` · `order` · `is_won` · `is_lost` · `sla_hours (opcional)`
**lead_sources** · **loss_reasons** · **campaigns** · **qualification_scripts** — todas configuráveis: `id` · `tenant_id` · `name`/campos próprios · `active`
**tasks** · `id (PK)` · `tenant_id` · `lead_id (FK)` · `broker_id (FK)` · `type` (ligação/visita/follow-up) · `title` · `due_at` · `status` (pending/done/overdue/scheduled) · `done_at`
> D1: um lead ativo sem `tasks` pendente/agendada é sinalizado "sem tarefa planejada".

**proposals** · `id (PK)` · `tenant_id` · `lead_id (FK)` · `property_id (FK)` · `value` · `status` (draft/pending_approval/approved/rejected) · `approved_by (FK, nullable)` · `created_by`

## Distribuição, qualidade e auditoria

**distribution_rules** · `id (PK)` · `tenant_id` · `name` · `type` (manual/queue/roleta/grab/auto) · `criteria (json)` · `priority` · `active`
**distribution_log** · `id (PK)` · `lead_id (FK)` · `rule_id (FK)` · `assigned_broker_id` · `decision_reason` · `created_at`
**dedupe_candidates** (D3/D4) · `id (PK)` · `entity_type` (lead/development/developer) · `entity_id` · `match_entity_id` · `match_score` · `match_fields (json)` · `status` (open/merged/ignored)
**audit_log** (D5, append-only) · `id (PK)` · `tenant_id` · `actor_id` · `action` · `entity_type` · `entity_id` · `before (json)` · `after (json)` · `ip` · `occurred_at`

## Regras de integridade que sustentam a qualidade

- `leads.phone` só grava em **E.164** e passa por validação de DDD/comprimento antes do insert (D3).
- `leads.email` valida sintaxe + (opcional) MX; rejeita quando o "nome" parece assinatura (quebras de linha, URLs, "Enviado do meu…") (D3).
- `developers.cnpj` e `developments.normalized_key` são checados por *fuzzy match* antes de salvar; se `score > limiar`, bloqueia e sugere o existente (D4).
- Toda mudança de `stage_id` grava em `timeline_events` **e** `audit_log`.
