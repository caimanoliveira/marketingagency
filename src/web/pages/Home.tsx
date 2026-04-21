import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { MeResponse } from "../../shared/types";

export function Home() {
  const nav = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => nav("/login"));
  }, [nav]);

  async function logout() {
    await api.logout();
    nav("/login");
  }

  if (!me) return <div className="wrap">Carregando...</div>;

  return (
    <div className="home">
      <h1>Olá, {me.email}</h1>
      <p>Semana 1 concluída. Próximo: Posts CRUD + Editor + Mídia.</p>
      <button onClick={logout}>Sair</button>
    </div>
  );
}
