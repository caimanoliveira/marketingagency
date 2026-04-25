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

  analyticsSummary: (period: 7 | 30 | 90) =>
    req<{
      periodDays: number;
      totalReach: number;
      totalEngagement: number;
      followerGrowth: number;
      postsPublished: number;
      weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }>;
      contentMix: Array<{ network: string; count: number }>;
    }>(`/api/analytics/summary?period=${period}`),

  collectMetricsNow: () => json<{ usersProcessed: number; errors: string[] }>("/api/analytics/collect-now", "POST"),

  postPerformance: () => req<{
    items: Array<{
      postId: string;
      body: string;
      network: string;
      publishedAt: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saved: number | null;
      reach: number | null;
      impressions: number | null;
      engagementRate: number | null;
    }>;
  }>("/api/analytics/post-performance"),

  listCompetitors: () => req<{
    items: Array<{
      id: string;
      network: string;
      username: string;
      displayName: string | null;
      profilePictureUrl: string | null;
      addedAt: number;
      lastSnapshotAt: number | null;
    }>;
  }>("/api/competitors"),
  addCompetitor: (username: string) => json<{
    id: string; network: string; username: string; displayName: string | null; profilePictureUrl: string | null; addedAt: number; lastSnapshotAt: number | null;
  }>("/api/competitors", "POST", { username }),
  removeCompetitor: (id: string) => json<{ ok: true }>(`/api/competitors/${id}`, "DELETE"),
  competitorSnapshots: (id: string, days = 30) => req<{
    items: Array<{ date: string; followers: number | null; mediaCount: number | null; recentAvgLikes: number | null; recentAvgComments: number | null; recentPostsSampled: number | null }>;
  }>(`/api/competitors/${id}/snapshots?days=${days}`),
  topPosts: (by: "likes" | "engagement_rate" = "likes", limit = 10) => req<{
    items: Array<{ postId: string; body: string; network: string; publishedAt: number | null; likes: number | null; comments: number | null; shares: number | null; saved: number | null; reach: number | null; engagementRate: number | null; score: number }>;
  }>(`/api/analytics/top-posts?by=${by}&limit=${limit}`),
  wow: () => req<{
    current: { totalReach: number; totalEngagement: number; followerGrowth: number; postsPublished: number };
    previous: { totalReach: number; totalEngagement: number; followerGrowth: number; postsPublished: number };
    delta: { totalReachPct: number | null; totalEngagementPct: number | null; followerGrowthPct: number | null; postsPublishedPct: number | null };
  }>("/api/analytics/wow"),
  recordVariantApplied: (body: { variantText: string; network?: Network | null; tone?: "formal" | "casual" | "playful" | "direct" | null; postId?: string | null }) =>
    json<{ ok: true }>("/api/ai/variants/applied", "POST", body),
  requestReview: (postId: string) =>
    json<{ token: string; url: string; expiresAt: number }>(`/api/posts/${postId}/request-review`, "POST"),
  listPostComments: (postId: string) =>
    req<{ items: Array<{ id: string; postId: string; authorLabel: string; body: string; createdAt: number }> }>(`/api/posts/${postId}/comments`),
  addPostComment: (postId: string, body: string) =>
    json<{ id: string; postId: string; authorLabel: string; body: string; createdAt: number }>(`/api/posts/${postId}/comments`, "POST", { body }),
  sendTimes: (network?: "instagram" | "linkedin" | "tiktok", windowDays = 30) => req<{
    window: number;
    network: string | null;
    items: Array<{ weekday: number; hour: number; network: string; sampleSize: number; avgEngagementRate: number | null }>;
  }>(`/api/analytics/send-times?window=${windowDays}${network ? `&network=${network}` : ""}`),

  // Audience
  topEngagers: (windowDays = 30, limit = 10) => req<{
    window: number;
    items: Array<{ handle: string; network: string; commentCount: number; positiveCount: number; negativeCount: number }>;
  }>(`/api/audience/top-engagers?window=${windowDays}&limit=${limit}`),
  sentimentSummary: (windowDays = 30) => req<{
    window: number;
    summary: { positive: number; neutral: number; negative: number; unclassified: number };
  }>(`/api/audience/sentiment-summary?window=${windowDays}`),
  classifyComments: () => json<{ attempted: number; classified: number }>("/api/audience/classify-now", "POST"),

  // Strategy — Pillars
  listPillars: () => req<{
    items: Array<{ id: string; title: string; description: string | null; color: string | null; position: number; createdAt: number }>;
  }>("/api/strategy/pillars"),
  createPillar: (body: { title: string; description?: string | null; color?: string | null; position?: number }) =>
    json<{ id: string; title: string; description: string | null; color: string | null; position: number; createdAt: number }>("/api/strategy/pillars", "POST", body),
  updatePillar: (id: string, body: { title?: string; description?: string | null; color?: string | null; position?: number }) =>
    json<{ id: string; title: string; description: string | null; color: string | null; position: number; createdAt: number }>(`/api/strategy/pillars/${id}`, "PATCH", body),
  deletePillar: (id: string) => json<{ ok: true }>(`/api/strategy/pillars/${id}`, "DELETE"),
  pillarPerformance: (windowDays = 30) => req<{
    window: number;
    items: Array<{
      pillarId: string;
      title: string;
      color: string | null;
      position: number;
      postCount: number;
      avgEngagementRate: number | null;
      totalReach: number;
      totalLikes: number;
      totalComments: number;
      weekly: Array<{ weekStart: string; avgEngagementRate: number | null; postCount: number }>;
      byNetwork: Array<{ network: string; postCount: number; avgEngagementRate: number | null }>;
    }>;
  }>(`/api/strategy/pillars/performance?window=${windowDays}`),
  backfillPillars: () =>
    json<{ attempted: number; classified: number; skipped: number }>("/api/strategy/backfill-pillars", "POST"),

  // Strategy — Sources
  listSources: () => req<{
    items: Array<{ id: string; network: string; username: string; note: string | null; addedAt: number }>;
  }>("/api/strategy/sources"),
  addSource: (body: { network: "instagram" | "tiktok" | "linkedin"; username: string; note?: string | null }) =>
    json<{ id: string; network: string; username: string; note: string | null; addedAt: number }>("/api/strategy/sources", "POST", body),
  removeSource: (id: string) => json<{ ok: true }>(`/api/strategy/sources/${id}`, "DELETE"),

  // Strategy — Weekly suggestions
  generateWeeklyPlan: (body: { theme?: string; weekStart?: string }) =>
    json<{
      id: string; weekStart: string; theme: string | null; status: string;
      rationale: string | null;
      posts: Array<{ day: string; time: string; network: string; pillarId: string | null; format: string; hook: string; body: string; mediaSuggestion: string }>;
      createdAt: number; approvedAt: number | null;
    }>("/api/strategy/generate", "POST", body),
  listWeeklySuggestions: (limit = 10) =>
    req<{
      items: Array<{ id: string; weekStart: string; theme: string | null; status: string; posts: unknown[]; createdAt: number }>;
    }>(`/api/strategy/weekly-suggestions?limit=${limit}`),
  getWeeklySuggestion: (id: string) =>
    req<{
      id: string; weekStart: string; theme: string | null; status: string;
      rationale: string | null;
      posts: Array<{ day: string; time: string; network: string; pillarId: string | null; format: string; hook: string; body: string; mediaSuggestion: string }>;
      createdAt: number; approvedAt: number | null;
    }>(`/api/strategy/weekly-suggestions/${id}`),
  approveWeeklySuggestion: (id: string, acceptIndices?: number[]) =>
    json<{ createdPostIds: string[] }>(`/api/strategy/weekly-suggestions/${id}/approve`, "POST", acceptIndices ? { acceptIndices } : {}),
};
