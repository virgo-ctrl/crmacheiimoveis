# 03 — Núcleo Omnichannel

O coração do sistema. É, na prática, um **agregador de canais** que normaliza mensagens de origens diferentes em um formato único e as vincula a leads.

## Arquitetura em camadas

```
   Canais externos            Camada de ingestão           Core CRM
 ┌────────────────┐        ┌──────────────────────┐    ┌──────────────┐
 │ WhatsApp Cloud │──webhook──▶  Gateway de        │    │   Lead       │
 │ API (Meta)     │        │   Canais (adapters)   │    │   Resolver   │
 ├────────────────┤        │  - valida assinatura  │───▶│ (telefone/   │
 │ Instagram DM   │──webhook──▶ - dedup external_id │    │  email→lead) │
 ├────────────────┤        │  - normaliza p/       │    └──────┬───────┘
 │ Messenger      │──webhook──▶  Mensagem canônica  │           │
 ├────────────────┤        │  - enfileira          │           ▼
 │ E-mail (IMAP/  │──poll/hook─▶                    │    ┌──────────────┐
 │  API)          │        └──────────┬────────────┘    │ Conversa +   │
 ├────────────────┤                   │                 │ Timeline     │
 │ Webchat site   │──websocket────────┘                 └──────┬───────┘
 └────────────────┘                                            ▼
                                                        ┌──────────────┐
   Envio (saída) ◀───── Gateway de Canais ◀──────────── │ Inbox do     │
                                                        │ corretor(UI) │
                                                        └──────────────┘
```

Cada canal tem um **adapter** que traduz o payload nativo para a **Mensagem Canônica** `{lead_ref, channel, direction, content, external_id, occurred_at}`. Adicionar canal no futuro = escrever um adapter, sem tocar no core.

## Vinculação automática ao lead (Lead Resolver)

Quando uma mensagem entra:

1. **Match por identidade de canal:** telefone (WhatsApp), `@handle`/PSID (Instagram/Messenger), e-mail remetente ou `session_id` (webchat) → procura lead existente.
2. **Achou lead:** anexa à `conversation` daquele lead+canal (cria a conversa se for o primeiro contato nesse canal).
3. **Não achou:** cria **lead novo** (origem = o canal), dispara o motor de distribuição (ver [`04-distribuicao.md`](./04-distribuicao.md)) e cria a conversa.
4. **Ambíguo (duplicado):** se telefone/e-mail casar com mais de um lead, anexa ao mais recente ativo e abre um `dedupe_candidate`.

Resultado: **nenhuma conversa fica órfã** e o histórico sempre mora no lead — não no corretor.

## Transferência sem perda de histórico (D6)

Transferir conversa/lead muda apenas `assigned_broker_id`/`responsible_broker_id` e grava em `lead_transfers` + `audit_log`. Mensagens continuam ligadas à `conversation`, que continua ligada ao `lead`. O corretor novo vê tudo; o antigo perde o acesso (escopo `self`). Zero cópia, zero perda.

## WhatsApp — Cloud API oficial (Meta)

Decisão tomada: **Cloud API oficial** (não BSP). Regras da plataforma a respeitar:

- **Recebimento:** Meta envia webhooks para um endpoint público seu; valide a assinatura (`X-Hub-Signature-256`) e responda 200 rápido — processe assíncrono (fila), nunca síncrono.
- **Janela de 24h:** só é possível enviar mensagem livre dentro de 24h após a última mensagem do cliente. Fora dela, **só template aprovado**. Por isso `conversations.wa_window_expires_at` existe — a UI mostra "janela aberta/fechada" e, fora da janela, força escolher um template.
- **Templates:** mensagens fora da janela e proativas usam *message templates* aprovados pela Meta. Guarde `wa_approval_status` e só ofereça aprovados.
- **Números e escala:** um WABA com um ou mais números; cada número tem *quality rating* e limites de envio que sobem com reputação. Planeje número→equipe/plantão.
- **Segredos:** tokens em cofre de segredos (`channels.credentials_ref`), com rotação. Nunca no banco em claro nem no front.
- **Idempotência:** o mesmo webhook pode chegar 2x; deduplique por `messages.external_id`.

> Trade-off: a Cloud API oficial reduz custo de intermediário e dá controle, mas exige que **você** cuide de aprovação de templates, janela de 24h, webhooks resilientes e *quality rating*. Um BSP (Twilio/360dialog) abstrairia isso a um custo por mensagem.

## Presença e status

`users.presence` (online/offline/typing) e `messages.status` (enviado/entregue/lido/falhou) alimentam a UI. Presença trafega por WebSocket; "digitando" é efêmero. Não-lido é `conversations.unread_count`, zerado quando o corretor abre a thread.

## Notificações confiáveis (resolve D2)

Ataca o problema de push que não chega em três frentes:

1. **Validação no onboarding:** ao logar no app, pede permissão de push, registra `push_token` e faz um **teste de entrega**; só marca `push_validated_at` quando o dispositivo confirma. Sem isso, o perfil aparece com selo "push não configurado" no painel do gerente.
2. **Fallback multicanal:** toda notificação crítica (novo lead, tarefa atrasada) tenta push → se sem token válido, cai para e-mail e badge in-app.
3. **Health-check periódico:** job testa tokens e reabre o fluxo de re-permissão para quem "silenciou".
