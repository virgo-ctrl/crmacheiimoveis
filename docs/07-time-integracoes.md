# 07 — Time, Permissões e Integrações

## Gestão de Time e Permissões

- **Cadastro** de funcionários, corretores e equipes (`users`, `teams`, `team_members`)
- **Escalas de plantão** (`shifts`): locais, calendário, visão por corretor e por gerente — alimenta o critério "plantão ativo" da distribuição (ver [`04-distribuicao.md`](./04-distribuicao.md))
- **Permissões granulares por perfil** (ver [`01-acessos-rbac.md`](./01-acessos-rbac.md)): Admin edita papéis e escopos; a matriz é dado, não código

## Integrações

### Princípio: desacoplamento por eventos

Toda integração externa entra por **webhook/fila** com **idempotência** (`external_id`) e um **adapter** que normaliza para as entidades internas. Um portal fora do ar não pode travar o CRM.

### Integrações previstas

| Categoria | Serviços | Papel |
|-----------|----------|-------|
| **Portais imobiliários** | OLX, VivaReal, Zap Imóveis | Leads dos anúncios → viram `leads` com origem = portal |
| **Redes / Ads** | Facebook/Instagram Lead Ads | Lead form → lead + campanha vinculada |
| **Automação de marketing** | RD Station | Sincroniza leads/estágios, nutrição |
| **Chatbots** | Bot Conversa, JivoChat, Lais.ai | Qualificam e entregam a conversa ao corretor via omnichannel |
| **Formulários externos** | Landing pages, sites | Webhook → lead validado |
| **API aberta** | REST/Webhooks públicos | Integrações futuras |

### API aberta

Publicar uma **API REST + webhooks** documentada (com chave por tenant e escopos) desde cedo. Transforma o CRM em plataforma: parceiros e sistemas internos integram sem depender do time. A ingestão de canais e portais deve consumir a *mesma* API interna — dogfooding que garante que ela funciona.
