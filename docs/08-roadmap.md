# 08 — Roadmap, riscos e resumo executivo

## Roadmap sugerido por fases

A ordem prioriza **provar o núcleo (omnichannel + qualidade de dados)** antes de sofisticar relatórios.

**Fase 0 — Fundação (semanas 1–3)**
Modelo de dados, autenticação, RBAC com escopo row-level, cadastro de usuários/equipes, tenant. Alicerce de tudo.

**Fase 1 — Lead + Qualidade de dados (semanas 3–6)**
CRUD de lead, card 360º, lista/Kanban com filtros, funil configurável, validação de entrada e deduplicação preventiva. Ataca D1/D3/D4 desde o início.

**Fase 2 — Omnichannel WhatsApp (semanas 6–11)**
Gateway de canais + adapter WhatsApp Cloud API, inbox unificada, Lead Resolver, templates, janela de 24h, presença. O núcleo do produto e o maior risco técnico.

**Fase 3 — Distribuição + Notificações confiáveis (semanas 11–14)**
Motor de regras, log de distribuição, plantões, push validado + fallback (D2).

**Fase 4 — Demais canais (semanas 14–17)**
Adapters de Instagram Direct, Messenger, e-mail e webchat reaproveitando o gateway.

**Fase 5 — Dashboards, relatórios e auditoria (semanas 17–21)**
Widgets com objetivo de decisão, relatórios gerenciais, previsão de vendas, tela de auditoria.

**Fase 6 — Integrações externas + API aberta (semanas 21+)**
Portais, RD Station, chatbots, Lead Ads e publicação da API pública.

> As semanas são referência de sequenciamento e dependência, não compromisso de prazo — dependem do tamanho do time.

## Principais riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Aprovação de templates e *quality rating* do WhatsApp atrasam Fase 2 | Iniciar cadastro do WABA e templates no fim da Fase 1, em paralelo |
| Escopo de dados mal feito vaza lead entre corretores | Row-level security no banco + testes automatizados de escopo por perfil |
| Volume de webhooks derruba ingestão | Fila + processamento assíncrono + idempotência desde o início |
| Base suja migrada do CRM antigo | Rotina de dedupe + validação rodando na importação, não só em novos leads |

## Resumo executivo (decisões-chave)

1. **Lead é o centro; conversa e mensagem são anexos dele** — resolve perda de histórico em transferências.
2. **RBAC = papel (ações) + escopo (self/team/all) aplicado no banco** — segurança real, não só de tela.
3. **Omnichannel como agregador com adapters por canal** — WhatsApp Cloud API oficial primeiro; novos canais entram sem tocar o core.
4. **Qualidade de dados na entrada** (validação + dedupe preventiva) — ataca dados sujos e empreendimentos duplicados na origem.
5. **Notificação confiável validada no onboarding + fallback multicanal** — resolve o "corretor não recebe push".
6. **"Todo lead ativo precisa de próxima tarefa"** como regra + indicador no funil — mata o lead esquecido.
7. **Auditoria append-only por padrão** e **integrações desacopladas por eventos** — governança e resiliência.

## Próximo passo

Sair do agnóstico: escolher o stack (referência: Next.js + Supabase + n8n) e detalhar contratos de API + migrações a partir de [`../schema/schema.dbml`](../schema/schema.dbml).
