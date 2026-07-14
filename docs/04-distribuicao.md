# 04 — Distribuição de leads

O lead recém-criado (por formulário, portal, canal ou manual) entra no **motor de distribuição**, que avalia `distribution_rules` por prioridade e escolhe o corretor.

## Motor de regras configuráveis

| Modo | Como funciona | Quando usar |
|------|---------------|-------------|
| **Manual** | Gerente/Admin atribui na mão | Leads VIP, casos especiais |
| **Fila / Roleta** | Round-robin entre corretores elegíveis | Distribuição justa por padrão |
| **Caça-leads (grab)** | Lead cai num pool; o primeiro que "pega" fica com ele | Times competitivos, resposta rápida |
| **Automático por critério** | Regras: região, empreendimento de interesse, carga atual do corretor, horário de plantão | Operações grandes com especialização |

## Fluxo de decisão

```
Novo lead ──▶ Filtra corretores ELEGÍVEIS
                (plantão ativo? região? empreendimento? carga < limite?)
                        │
              ┌─────────┴──────────┐
         nenhum elegível      há elegíveis
              │                     │
        pool "caça-leads"     aplica modo da regra
        + alerta gerente      (roleta/critério/manual)
                                    │
                              atribui + grava distribution_log
                                    │
                              cria conversa + notifica corretor (push→fallback)
```

## Auditoria da distribuição

Cada atribuição grava em `distribution_log`: qual regra decidiu, qual corretor recebeu e o motivo (`decision_reason`, ex: "roleta — próximo da fila" ou "critério região=Zona Sul + plantão ativo"). Isso responde à exigência de saber *por que aquele lead foi para aquele corretor* — essencial para resolver disputas e ajustar regras.

## Critérios de elegibilidade (entrada do `criteria` json)

- **Plantão ativo:** casar `now()` com `shifts` do corretor (ver [`07-time-integracoes.md`](./07-time-integracoes.md)).
- **Região:** casar `leads.tracking_source`/interesse com região do corretor.
- **Empreendimento:** corretor especializado no `development_id` de interesse.
- **Carga atual:** contagem de leads ativos do corretor abaixo de um limite configurável.
