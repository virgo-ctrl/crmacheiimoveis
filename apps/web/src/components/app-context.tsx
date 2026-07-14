"use client";

import { createContext, useContext } from "react";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Gerente" | "Corretor" | string;
  presence?: string;
  push_validated_at?: string | null;
  team_id?: string | null;
}

const UserContext = createContext<CurrentUser | null>(null);

export function UserProvider({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): CurrentUser {
  const ctx = useContext(UserContext);
  if (!ctx) {
    // Fallback seguro — o layout garante que o provider existe antes de renderizar.
    return { id: "", name: "", email: "", role: "Corretor" };
  }
  return ctx;
}

export const BRAND_NAME = "ImobiCRM";
