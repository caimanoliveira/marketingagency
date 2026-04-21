import type { LoginRequest, MeResponse } from "../../shared/types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export const api = {
  login: (body: LoginRequest) =>
    req<{ ok: true }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => req<MeResponse>("/api/auth/me"),
};
