# AGENTS.md — contexto para o agente de desenvolvimento

Este arquivo orienta qualquer agente de IA (Antigravity e afins) que for implementar este sistema. Leia-o inteiro antes de gerar código. As especificações detalhadas estão em [`docs/`](./docs) e o modelo de dados em [`schema/schema.dbml`](./schema/schema.dbml).

## 1. O que é o produto

Um **CRM de vendas para o mercado imobiliário** cujo diferencial e núcleo é um **canal omnichannel**: uma caixa de entrada unificada onde o corretor conversa com o lead por WhatsApp (API oficial), Instagram Direct, Messenger, e-mail e chat do site — tudo na mesma tela, com cada conversa vinculada automaticamente ao card do lead.

Ao redor do núcleo: gestão de leads (lista + Kanban), distribuição inteligente de leads, gestão de produtos (imóveis/empreendimentos/construtoras), dashboards e relatórios, configurações do funil e um pilar forte de **qualidade de dados e auditoria**.

## 2. Princípios inegociáveis (não viole ao implementar)

1. **O lead é a fonte da verdade; a conversa é anexo dele.** Toda mensagem, de qualquer canal, resolve para um `lead_id`. Transferir corretor **nunca** move nem apaga histórico (`D6`).
2. **Escopo de dados por permissão, aplicado no backend.** Corretor só enxerga o que é dele. O filtro é de camada de dados (row-level), não de UI. Implemente como política de linha no banco, não só no serviço. Ver [`docs/01-acessos-rbac.md`](./docs/01-acessos-rbac.md).
3. **Qualidade de dados na entrada, não na limpeza.** Validar/normalizar/deduplicar no momento da criação (`D3`, `D4`). Ver [`docs/05-qualidade-e-auditoria.md`](./docs/05-qualidade-e-auditoria.md).
4. **Auditoria por padrão.** Ação relevante que não gera log é bug (`D5`). `audit_log` é append-only.
5. **Integrações desacopladas por eventos.** Portais, redes e chatbots entram por webhooks/filas, nunca síncronos no core. Um portal fora do ar não pode derrubar o CRM.
6. **Configurável sem deploy.** Etapas de funil, origens, motivos de perda, campanhas e regras de distribuição são **dado**, não código.
7. **Multi-tenant desde o dia 1.** `tenant_id` em toda entidade + isolamento por linha.
8. **Idempotência nas bordas.** Webhooks de canais/portais chegam repetidos; todo evento externo carrega `external_id` e é deduplicado antes de virar mensagem/lead.

## 3. Dores do sistema atual = requisitos de primeira classe

Cada decisão de arquitetura aponta para uma destas. Ao implementar uma feature, verifique se ela respeita a dor correspondente.

| Código | Dor | Onde é resolvida |
|--------|-----|------------------|
| `D1` | Leads esquecidos, sem follow-up agendado | Regra "todo lead ativo precisa de próxima tarefa" + indicador no funil + job diário — [`docs/06-leads-dashboard.md`](./docs/06-leads-dashboard.md) |
| `D2` | Corretor não recebe push (falha de config do app) | Validação de push no onboarding + fallback multicanal + health-check — [`docs/03-omnichannel.md`](./docs/03-omnichannel.md) |
| `D3` | Dados sujos (nome inválido, assinatura de e-mail no campo nome) | Validação obrigatória de telefone/e-mail + sanitização — [`docs/05-qualidade-e-auditoria.md`](./docs/05-qualidade-e-auditoria.md) |
| `D4` | Empreendimentos duplicados | Checagem de duplicidade (fuzzy) antes de salvar — [`docs/05-qualidade-e-auditoria.md`](./docs/05-qualidade-e-auditoria.md) |
| `D5` | Falta de auditoria | `audit_log` imutável em toda ação relevante — [`docs/05-qualidade-e-auditoria.md`](./docs/05-qualidade-e-auditoria.md) |
| `D6` | Perda de histórico ao transferir | Histórico vinculado à entidade, não ao corretor — [`docs/03-omnichannel.md`](./docs/03-omnichannel.md) |

## 4. Perfis de acesso (resumo)

- **Admin** — escopo `all`: config, permissões, integrações, relatórios globais.
- **Gerente/Supervisor** — escopo `team`: redistribui leads, aprova propostas, vê o time.
- **Corretor** — escopo `self`: seus leads, conversas e tarefas.

Permissão = **papel (ação)** + **escopo (self/team/all)**. Papéis e permissões são dado (`roles`, `permissions`, `role_permissions`), não `enum` no código. Matriz completa em [`docs/01-acessos-rbac.md`](./docs/01-acessos-rbac.md).

## 5. Convenções de código e dados

- **Nomenclatura de banco:** `snake_case`, inglês. FKs no padrão `<entidade>_id`. Ver `schema/schema.dbml` como fonte da verdade.
- **Telefone:** sempre E.164. **E-mail:** validado na sintaxe. Rejeitar/sanitizar nomes com lixo (URLs, quebras de linha, trechos de assinatura).
- **Timestamps:** UTC no banco; conversão de fuso na apresentação.
- **Segredos:** tokens de canal em cofre de segredos; `channels.credentials_ref` aponta para a referência, nunca o segredo em claro.
- **Eventos externos:** processar assíncrono (fila); responder webhook 200 rápido.

## 5.1 Estrutura de pastas

O esqueleto do sistema já existe no repositório (`apps/`, `packages/`, `supabase/`, `n8n/`, `infra/`). **Respeite os limites de módulo e as regras de dependência** descritas em [`docs/09-estrutura-de-pastas.md`](./docs/09-estrutura-de-pastas.md). Regra de ouro: `packages/core` é o domínio e não importa framework nem banco concreto — adapters (`db`, `channels`, `integrations`) implementam interfaces do core; `apps/*` orquestram.

## 6. Ordem de implementação sugerida

Priorize provar o núcleo antes de sofisticar relatórios. Detalhe em [`docs/08-roadmap.md`](./docs/08-roadmap.md):

`Fase 0` fundação (dados, auth, RBAC row-level) → `Fase 1` lead + qualidade de dados → `Fase 2` omnichannel WhatsApp → `Fase 3` distribuição + notificações → `Fase 4` demais canais → `Fase 5` dashboards/relatórios/auditoria → `Fase 6` integrações + API aberta.

## 7. Decisões em aberto (confirmar com o dono antes de codar)

- **Stack de implementação.** A spec é agnóstica. Stack de referência do dono: **Next.js + Supabase (Postgres + Auth + RLS + Realtime) + n8n** para automações/integrações. Confirmar antes de escrever código.
- **WhatsApp:** decisão tomada = **Cloud API oficial da Meta** (não BSP). Implica gerir aprovação de templates, janela de 24h e webhooks resilientes — ver [`docs/03-omnichannel.md`](./docs/03-omnichannel.md).
- **Multi-tenant:** assumido `true`. Se for uma única imobiliária, `tenant_id` pode ser fixo, mas mantenha a coluna.

## 8. O que NÃO fazer

- Não esconder dado só na UI achando que é segurança — filtre no banco.
- Não acoplar integração externa de forma síncrona ao core.
- Não gravar mudança de etapa/transferência/exportação sem escrever em `audit_log`.
- Não criar lead/empreendimento sem passar pela validação e checagem de duplicidade.
- Não transformar papéis/etapas/origens em `enum` de código — são configuráveis.
