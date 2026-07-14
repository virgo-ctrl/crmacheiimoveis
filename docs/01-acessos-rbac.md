# 01 — Acessos e RBAC

## Modelo de permissão adotado

**RBAC + escopo de dados (data scope)** em duas camadas:

- **Camada 1 — Papel (role):** define *quais ações* o usuário pode executar (permissões granulares). Ex: `lead.transfer`, `proposal.approve`, `report.export`.
- **Camada 2 — Escopo (scope):** define *sobre quais linhas* aquelas ações valem — `self` (só o próprio), `team` (a equipe que gerencia) ou `all` (todo o tenant).

Assim "Corretor pode editar lead" = "editar **os seus** leads" e "Admin pode editar lead" = "editar **qualquer** lead" — mesma permissão, escopos diferentes. O escopo é resolvido **no backend** (row-level security), nunca só escondendo botão na tela.

## Os três perfis

| Perfil | Escopo padrão | Missão | Não pode |
|--------|---------------|--------|----------|
| **Admin** | `all` | Configurar o sistema, gerir usuários/permissões, ver relatórios globais, integrações | — (acesso total; ações destrutivas ficam logadas) |
| **Gerente / Supervisor** | `team` | Gerir a própria equipe: redistribuir leads, aprovar propostas, acompanhar performance | Ver dados de outras equipes, config global, integrações |
| **Corretor** | `self` | Atender e converter os próprios leads, conversar, cumprir tarefas | Ver leads/conversas de outros, redistribuir, aprovar proposta, exportar em massa |

Notas de modelagem:

- **Gerente também é corretor de si mesmo:** o escopo `team` inclui os leads dele próprio.
- **Um usuário pode gerenciar mais de uma equipe** → relação usuário↔equipe é N:N com papel na associação (`team_members.role_in_team`), não um `team_id` fixo no usuário.
- **Perfis são ponto de partida, não camisa de força.** Com permissões granulares dá para criar um "Corretor Sênior" que aprova proposta sem virar gerente. Guarde papéis como dado (`roles` + `role_permissions`), não como `enum`.

## Matriz de permissões granulares

Escopo: **S** = self · **T** = team · **A** = all · **—** = sem acesso

| Domínio | Permissão (chave) | Corretor | Gerente | Admin |
|---------|-------------------|:-------:|:-------:|:-----:|
| **Leads** | `lead.view` | S | T | A |
| | `lead.create` | S | T | A |
| | `lead.edit` | S | T | A |
| | `lead.transfer` | — | T | A |
| | `lead.delete` | — | — | A |
| | `lead.export` | — | T | A |
| | `lead.merge` | — | T | A |
| **Conversas / Omnichannel** | `conversation.view` | S | T | A |
| | `conversation.reply` | S | T | A |
| | `conversation.transfer` | — | T | A |
| | `conversation.template.use` | S | T | A |
| | `conversation.template.manage` | — | T | A |
| **Propostas** | `proposal.create` | S | T | A |
| | `proposal.approve` | — | T | A |
| **Distribuição** | `distribution.rule.manage` | — | — | A |
| | `distribution.grab` (caça-leads) | S | T | A |
| | `distribution.redistribute` | — | T | A |
| **Tarefas / Agenda** | `task.manage` | S | T | A |
| | `schedule.shift.manage` | — | T | A |
| **Produtos** | `product.view` | A¹ | A¹ | A |
| | `product.manage` | — | — | A² |
| **Dashboard / Relatórios** | `dashboard.operational` | S | T | A |
| | `report.managerial` | — | T | A |
| | `report.export` | — | T | A |
| **Configurações** | `config.funnel/sources/loss/campaign` | — | — | A |
| **Time & Permissões** | `user.manage` | — | —³ | A |
| | `team.manage` | — | —³ | A |
| | `role.manage` | — | — | A |
| **Auditoria** | `audit.view` | — | T⁴ | A |
| **Integrações** | `integration.manage` | — | — | A |

Notas:
¹ Catálogo de produtos é compartilhado — todo corretor vê imóveis/empreendimentos para vincular ao lead. O que muda por perfil é *gerir* o catálogo.
² Cadastro de produto pode ser delegado a um papel "Cadastrista" via permissão granular, sem dar Admin.
³ Gerente pode *solicitar* mudança de time, mas quem efetiva é o Admin. Configurável.
⁴ Gerente vê auditoria restrita à sua equipe.

## Regras de escopo aplicadas (row-level)

Toda leitura de dado sensível passa por um filtro obrigatório, resolvido a partir do `scope` da permissão:

```
scope = self  →  WHERE responsible_broker_id = :current_user
scope = team  →  WHERE responsible_broker_id IN (SELECT broker_id
                        FROM team_members WHERE team_id IN :managed_teams)
scope = all   →  WHERE tenant_id = :current_tenant
```

**Implementar como política de linha no banco (row-level security), não só no serviço de aplicação.** Assim, mesmo um endpoint novo escrito com pressa não vaza dado de outro corretor — o banco recusa.
