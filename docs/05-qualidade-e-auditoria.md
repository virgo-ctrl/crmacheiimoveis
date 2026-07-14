# 05 — Qualidade de dados e Auditoria

## Qualidade de dados (pilar crítico)

### Validação na entrada (resolve D3)

Todo ponto de criação de lead — formulário, importação de portal, digitação manual, criação via canal — passa pelo **mesmo serviço de validação** antes de persistir:

- **Telefone:** normaliza para E.164, valida DDI/DDD/comprimento; rejeita números impossíveis.
- **E-mail:** valida sintaxe e, opcionalmente, MX; marca suspeitos.
- **Nome:** heurística anti-lixo — rejeita/limpa nomes com URLs, múltiplas quebras de linha, trechos de assinatura ("Enviado do meu iPhone", "Atenciosamente…"), excesso de caracteres. Casos duvidosos vão para revisão em vez de sujar a base.
- **Origem obrigatória:** todo lead precisa de `source_id`/`tracking_source` — sem origem, relatório de canal fica cego.

### Deduplicação (resolve D3/D4)

- **Preventiva (antes de salvar):** ao criar lead, busca telefone/e-mail idêntico ou *fuzzy* de nome; se casar, avisa "possível duplicado de LD-xxxx" e deixa o operador decidir. Ao criar empreendimento/construtora, `fuzzy match` de nome + CNPJ bloqueia duplicata (o problema encontrado no CRM de referência).
- **Detectiva (rotina periódica):** job varre a base gerando `dedupe_candidates` com `match_score`; gerente revisa e faz `merge` (união preserva timeline e conversas de ambos).

### Indicador de duplicidade no card

O card do lead mostra um selo quando `dedupe_status = suspect`, com link para o candidato — o corretor vê na hora que pode ser o mesmo cliente.

## Auditoria (resolve D5)

`audit_log` é **append-only** (sem UPDATE/DELETE; idealmente particionado por data) e registra toda ação relevante com ator, antes/depois, entidade, IP e timestamp. Eventos mínimos a logar:

- Abertura de ficha de lead (`lead.viewed`) — quem abriu qual lead
- Edição de etapa/situação (`lead.stage_changed`)
- Transferência/redistribuição de lead (`lead.transferred`)
- Exportação de dados (`data.exported`) — quem exportou o quê e quanto
- Mudança de permissão/papel (`role.changed`)
- Envio/edição/aprovação de proposta (`proposal.*`)

A tela de auditoria (Admin = tudo, Gerente = a própria equipe) permite filtrar por ator, entidade, ação e período. Como é imutável, serve para governança interna e eventual exigência legal/LGPD.
