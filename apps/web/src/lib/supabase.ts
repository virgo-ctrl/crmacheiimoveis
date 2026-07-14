import { createClient } from "@supabase/supabase-js";

// Service-role client for server-side API routes (bypasses RLS — used only in trusted server code)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Helper: resolve authenticated user from crm_session cookie
import { cookies } from "next/headers";

export async function getAuthUser() {
  const supabase = getSupabaseAdmin();
  const cookieStore = await cookies();
  const userId = cookieStore.get("crm_session")?.value;
  if (!userId) return null;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (!user) return null;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId)
    .single();

  const roleName = (roleRow?.roles as any)?.name ?? "Corretor";

  return { ...user, role: roleName as "Admin" | "Gerente" | "Corretor" };
}

// RLS filter helper (mirrors @crm/auth but for Supabase queries)
export function buildRlsFilter(
  query: any,
  role: "Admin" | "Gerente" | "Corretor",
  userId: string,
  brokerColumn = "responsible_broker_id"
) {
  if (role === "Admin") return query;

  if (role === "Gerente") {
    // We handle this at the application level with a subquery workaround
    return query; // will be filtered after fetching team members
  }

  return query.eq(brokerColumn, userId);
}
