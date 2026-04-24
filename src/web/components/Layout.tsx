import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FailureBanner } from "./FailureBanner";
import { Logo } from "./Logo";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Skeleton } from "./Skeleton";

const NAV_ITEMS: Array<{ to: string; label: string; icon: string; section?: string }> = [
  { to: "/posts",      label: "Posts",         icon: "📝", section: "CRIAR" },
  { to: "/posts/new",  label: "Novo post",     icon: "✨" },
  { to: "/calendar",   label: "Calendário",    icon: "🗓️" },
  { to: "/kanban",     label: "Kanban",        icon: "🧭" },
  { to: "/media",      label: "Biblioteca",    icon: "🖼️" },
  { to: "/strategy",   label: "Estratégia",    icon: "🎯", section: "INTELIGÊNCIA" },
  { to: "/analytics",  label: "Analytics",     icon: "📊" },
  { to: "/benchmarks", label: "Benchmarks",    icon: "🔭" },
  { to: "/settings",   label: "Configurações", icon: "⚙️", section: "CONTA" },
];

export function Layout() {
  const nav = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isError } = useQuery({ queryKey: ["me"], queryFn: api.me });

  useEffect(() => { if (isError) nav("/login"); }, [isError, nav]);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Close drawer on resize to desktop
  useEffect(() => {
    function onResize() { if (window.innerWidth >= 1024) setDrawerOpen(false); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function logout() {
    await api.logout();
    nav("/login");
  }

  if (!data) {
    return (
      <div className="lume-auth-wrap">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Logo />
          <Skeleton width="120px" height="20px" />
        </div>
      </div>
    );
  }

  return (
    <div className="lume-app">
      {/* Scrim */}
      <div
        className={`lume-sidebar-scrim ${drawerOpen ? "lume-sidebar-scrim-visible" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />

      {/* Sidebar */}
      <aside className={`lume-sidebar ${drawerOpen ? "lume-sidebar-open" : ""}`}>
        <NavLink to="/posts" style={{ textDecoration: "none" }}>
          <Logo />
        </NavLink>

        <nav className="lume-nav">
          {NAV_ITEMS.map((item, i) => {
            const showSection = item.section && (i === 0 || NAV_ITEMS[i - 1].section !== item.section);
            return (
              <div key={item.to}>
                {showSection && <div className="lume-nav-section">{item.section}</div>}
                <NavLink to={item.to} end={item.to === "/posts"}>
                  <span className="lume-nav-icon" aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>

        <div className="lume-sidebar-foot">
          <div className="lume-user-badge">
            <Avatar fallback={data.email} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lume-user-email">{data.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} style={{ justifyContent: "flex-start" }}>
            Sair
          </Button>
        </div>
      </aside>

      {/* Main column */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Mobile topbar */}
        <div className="lume-topbar">
          <button
            className="lume-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
          >☰</button>
          <Logo />
          <div style={{ width: 40 }} aria-hidden />
        </div>

        <main className="lume-content">
          <FailureBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
