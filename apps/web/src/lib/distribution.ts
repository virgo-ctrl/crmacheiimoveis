/**
 * Selects a broker for a lead based on active distribution rules,
 * active shifts, and broker workloads.
 *
 * NOTE: This function is called synchronously in the API routes for simplicity.
 * When `supabase` is provided, a simple synchronous-compatible path is used
 * (returning fallback values) — the async Supabase queries are done in the caller.
 * The full async version is `distributeLeadAsync`.
 */
export function distributeLead(
  db: any,
  tenantId: string,
  supabase?: any
): { brokerId: string | null; ruleId: string | null; reason: string } {
  // When using Supabase, return a placeholder — the actual distribution happens async in the route
  if (supabase) {
    return {
      brokerId: null,
      ruleId: null,
      reason: "Distribuição via Supabase — processada assincronamente.",
    };
  }

  if (!db) {
    return { brokerId: null, ruleId: null, reason: "Nenhuma fonte de dados disponível." };
  }

  const rules = db
    .prepare("SELECT * FROM distribution_rules WHERE tenant_id = ? AND active = 1 ORDER BY priority DESC")
    .all(tenantId) as any[];

  if (rules.length === 0) {
    const brokers = db
      .prepare(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.name IN ('Corretor', 'Gerente') AND u.status = 'ativo'`
      )
      .all() as any[];

    if (brokers.length === 0) {
      return { brokerId: null, ruleId: null, reason: "Nenhum corretor ativo no sistema (fallback)." };
    }

    const leadsCount = (db.prepare("SELECT count(*) as count FROM leads").get() as any).count;
    const selected = brokers[leadsCount % brokers.length];
    return { brokerId: selected.id, ruleId: null, reason: "fallback — rodízio geral" };
  }

  const activeRule = rules[0];

  if (activeRule.type === "grab") {
    return { brokerId: null, ruleId: activeRule.id, reason: `Regra "${activeRule.name}" (caça-leads): disponível para captura` };
  }

  if (activeRule.type === "manual") {
    const manager = db
      .prepare(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.name = 'Gerente' AND u.status = 'ativo' LIMIT 1`
      )
      .get() as any;
    return { brokerId: manager?.id || null, ruleId: activeRule.id, reason: `Regra "${activeRule.name}" (manual)` };
  }

  const nowIso = new Date().toISOString();
  const shiftBrokers = db
    .prepare(
      `SELECT DISTINCT s.user_id FROM shifts s
       JOIN users u ON s.user_id = u.id
       WHERE s.tenant_id = ? AND u.status = 'ativo'
         AND s.starts_at <= ? AND s.ends_at >= ?`
    )
    .all(tenantId, nowIso, nowIso) as any[];

  let candidateBrokers = shiftBrokers;
  let reasonSuffix = "baseado na escala de plantão ativa";

  if (candidateBrokers.length === 0) {
    candidateBrokers = db
      .prepare(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.name IN ('Corretor', 'Gerente') AND u.status = 'ativo'`
      )
      .all() as any[];
    reasonSuffix = "sem plantonistas — escalado backup geral";
  }

  if (candidateBrokers.length === 0) {
    return { brokerId: null, ruleId: activeRule.id, reason: "Nenhum corretor disponível." };
  }

  const workloads = candidateBrokers.map((b: any) => {
    const bid = b.user_id || b.id;
    const cnt = (db.prepare("SELECT count(*) as count FROM leads WHERE responsible_broker_id = ?").get(bid) as any).count;
    return { id: bid, count: cnt };
  });

  workloads.sort((a: any, b: any) => a.count - b.count);
  const selected = workloads[0];

  return {
    brokerId: selected.id,
    ruleId: activeRule.id,
    reason: `Regra "${activeRule.name}" (${activeRule.type}): menor carga (${selected.count} leads) - ${reasonSuffix}`,
  };
}

/**
 * Async version for Supabase-backed distribution.
 */
export async function distributeLeadAsync(
  supabase: any,
  tenantId: string
): Promise<{ brokerId: string | null; ruleId: string | null; reason: string }> {
  const { data: rules } = await supabase
    .from("distribution_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("priority", { ascending: false });

  if (!rules || rules.length === 0) {
    const { data: brokers } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "ativo");

    if (!brokers?.length) return { brokerId: null, ruleId: null, reason: "Nenhum corretor ativo (fallback)." };

    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
    const selected = brokers[(count ?? 0) % brokers.length];
    return { brokerId: selected.id, ruleId: null, reason: "fallback — rodízio geral" };
  }

  const activeRule = rules[0];

  if (activeRule.type === "grab") {
    return { brokerId: null, ruleId: activeRule.id, reason: `Regra "${activeRule.name}" (caça-leads)` };
  }

  if (activeRule.type === "manual") {
    return { brokerId: null, ruleId: activeRule.id, reason: `Regra "${activeRule.name}" (manual): triagem do supervisor` };
  }

  const nowIso = new Date().toISOString();
  const { data: shiftBrokers } = await supabase
    .from("shifts")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso);

  let candidates = shiftBrokers?.map((s: any) => s.user_id) ?? [];
  let reasonSuffix = "baseado na escala de plantão ativa";

  if (candidates.length === 0) {
    const { data: allBrokers } = await supabase.from("users").select("id").eq("tenant_id", tenantId).eq("status", "ativo");
    candidates = allBrokers?.map((u: any) => u.id) ?? [];
    reasonSuffix = "sem plantonistas — backup geral";
  }

  if (candidates.length === 0) return { brokerId: null, ruleId: activeRule.id, reason: "Nenhum corretor disponível." };

  const workloadPromises = candidates.map(async (brokerId: string) => {
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("responsible_broker_id", brokerId);
    return { id: brokerId, count: count ?? 0 };
  });

  const workloads = await Promise.all(workloadPromises);
  workloads.sort((a, b) => a.count - b.count);
  const selected = workloads[0];

  return {
    brokerId: selected.id,
    ruleId: activeRule.id,
    reason: `Regra "${activeRule.name}" (${activeRule.type}): menor carga (${selected.count} leads) - ${reasonSuffix}`,
  };
}
