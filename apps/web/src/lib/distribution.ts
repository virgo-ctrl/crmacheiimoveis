/**
 * Selects a broker for a lead based on active distribution rules,
 * active shifts, and broker workloads.
 */
export function distributeLead(db: any, tenantId: string): { brokerId: string | null; ruleId: string | null; reason: string } {
  // 1. Fetch active distribution rules ordered by priority desc
  const rules = db.prepare("SELECT * FROM distribution_rules WHERE tenant_id = ? AND active = 1 ORDER BY priority DESC").all(tenantId) as any[];

  if (rules.length === 0) {
    // Fallback: General round-robin across active brokers
    const brokers = db.prepare(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name IN ('Corretor', 'Gerente') AND u.status = 'ativo'
    `).all() as any[];

    if (brokers.length === 0) {
      return { brokerId: null, ruleId: null, reason: "Nenhum corretor ativo no sistema (fallback)." };
    }

    const leadsCount = (db.prepare("SELECT count(*) as count FROM leads").get() as any).count;
    const selected = brokers[leadsCount % brokers.length];
    return {
      brokerId: selected.id,
      ruleId: null,
      reason: "fallback — rodízio geral sem regras de distribuição ativas"
    };
  }

  const activeRule = rules[0];

  // Grab Rule (Caça-Leads)
  if (activeRule.type === "grab") {
    return {
      brokerId: null,
      ruleId: activeRule.id,
      reason: `Regra "${activeRule.name}" (caça-leads): disponível para captura`
    };
  }

  // Manual Routing Rule
  if (activeRule.type === "manual") {
    const manager = db.prepare(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'Gerente' AND u.status = 'ativo'
      LIMIT 1
    `).get() as any;
    return {
      brokerId: manager?.id || null,
      ruleId: activeRule.id,
      reason: `Regra "${activeRule.name}" (manual): encaminhado para triagem do supervisor`
    };
  }

  // Automated / Roleta with active shift check
  const nowIso = new Date().toISOString();
  
  // Find brokers currently on shift
  const shiftBrokers = db.prepare(`
    SELECT DISTINCT s.user_id 
    FROM shifts s
    JOIN users u ON s.user_id = u.id
    WHERE s.tenant_id = ? AND u.status = 'ativo'
      AND s.starts_at <= ? AND s.ends_at >= ?
  `).all(tenantId, nowIso, nowIso) as any[];

  let candidateBrokers = shiftBrokers;
  let reasonSuffix = "baseado na escala de plantão ativa";

  if (candidateBrokers.length === 0) {
    // Backup: fallback to all active brokers
    candidateBrokers = db.prepare(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name IN ('Corretor', 'Gerente') AND u.status = 'ativo'
    `).all() as any[];
    reasonSuffix = "sem plantonistas online no momento — escalado backup geral";
  }

  if (candidateBrokers.length === 0) {
    return {
      brokerId: null,
      ruleId: activeRule.id,
      reason: "Nenhum corretor plantonista ou de backup disponível."
    };
  }

  // Select broker with least active leads (least workload) to maintain balance
  const workloads = candidateBrokers.map((b) => {
    const bid = b.user_id || b.id;
    const leadsCount = (db.prepare("SELECT count(*) as count FROM leads WHERE responsible_broker_id = ?").get(bid) as any).count;
    return { id: bid, count: leadsCount };
  });

  workloads.sort((a, b) => a.count - b.count);
  const selectedBroker = workloads[0];

  return {
    brokerId: selectedBroker.id,
    ruleId: activeRule.id,
    reason: `Regra "${activeRule.name}" (${activeRule.type}): menor carga (${selectedBroker.count} leads) - ${reasonSuffix}`
  };
}
