export interface LoginRequest {
  email: string;
  password: string;
}

export interface MeResponse {
  userId: string;
  email: string;
}

export interface HealthResponse {
  ok: true;
  app: string;
}
