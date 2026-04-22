import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Layout() {
  const nav = useNavigate();
  const { data, isError } = useQuery({ queryKey: ["me"], queryFn: api.me });

  useEffect(() => {
    if (isError) nav("/login");
  }, [isError, nav]);

  async function logout() {
    await api.logout();
    nav("/login");
  }

  if (!data) return <div className="wrap">Carregando...</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Centro de Comando</div>
        <nav>
          <NavLink to="/posts" end>Posts</NavLink>
          <NavLink to="/posts/new">Novo post</NavLink>
          <NavLink to="/media">Biblioteca</NavLink>
          <NavLink to="/settings">Configurações</NavLink>
        </nav>
        <div className="sidebar-foot">
          <span className="user-email">{data.email}</span>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
