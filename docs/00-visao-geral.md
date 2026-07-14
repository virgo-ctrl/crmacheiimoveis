# 00 — Visão geral

## Objetivo de negócio

Aumentar a taxa de conversão de lead em venda ao **eliminar leads esquecidos**, **centralizar a comunicação** (omnichannel) e **dar visibilidade gerencial confiável** — atacando diretamente as dores do CRM atual.

## Dores do sistema atual (requisitos-guia)

Estas dores foram levantadas na operação atual e viram **requisitos de primeira classe**. Cada decisão de arquitetura aponta para uma delas (código `D#`).

| # | Dor no sistema atual | Como a arquitetura resolve |
|---|----------------------|-----------------------------|
| D1 | Leads "esquecidos", sem follow-up agendado | Regra *"todo lead ativo precisa de próxima tarefa"* + indicador no funil + job diário que sinaliza leads sem tarefa |
| D2 | Corretores não recebem notificação push (falha de config do app) | Validação de push no cadastro/onboarding + fallback multicanal (push + e-mail + badge) + health-check de token |
| D3 | Dados sujos (nomes inválidos, assinatura de e-mail no campo nome) | Validação obrigatória de telefone/e-mail, normalização e sanitização na entrada |
| D4 | Empreendimentos cadastrados em duplicidade | Checagem de duplicidade *antes de salvar* (fuzzy match) em produtos e leads |
| D5 | Falta de auditoria de quem fez o quê | Log de auditoria imutável em todas as ações relevantes |
| D6 | Perda de histórico ao transferir lead/conversa | Histórico vinculado à entidade, não ao corretor; transferência preserva a timeline |

## Princípios de arquitetura

1. **O dado do lead é a fonte da verdade, a conversa é anexo dele.** Toda mensagem, de qualquer canal, resolve para um `lead_id`. Transferir corretor nunca move ou apaga histórico.
2. **Escopo de dados por permissão, aplicado no backend.** Corretor só enxerga o que é dele; o filtro é de camada de dados (row-level), não de UI.
3. **Qualidade de dados na entrada, não na limpeza.** Validar/normalizar/deduplicar na criação é mais barato que faxina depois.
4. **Auditoria por padrão.** Ação relevante que não gera log é bug.
5. **Integrações desacopladas por eventos.** Portais, redes e chatbots entram por webhooks/filas, nunca acoplados ao core de forma síncrona.
6. **Configurável sem deploy.** Etapas de funil, origens, motivos de perda, campanhas e regras de distribuição são dado, não código.
7. **Multi-tenant desde o dia 1.** `tenant_id` em toda entidade e isolamento por linha.
8. **Idempotência nas bordas.** Todo evento externo carrega `external_id` e é deduplicado antes de virar mensagem/lead.

## Mapa de módulos

```
┌─────────────────────────────────────────────────────────────┐
│                      CRM OMNICHANNEL                          │
├───────────────┬───────────────┬─────────────────────────────┤
│  1. Identidade│  2. Leads     │  3. OMNICHANNEL (núcleo)      │
│  & Acessos    │  (lista/kanban│  inbox unificada, WhatsApp    │
│  (RBAC)       │   + card 360º)│  IG/Messenger/email/chat      │
├───────────────┼───────────────┼─────────────────────────────┤
│  4. Distribui-│  5. Produtos  │  6. Dashboard & Relatórios    │
│  ção de leads │  (imóvel/emp/ │  (com objetivo de decisão)    │
│  (regras+log) │   construtora)│                               │
├───────────────┼───────────────┼─────────────────────────────┤
│  7. Tarefas & │  8. Config    │  9. Qualidade de dados        │
│  Agenda/Push  │  (funil, orig,│  (validação + dedupe)         │
│               │  perda, camp) │                               │
├───────────────┴───────────────┼─────────────────────────────┤
│  10. Auditoria (log imutável)  │ 11. Integrações (webhooks/   │
│                                │     API aberta)              │
└────────────────────────────────┴─────────────────────────────┘
```

Detalhamento de cada módulo nos demais arquivos de `docs/`.
