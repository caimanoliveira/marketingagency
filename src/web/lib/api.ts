import type {
  LoginRequest,
  MeResponse,
  Post,
  PostListItem,
  CreatePostRequest,
  UpdatePostRequest,
  UpdateTargetRequest,
  Network,
  Media,
  PresignedUploadRequest,
  PresignedUploadResponse,
  GenerateVariationsRequest,
  GenerateVariationsResponse,
  RewriteForNetworkRequest,
  RewriteForNetworkResponse,
  AdjustToneRequest,
  AdjustToneResponse,
} from "../../shared/types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json<T>(path: string, method: string, body?: unknown): Promise<T> {
  return req<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  login: (body: LoginRequest) => json<{ ok: true }>("/api/auth/login", "POST", body),
  logout: () => json<{ ok: true }>("/api/auth/logout", "POST"),
  me: () => req<MeResponse>("/api/auth/me"),

  listPosts: () => req<{ items: PostListItem[] }>("/api/posts"),
  getPost: (id: string) => req<Post>(`/api/posts/${id}`),
  createPost: (body: CreatePostRequest) => json<Post>("/api/posts", "POST", body),
  updatePost: (id: string, body: UpdatePostRequest) =>
    json<Post>(`/api/posts/${id}`, "PATCH", body),
  deletePost: (id: string) => json<{ ok: true }>(`/api/posts/${id}`, "DELETE"),
  setTargets: (id: string, networks: Network[]) =>
    json<Post>(`/api/posts/${id}/targets`, "PUT", { networks }),
  updateTarget: (id: string, network: Network, body: UpdateTargetRequest) =>
    json<Post>(`/api/posts/${id}/targets/${network}`, "PATCH", body),

  listMedia: () => req<{ items: Media[] }>("/api/media"),
  deleteMedia: (id: string) => json<{ ok: true }>(`/api/media/${id}`, "DELETE"),
  presignUpload: (body: PresignedUploadRequest) =>
    json<PresignedUploadResponse>("/api/media/presigned-upload", "POST", body),

  aiVariations: (body: GenerateVariationsRequest) =>
    json<GenerateVariationsResponse>("/api/ai/variations", "POST", body),
  aiRewrite: (body: RewriteForNetworkRequest) =>
    json<RewriteForNetworkResponse>("/api/ai/rewrite", "POST", body),
  aiTone: (body: AdjustToneRequest) =>
    json<AdjustToneResponse>("/api/ai/tone", "POST", body),

  publishNow: (postId: string, network: Network) =>
    json<{ ok: true; externalId: string }>(`/api/publish/${postId}/${network}`, "POST"),

  listPendingManual: () => req<{
    items: Array<{
      postId: string;
      targetId: string;
      network: string;
      body: string;
      mediaUrl: string | null;
      mediaMime: string | null;
      scheduledAt: number | null;
    }>;
  }>("/api/posts/pending-manual"),
  markPublished: (postId: string, network: string, externalUrl: string | null) =>
    json<{ ok: true }>(`/api/posts/${postId}/targets/${network}/mark-published`, "POST", { externalUrl }),

  getLinkedIn: () => req<{
    connected: boolean;
    member?: { memberId: string; memberName: string; expiresAt: number; scopes: string[] };
    orgs?: Array<{ id: string; orgUrn: string; orgName: string; orgLogoUrl: string | null }>;
  }>("/api/connections/linkedin"),
  refreshLinkedInOrgs: () => json<{ ok: true; count: number }>("/api/connections/linkedin/refresh-orgs", "POST"),
  disconnectLinkedIn: () => json<{ ok: true }>("/api/connections/linkedin", "DELETE"),

  getInstagram: () => req<{
    connected: boolean;
    member?: { fbUserId: string; fbUserName: string; expiresAt: number; scopes: string[] };
    accounts?: Array<{ id: string; igUserId: string; igUsername: string; fbPageId: string; fbPageName: string; profilePictureUrl: string | null }>;
  }>("/api/connections/instagram"),
  refreshInstagram: () => json<{ ok: true; count: number }>("/api/connections/instagram/refresh", "POST"),
  disconnectInstagram: () => json<{ ok: true }>("/api/connections/instagram", "DELETE"),

  updatePostStatus: (id: string, status: "draft" | "scheduled" | "published" | "failed") =>
    json<unknown>(`/api/posts/${id}`, "PATCH", { status }),

  postsByMonth: (year: number, month0: number) => {
    const from = new Date(year, month0, 1).getTime();
    const to = new Date(year, month0 + 1, 1).getTime();
    return req<{
      items: Array<{
        id: string;
        body: string;
        status: string;
        mediaId: string | null;
        networks: string[];
        scheduledAt: number;
        updatedAt: number;
      }>;
    }>(`/api/posts/by-month?from=${from}&to=${to}`);
  },

  listFailures: () => req<{
    items: Array<{
      postId: string;
      postBody: string;
      network: string;
      lastError: string | null;
      attempts: number;
      scheduledAt: number | null;
    }>;
  }>("/api/posts/failures"),
  retryTarget: (postId: string, network: string) =>
    json<{ ok: true }>(`/api/posts/${postId}/targets/${network}/retry`, "POST"),
};
