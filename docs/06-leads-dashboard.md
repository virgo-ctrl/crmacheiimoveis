# 06 — Leads, Dashboard, Relatórios e Configurações

## Gestão de Leads (lista + Kanban + card 360º)

### Duas visões, mesmos filtros

Lista (tabela) e Kanban compartilham o **mesmo conjunto de filtros** do dashboard (corretor, equipe, imóvel, empreendimento, lançamento, construtora, período, origem, temperatura, etapa). Trocar de visão nunca reseta o filtro. No Kanban, cada coluna é uma `funnel_stage` e mover o card muda `stage_id` (gravando timeline + auditoria).

### Card do lead — conteúdo (checklist de implementação)

- **Cadastro:** nome, telefone, e-mail, data/hora de entrada
- **Valor estimado** do lead
- **Empreendimento(s) de interesse** (`lead_interests`)
- **Origem / fonte de rastreamento** (portal, site, social, indicação)
- **Temperatura** (frio/morno/quente)
- **Tipo de campanha** (`campaign_id`)
- **Código único** (`code`)
- **Corretor responsável** + **histórico de transferências** (`lead_transfers`)
- **Etapa atual** e **motivo de perda** (quando aplicável)
- **Última interação** e canal usado
- **Próxima tarefa/agendamento** (ou alerta "sem tarefa" — D1)
- **Selo de possível duplicidade** (D3/D4)
- **Linha do tempo** completa (mensagens + mudanças de etapa + transferências)
- **Observações / tags livres**

## Dashboard e Relatórios

Princípio: **todo gráfico declara a decisão que apoia.** Não é gráfico por enfeite.

### Filtros globais

Corretor · equipe · imóvel · empreendimento · lançamento · construtora · período · origem. Aplicados a todos os widgets e respeitando o escopo do perfil (corretor vê só o seu; gerente, o time; admin, tudo).

### Gráficos e objetivo de decisão

| Widget | Tipo | Pergunta que responde | Decisão que apoia |
|--------|------|------------------------|-------------------|
| Distribuição de leads | **Pizza** | Quais canais/temperaturas/situações concentram meus leads? | Onde **investir mais verba** e onde cortar |
| Evolução de leads e vendas | **Linha** | Como o volume varia no tempo? | Detectar **sazonalidade** e **quedas** cedo |
| Ranking corretores / VGV por empreendimento | **Tabela** | Quem produz mais? Qual empreendimento gera mais VGV? | **Comparar** corretores/equipes, priorizar produto |

### Tabela de tarefas (operacional)

Tarefas **pendentes, atrasadas e agendadas para hoje**, com **alerta visual** (cor por urgência) e **notificação push confiável** (mecanismo do [`03-omnichannel.md`](./03-omnichannel.md) — D2).

### Tabela de funil de vendas

Quantidade e **valor (R$) por etapa**, com **indicador de leads sem tarefa planejada** destacado (D1 — o maior problema atual). Um job diário recalcula, para cada lead ativo, se existe `task` futura; se não, entra no contador "sem follow-up" — número vermelho no funil e fila de ação para o gerente.

### Relatórios gerenciais

- **Conversão por etapa** — onde o funil vaza
- **VGV** e **ticket médio**
- **Previsão de vendas** — projeção com base no volume de leads em aberto × taxa histórica de conversão por etapa
- **Ranking** de corretores e equipes
- **Relatório de origem/campanha** — quais canais geram mais **leads** e, crucialmente, mais **vendas** (não é o mesmo)

Todos exportáveis (com log de exportação — D5) e respeitando escopo de perfil.

## Configurações

Tudo abaixo é **dado editável pelo Admin**, sem deploy:

- **Etapas do funil** — nome, ordem, se é ganho/perda, SLA opcional
- **Origens / fontes de lead**
- **Motivos de perda**
- **Script de qualificação** — roteiro do primeiro contato
- **Campanhas**

Cada mudança de config é versionada em auditoria.
