"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { UserProvider, CurrentUser } from "../../components/app-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data?.user) setUser(data.user);
        else router.push("/login");
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="center-screen">Carregando painel...</div>;
  if (!user) return null;

  return (
    <UserProvider user={user}>
      <div className="layout">
        <Sidebar />
        <div className="main-content">
          <Topbar />
          {children}
        </div>
      </div>
    </UserProvider>
  );
}
