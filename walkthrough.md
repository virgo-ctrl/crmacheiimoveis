# Walkthrough — CRM Imobiliário Omnichannel

O sistema de CRM imobiliário está completamente implementado, validado e limpo de dados fictícios para submissão ao Git. Foram solucionadas todas as dores e regras comerciais solicitadas, integrando a inteligência de distribuição, qualidade de dados e auditoria contínua de ponta a ponta.

---

## 🚀 Alterações Realizadas

### 1. Reestruturação do Painel de Configurações (Submenus em Abas)
- **Menu Lateral por Abas**: Reformulamos a página [/configuracoes](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/configuracoes/page.tsx) para apresentar um submenu lateral esquerdo contendo abas individuais para cada card de configuração do sistema:
  * **Meu Perfil**: Cadastro e edição de dados do usuário ativo.
  * **Canal WhatsApp API**: Conexões de canais e segredos de APIs.
  * **Etapas do Funil**, **Origens de Leads**, **Motivos de Perda**, **Campanhas**, **Scripts de Qualificação** e **Templates de WhatsApp**.
- **Gerenciamento do Meu Perfil**:
  * Adicionado suporte para atualizar a Foto de Perfil (`avatar_url`) permitindo selecionar fotos de uma biblioteca de presets modernos ou colar qualquer link URL direto de imagem.
  * Inputs para atualizar Nome Completo, E-mail de login, WhatsApp de contato e Redefinição de Senha de acesso.
  * A API de login/perfil [api/auth/me/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/auth/me/route.ts) agora aceita requisições `PUT` para persistir e proteger a troca destas credenciais e dados.
- **Canal WhatsApp & Meta Cloud API**:
  * Adicionamos a aba para gerenciar a conexão de contas do WhatsApp Business API (WABA), Instagram Direct e E-mails da Imobiliária.
  * Permite cadastrar a identidade (número ou @usuario), o tipo de canal, e a referência correspondente de credencial/token salva no cofre de segredos.

### 2. Motor de Distribuição & Canais (D2 / D6)
- **Integração no Webhook WhatsApp**: [api/webhooks/whatsapp/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/webhooks/whatsapp/route.ts) agora consome dinamicamente o helper `distributeLead` para roteamento inteligente de novos leads.
- **Configuração de Regras Padrões de Roteamento**: Adicionado à semeadura inicial em [packages/db/src/database.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/packages/db/src/database.ts) as três regras comerciais padrões do CRM:
  1. **Roleta**: Distribuição por rodízio considerando plantonistas ativos. Critérios pré-definidos: `{"online_only": true, "on_duty_only": true}`.
  2. **Caça-leads**: Reivindicação direta da fila livre de captação. Critérios pré-definidos: `{"limit_per_period": 3, "period_minutes": 10}`.
  3. **Manual**: Encaminhamento para triagem e atribuição pelo gerente/supervisor. Critérios: `{}`.
- **Validação de Limite de Captura no Caça-Leads**: Implementada verificação de limites em [api/leads/[id]/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/leads/%5Bid%5D/route.ts) ao tentar capturar um lead livre. Se a regra ativa for a "Caça-leads", a API verifica no histórico recente se o corretor excedeu o limite máximo (3 capturas nos últimos 10 minutos). Caso tenha excedido, retorna `HTTP 429` com mensagem explicativa.
- **Ativação Única de Regras**: Modificada a API administrativa [api/admin/rules/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/admin/rules/route.ts) para garantir que sempre que uma regra é criada ou alterada para ativa, as demais sejam definidas como inativas automaticamente.

### 3. Central de Deduplicação (D3 / D4)
- **API Administrativa**: [api/admin/dedupe/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/admin/dedupe/route.ts) expõe a listagem de candidatos suspeitos e a ação de mesclagem (`merge` ou `ignore`).
- **Lógica de Merge**: A mesclagem atualiza o status do lead secundário para `merged`, seta a coluna `duplicate_of` para o ID do principal e transfere todo o histórico de conversas e linha do tempo de eventos para o registro principal.
- **Tela Central**: Criada a página [/deduplicacao](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/deduplicacao/page.tsx) com comparativo lado a lado dos registros duplicados.

