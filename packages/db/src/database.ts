import { join } from "node:path";

// Initialize persistent SQLite database path
const dbPath = join(process.cwd(), "crm.db");

// Connection variable private to the module
let dbConnection: any = null;

// Export getter function to retrieve connection (avoids CommonJS copy-by-value bundling bugs)
export function getRawDb() {
  return dbConnection;
}

// Initialize Database Schema
export function initDb() {
  if (!dbConnection) {
    // Bulletproof eval('require') to completely bypass compile-time bundlers (Webpack, Turbopack)
    // and load node:sqlite natively at runtime in Node.js.
    const { DatabaseSync } = eval("require")("node:sqlite");
    dbConnection = new DatabaseSync(dbPath);
    // Enable foreign keys
    dbConnection.exec("PRAGMA foreign_keys = ON;");
  }

  // Create tables in order
  dbConnection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      status TEXT CHECK(status IN ('ativo', 'inativo')) DEFAULT 'ativo',
      avatar_url TEXT,
      push_token TEXT,
      push_validated_at TEXT,
      last_seen_at TEXT,
      presence TEXT DEFAULT 'offline',
      password TEXT NOT NULL DEFAULT 'password123',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_system INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      domain TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT,
      permission_id TEXT,
      scope TEXT NOT NULL CHECK(scope IN ('self', 'team', 'all')),
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT,
      role_id TEXT,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT,
      user_id TEXT,
      role_in_team TEXT CHECK(role_in_team IN ('member', 'manager')),
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      team_id TEXT,
      user_id TEXT,
      location TEXT,
      starts_at TEXT,
      ends_at TEXT,
      recurrence TEXT,
      FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lead_sources (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS funnel_stages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      "order" INTEGER,
      is_won INTEGER DEFAULT 0,
      is_lost INTEGER DEFAULT 0,
      sla_hours INTEGER
    );

    CREATE TABLE IF NOT EXISTS loss_reasons (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS qualification_scripts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      entered_at TEXT,
      estimated_value REAL,
      source_id TEXT,
      tracking_source TEXT,
      campaign_id TEXT,
      temperature TEXT CHECK(temperature IN ('frio', 'morno', 'quente')),
      stage_id TEXT,
      loss_reason_id TEXT,
      responsible_broker_id TEXT,
      last_interaction_at TEXT,
      last_interaction_channel TEXT,
      next_task_id TEXT,
      duplicate_of TEXT,
      dedupe_status TEXT CHECK(dedupe_status IN ('unique', 'suspect', 'merged')) DEFAULT 'unique',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES lead_sources (id) ON DELETE SET NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE SET NULL,
      FOREIGN KEY (stage_id) REFERENCES funnel_stages (id) ON DELETE SET NULL,
      FOREIGN KEY (loss_reason_id) REFERENCES loss_reasons (id) ON DELETE SET NULL,
      FOREIGN KEY (responsible_broker_id) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (duplicate_of) REFERENCES leads (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS developers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cnpj TEXT,
      contact TEXT,
      address TEXT,
      number TEXT,
      country TEXT,
      state TEXT,
      city TEXT,
      neighborhood TEXT,
      zip TEXT,
      complement TEXT,
      UNIQUE(tenant_id, cnpj)
    );

    CREATE TABLE IF NOT EXISTS developments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      developer_id TEXT,
      name TEXT NOT NULL,
      type TEXT,
      address TEXT,
      city TEXT,
      region TEXT,
      status TEXT,
      vgv REAL,
      normalized_key TEXT,
      FOREIGN KEY (developer_id) REFERENCES developers (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      development_id TEXT,
      developer_id TEXT,
      code TEXT,
      type TEXT,
      price REAL,
      area REAL,
      bedrooms INTEGER,
      status TEXT CHECK(status IN ('disponível', 'reservado', 'vendido')) DEFAULT 'disponível',
      FOREIGN KEY (development_id) REFERENCES developments (id) ON DELETE SET NULL,
      FOREIGN KEY (developer_id) REFERENCES developers (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lead_interests (
      lead_id TEXT,
      development_id TEXT,
      property_id TEXT,
      priority INTEGER,
      PRIMARY KEY (lead_id, development_id),
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (development_id) REFERENCES developments (id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lead_tags (
      lead_id TEXT,
      tag TEXT,
      PRIMARY KEY (lead_id, tag),
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lead_transfers (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      from_broker_id TEXT,
      to_broker_id TEXT,
      reason TEXT,
      by_user_id TEXT,
      via_rule_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (from_broker_id) REFERENCES users (id),
      FOREIGN KEY (to_broker_id) REFERENCES users (id),
      FOREIGN KEY (by_user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      type TEXT NOT NULL,
      channel TEXT,
      actor_id TEXT,
      payload TEXT,
      occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
      identity TEXT,
      owner_user_id TEXT,
      status TEXT,
      credentials_ref TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT,
      channel_id TEXT,
      assigned_broker_id TEXT,
      status TEXT CHECK(status IN ('open', 'pending', 'closed')) DEFAULT 'open',
      unread_count INTEGER DEFAULT 0,
      last_message_at TEXT,
      wa_window_expires_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_broker_id) REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      channel_type TEXT,
      name TEXT,
      category TEXT,
      body TEXT,
      variables TEXT,
      wa_approval_status TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      external_id TEXT UNIQUE,
      sender TEXT,
      content_type TEXT CHECK(content_type IN ('text', 'image', 'audio', 'doc', 'template')),
      body TEXT,
      media_url TEXT,
      template_id TEXT,
      status TEXT CHECK(status IN ('sent', 'delivered', 'read', 'failed')),
      occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES message_templates (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT,
      broker_id TEXT,
      type TEXT CHECK(type IN ('ligação', 'visita', 'follow-up')),
      title TEXT,
      due_at TEXT,
      status TEXT CHECK(status IN ('pending', 'done', 'overdue', 'scheduled')) DEFAULT 'pending',
      done_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (broker_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT,
      property_id TEXT,
      value REAL,
      status TEXT CHECK(status IN ('draft', 'pending_approval', 'approved', 'rejected')) DEFAULT 'draft',
      approved_by TEXT,
      created_by TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users (id),
      FOREIGN KEY (created_by) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS distribution_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL CHECK(type IN ('manual', 'queue', 'roleta', 'grab', 'auto')),
      criteria TEXT,
      priority INTEGER,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS distribution_log (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      rule_id TEXT,
      assigned_broker_id TEXT,
      decision_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE,
      FOREIGN KEY (rule_id) REFERENCES distribution_rules (id),
      FOREIGN KEY (assigned_broker_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS dedupe_candidates (
      id TEXT PRIMARY KEY,
      entity_type TEXT CHECK(entity_type IN ('lead', 'development', 'developer')),
      entity_id TEXT,
      match_entity_id TEXT,
      match_score REAL,
      match_fields TEXT,
      status TEXT CHECK(status IN ('open', 'merged', 'ignored')) DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      before TEXT,
      after TEXT,
      details TEXT,
      ip TEXT,
      occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
    );
  `);

  // Seed Data if tables are empty
  const usersCountObj = dbConnection.prepare("SELECT count(*) as count FROM users").get() as any;
  if (usersCountObj.count === 0) {
    seedDb();
  }
}

function seedDb() {
  const tenantId = "tenant-1";
  
  // Seed Users
  dbConnection.exec(`
    INSERT INTO users (id, tenant_id, name, email, phone, status, presence, password) VALUES
    ('admin-id', '${tenantId}', 'Administradora Maria', 'admin@crm.com', '+5511999990001', 'ativo', 'online', 'admin123'),
    ('gerente-id', '${tenantId}', 'Amanda Souza (Gerente)', 'gerente@crm.com', '+5511999990002', 'ativo', 'online', 'gerente123'),
    ('joao-id', '${tenantId}', 'João Silva (Corretor)', 'corretor1@crm.com', '+5511999990003', 'ativo', 'online', 'corretor123'),
    ('bruno-id', '${tenantId}', 'Bruno Lima (Corretor)', 'corretor2@crm.com', '+5511999990004', 'ativo', 'online', 'corretor123');
  `);

  // Seed Roles
  dbConnection.exec(`
    INSERT INTO roles (id, tenant_id, name, is_system) VALUES
    ('role-admin', '${tenantId}', 'Admin', 1),
    ('role-gerente', '${tenantId}', 'Gerente', 1),
    ('role-corretor', '${tenantId}', 'Corretor', 1);
  `);

  // Seed User Roles
  dbConnection.exec(`
    INSERT INTO user_roles (user_id, role_id) VALUES
    ('admin-id', 'role-admin'),
    ('gerente-id', 'role-gerente'),
    ('joao-id', 'role-corretor'),
    ('bruno-id', 'role-corretor');
  `);

  // Seed Teams
  dbConnection.exec(`
    INSERT INTO teams (id, tenant_id, name) VALUES
    ('team-a', '${tenantId}', 'Equipe Alpha (team-a)'),
    ('team-b', '${tenantId}', 'Equipe Beta (team-b)');
  `);

  // Seed Team Members
  dbConnection.exec(`
    INSERT INTO team_members (team_id, user_id, role_in_team) VALUES
    ('team-a', 'gerente-id', 'manager'),
    ('team-a', 'joao-id', 'member'),
    ('team-b', 'bruno-id', 'member');
  `);

  // Seed Permissions
  dbConnection.exec(`
    INSERT INTO permissions (id, key, domain, description) VALUES
    ('perm-1', 'lead.view', 'leads', 'Visualizar leads'),
    ('perm-2', 'lead.create', 'leads', 'Criar leads'),
    ('perm-3', 'lead.edit', 'leads', 'Editar leads'),
    ('perm-4', 'lead.transfer', 'leads', 'Transferir leads'),
    ('perm-5', 'lead.delete', 'leads', 'Deletar leads'),
    ('perm-6', 'lead.export', 'leads', 'Exportar leads'),
    ('perm-7', 'conversation.view', 'conversations', 'Visualizar conversas'),
    ('perm-8', 'conversation.reply', 'conversations', 'Responder conversas'),
    ('perm-9', 'conversation.transfer', 'conversations', 'Transferir conversas'),
    ('perm-10', 'audit.view', 'audit', 'Visualizar log de auditoria'),
    ('perm-11', 'product.manage', 'products', 'Gerenciar produtos'),
    ('perm-12', 'config.manage', 'config', 'Gerenciar configurações globais');
  `);

  // Seed Role Permissions
  dbConnection.exec(`
    INSERT INTO role_permissions (role_id, permission_id, scope) VALUES
    ('role-admin', 'perm-1', 'all'), ('role-admin', 'perm-2', 'all'), ('role-admin', 'perm-3', 'all'),
    ('role-admin', 'perm-4', 'all'), ('role-admin', 'perm-5', 'all'), ('role-admin', 'perm-6', 'all'),
    ('role-admin', 'perm-7', 'all'), ('role-admin', 'perm-8', 'all'), ('role-admin', 'perm-9', 'all'),
    ('role-admin', 'perm-10', 'all'), ('role-admin', 'perm-11', 'all'), ('role-admin', 'perm-12', 'all'),
    
    ('role-gerente', 'perm-1', 'team'), ('role-gerente', 'perm-2', 'team'), ('role-gerente', 'perm-3', 'team'),
    ('role-gerente', 'perm-4', 'team'), ('role-gerente', 'perm-6', 'team'),
    ('role-gerente', 'perm-7', 'team'), ('role-gerente', 'perm-8', 'team'), ('role-gerente', 'perm-9', 'team'),
    ('role-gerente', 'perm-10', 'team'),
    
    ('role-corretor', 'perm-1', 'self'), ('role-corretor', 'perm-2', 'self'), ('role-corretor', 'perm-3', 'self'),
    ('role-corretor', 'perm-7', 'self'), ('role-corretor', 'perm-8', 'self');
  `);

  // Seed Lead Sources
  dbConnection.exec(`
    INSERT INTO lead_sources (id, tenant_id, name, active) VALUES
    ('source-1', '${tenantId}', 'WhatsApp API', 1),
    ('source-2', '${tenantId}', 'Instagram DM', 1),
    ('source-3', '${tenantId}', 'E-mail', 1),
    ('source-4', '${tenantId}', 'Portal Zap', 1),
    ('source-5', '${tenantId}', 'Site Formulário', 1);
  `);

  // Seed Funnel Stages
  dbConnection.exec(`
    INSERT INTO funnel_stages (id, tenant_id, name, "order", is_won, is_lost, sla_hours) VALUES
    ('stage-1', '${tenantId}', 'Novo Contato', 1, 0, 0, 24),
    ('stage-2', '${tenantId}', 'Qualificação', 2, 0, 0, 48),
    ('stage-3', '${tenantId}', 'Apresentação', 3, 0, 0, 72),
    ('stage-4', '${tenantId}', 'Proposta', 4, 0, 0, 120),
    ('stage-5', '${tenantId}', 'Vendido (Ganho)', 5, 1, 0, NULL),
    ('stage-6', '${tenantId}', 'Perdido', 6, 0, 1, NULL);
  `);

  // No fictitious developers, developments, or properties seeded to ensure a clean database.

  // Seed Campaigns
  dbConnection.exec(`
    INSERT INTO campaigns (id, tenant_id, name, active) VALUES
    ('camp-1', '${tenantId}', 'Black Friday 2026', 1),
    ('camp-2', '${tenantId}', 'Lançamento Luxury Sul', 1);
  `);

  // Seed Loss Reasons
  dbConnection.exec(`
    INSERT INTO loss_reasons (id, tenant_id, name, active) VALUES
    ('loss-1', '${tenantId}', 'Preço muito alto', 1),
    ('loss-2', '${tenantId}', 'Localização não atendeu', 1),
    ('loss-3', '${tenantId}', 'Comprou concorrente', 1);
  `);

  // Seed Qualification Scripts
  dbConnection.exec(`
    INSERT INTO qualification_scripts (id, tenant_id, name, body, active) VALUES
    ('script-1', '${tenantId}', 'Qualificação Padrão', '1. Qual o objetivo da compra (moradia ou investimento)?\n2. Qual a região de preferência?\n3. Qual o orçamento estimado e forma de pagamento (financiamento, FGTS, à vista)?\n4. Qual o prazo planejado para a mudança/compra?', 1);
  `);

  // Seed Message Templates
  dbConnection.exec(`
    INSERT INTO message_templates (id, tenant_id, channel_type, name, category, body, variables, wa_approval_status, active) VALUES
    ('tpl-1', '${tenantId}', 'whatsapp', 'saudacao_inicial', 'UTILITY', 'Olá {{1}}, obrigado pelo interesse! Me chamo {{2}} e sou corretor na Imobiliária CRM. Vamos agendar uma conversa?', '["Cliente", "Corretor"]', 'APPROVED', 1),
    ('tpl-2', '${tenantId}', 'whatsapp', 'visita_confirmada', 'UTILITY', 'Olá! Tudo certo para nossa visita no empreendimento {{1}} no dia {{2}} às {{3}}.', '["Empreendimento", "Data", "Hora"]', 'APPROVED', 1);
  `);

  // Seed Channels
  dbConnection.exec(`
    INSERT INTO channels (id, tenant_id, type, identity, owner_user_id, status, credentials_ref) VALUES
    ('chan-1', '${tenantId}', 'whatsapp', '+5511999990000', 'joao-id', 'active', 'sec-waba-token'),
    ('chan-2', '${tenantId}', 'instagram', '@imobiliaria_crm', 'joao-id', 'active', 'sec-ig-token'),
    ('chan-3', '${tenantId}', 'email', 'atendimento@imobiliariacrm.com', 'joao-id', 'active', 'sec-imap-pwd');
  `);

  // Seed Distribution Rules (Roleta active, Grab/Caça-Leads and Manual inactive by default)
  dbConnection.exec(`
    INSERT INTO distribution_rules (id, tenant_id, name, type, criteria, priority, active) VALUES
    ('rule-1', '${tenantId}', 'Roleta — Distribuição Automática por Plantonistas', 'roleta', '{"online_only":true,"on_duty_only":true}', 1, 1),
    ('rule-2', '${tenantId}', 'Caça-leads — Reivindicação Livre na Fila', 'grab', '{"limit_per_period":3,"period_minutes":10}', 2, 0),
    ('rule-3', '${tenantId}', 'Manual — Atribuição por Gerentes/Admin', 'manual', '{}', 3, 0);
  `);
}
