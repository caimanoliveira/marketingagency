import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Input } from "../ui";
import { Logo } from "../components/Logo";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.login({ email, password });
      nav("/");
    } catch {
      setErr("Credenciais inválidas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lume-auth-wrap">
      <div className="lume-auth-card">
        <Logo />
        <h1 style={{ fontSize: 22, marginTop: 0, marginBottom: 8 }}>Entrar no Lume</h1>
        <p style={{ color: "var(--lume-text-muted)", fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          Acesse seu centro de comando.
        </p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {err && <div className="err">{err}</div>}
          <Button type="submit" disabled={busy} size="lg" style={{ marginTop: 8 }}>
            {busy ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