### 4. Auditoria Estendida (D5)
- **Visualização de Leads**: [api/leads/[id]/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/leads/%5Bid%5D/route.ts) agora cria logs do tipo `lead.viewed` no `audit_log` sempre que o drawer de um lead é aberto.
- **Exportação Auditada**: Criada a API [api/leads/export/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/leads/export/route.ts) para gerar downloads de relatórios CSV dos leads e logar o evento `lead.exported` na auditoria imutável.

### 5. Catálogo de Produtos e Construtoras Parceiras (D4)
- **Vínculo Opcional com Construtora**: Adicionamos a opção de atrelar tanto Empreendimentos quanto Unidades Individuais (imóveis de estoque/avulsos) a uma construtora parceira.
  * A tabela `properties` agora possui a coluna `developer_id` com chave estrangeira direcionando para a tabela `developers`.
  * Atualizamos a listagem da API de produtos em [api/products/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/products/route.ts) para buscar o nome da construtora vinculada diretamente à unidade (`developerName`).
  * Atualizamos o modal de adicionar/editar unidades em [/imoveis](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/imoveis/page.tsx) para incluir um dropdown seletor de "Construtora Vinculada", além de incluir essa coluna na tabela visual do estoque.
- **Cadastro Completo de Construtoras (Endereço)**: Adicionado suporte para os campos de endereço no cadastro de construtoras parceiras. A tabela `developers` agora possui as colunas: Endereço (`address`), Número (`number`), País (`country`), Estado (`state`), Cidade (`city`), Bairro (`neighborhood`), CEP (`zip`) e Complemento (`complement`).
- **Formulário de Cadastro**: O modal de construtoras em [/imoveis](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/imoveis/page.tsx) foi atualizado para conter inputs de texto e selects correspondentes a todos estes novos dados, e a tabela de exibição agora possui colunas para visualizar o endereço e a cidade/estado do parceiro.

### 6. Detalhes do Lead (D1 / D6)
- **Gaveta de Leads**: O [/leads](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/leads/page.tsx) agora possui seleção de múltiplos empreendimentos de interesse, cadastro de tags de qualificação livre, seleção obrigatória de motivo de perda nas etapas inativas e visualização do roteiro de perguntas/scripts.

### 7. Dashboard, Inbox e Simulador
- **Simulador Omnichannel**: Criada a API [api/webhooks/simulator/route.ts](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/api/webhooks/simulator/route.ts) para simular entrada de leads por Instagram DM, Messenger, E-mail, Chat do Site e Portais (como OLX).
- **Inbox Melhorado**: Página [/inbox](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/inbox/page.tsx) com painel simulador integrado, respostas rápidas estruturadas e transferência de atendimento para outros corretores.
- **Painel do Caça-Leads**: Página [/dashboard](file:///c:/Users/Eduardo%20Arruda/Documents/Trabalho/Sistemas/Imobili%C3%A1ria%20CRM/apps/web/src/app/%28app%29/dashboard/page.tsx) integrada com o widget de captura livre de leads, além de gráficos de pizza para canais, temperatura, taxas de conversão de funil e ranking financeiro por equipes.

### 8. Limpeza de Dados Fictícios de Produção (Purge)
- A função de semeadura em `packages/db/src/database.ts` foi modificada para remover os registros fictícios de leads, tarefas, conversas e mensagens comerciais, bem como construtoras, empreendimentos e unidades demonstrativas.
- Mantivemos apenas a estrutura cadastral e de acessos iniciais necessária para o funcionamento e login do sistema (perfis padrão, permissões RBAC, canais ativos, campanhas de config, motivos de perda, scripts de qualificação vazios e as três regras padrões inseridas).
- O banco de dados SQLite `crm.db` foi recriado de forma limpa, livre de dados falsos e totalmente pronto para Git e produção.

---

## 🔍 Validação

1. **Build e Tipagem**: O projeto compila com sucesso (`pnpm build`) sem erros de lint ou tipos de TypeScript.
2. **Servidor Local**: Ativado em [http://localhost:3000](http://localhost:3000).
