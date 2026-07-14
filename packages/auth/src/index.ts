/**
 * Resolves the Row-Level Security SQL constraints according to the user's role and scope.
 * 
 * Admin   -> Scope 'all'  -> Sees all records within tenant (no filter or 1=1)
 * Gerente -> Scope 'team' -> Sees records assigned to them or their team members
 * Corretor-> Scope 'self' -> Sees only their own records
 */
export function getRlsFilter(
  role: "Admin" | "Gerente" | "Corretor",
  userId: string,
  brokerColumnName: string = "responsible_broker_id"
): { sql: string; params: string[] } {
  if (role === "Admin") {
    return { sql: "1=1", params: [] };
  }
  
  if (role === "Gerente") {
    return {
      sql: `${brokerColumnName} IN (
        SELECT user_id FROM team_members 
        WHERE team_id IN (
          SELECT team_id FROM team_members WHERE user_id = ?
        )
      )`,
      params: [userId],
    };
  }
  
  // Default is Corretor (self scope)
  return {
    sql: `${brokerColumnName} = ?`,
    params: [userId],
  };
}

/**
 * Returns permissions allowed for each system role.
 */
export function getRolePermissions(role: "Admin" | "Gerente" | "Corretor"): string[] {
  if (role === "Admin") {
    return [
      "lead.view", "lead.create", "lead.edit", "lead.transfer", "lead.delete", "lead.export",
      "conversation.view", "conversation.reply", "conversation.transfer", "audit.view",
      "product.manage", "config.manage"
    ];
  }
  if (role === "Gerente") {
    return [
      "lead.view", "lead.create", "lead.edit", "lead.transfer", "lead.export",
      "conversation.view", "conversation.reply", "conversation.transfer", "audit.view"
    ];
  }
  return ["lead.view", "lead.create", "lead.edit", "conversation.view", "conversation.reply"];
}
