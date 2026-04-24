export interface LoginRequest { email: string; password: string; }
export interface MeResponse { userId: string; email: string; }
export interface HealthResponse { ok: true; app: string; }

export type Network = "instagram" | "tiktok" | "linkedin";
export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type TargetStatus = "pending" | "scheduled" | "publishing" | "published" | "failed" | "ready_to_post";

export interface Media {
  id: string;
  r2Key: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: number;
  url: string;
}

export interface PostTarget {
  id: string;
  postId: string;
  network: Network;
  bodyOverride: string | null;
  scheduledAt: number | null;
  publishedAt: number | null;
  externalId: string | null;
  status: TargetStatus;
  targetRef: string | null;
  lastError: string | null;
  attempts: number;
}

export interface Post {
  id: string;
  body: string;
  mediaId: string | null;
  media: Media | null;
  pillarId: string | null;
  status: PostStatus;
  createdAt: number;
  updatedAt: number;
  targets: PostTarget[];
}

export interface PostListItem {
  id: string;
  body: string;
  status: PostStatus;
  mediaId: string | null;
  mediaThumb: string | null;
  networks: Network[];
  updatedAt: number;
  totalLikes: number | null;
  totalComments: number | null;
}

export interface CreatePostRequest {
  body?: string;
  mediaId?: string | null;
  pillarId?: string | null;
  networks?: Network[];
}
export interface UpdatePostRequest {
  body?: string;
  mediaId?: string | null;
  pillarId?: string | null;
}
export interface UpdateTargetRequest {
  bodyOverride?: string | null;
  scheduledAt?: number | null;
  targetRef?: string | null;
}
export interface PresignedUploadRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}
export interface PresignedUploadResponse {
  mediaId: string;
  uploadUrl: string;
  r2Key: string;
  expiresIn: number;
}

export type Tone = "formal" | "casual" | "playful" | "direct";

export interface GenerateVariationsRequest {
  brief: string;
  network?: Network;
  tone?: Tone;
}
export interface GenerateVariationsResponse { variations: string[]; }

export interface RewriteForNetworkRequest {
  body: string;
  network: Network;
}
export interface RewriteForNetworkResponse { rewritten: string; }

export interface AdjustToneRequest {
  body: string;
  tone: Tone;
}
export interface AdjustToneResponse { adjusted: string; }

export interface LinkedInConnection {
  memberId: string;
  memberName: string;
  expiresAt: number;
  scopes: string[];
}

export interface LinkedInOrg {
  id: string;
  orgUrn: string;
  orgName: string;
  orgLogoUrl: string | null;
}

export type LinkedInTargetRef = string | null;

export interface SchedulePostTargetRequest {
  scheduledAt: number | null;
  targetRef?: LinkedInTargetRef;
}

export interface PublishNowRequest {
  network: Network;
  targetRef?: LinkedInTargetRef;
}

export interface PublishJob {
  postId: string;
  targetId: string;
  network: Network;
  attempt: number;
}

export interface InstagramAccount {
  id: string;
  igUserId: string;
  igUsername: string;
  fbPageId: string;
  fbPageName: string;
  profilePictureUrl: string | null;
}

export interface InstagramConnectionStatus {
  connected: boolean;
  member?: { fbUserId: string; fbUserName: string; expiresAt: number; scopes: string[] };
  accounts?: InstagramAccount[];
}

export interface AccountMetricsSnapshot {
  date: string;
  network: Network;
  accountRef: string;
  followers: number | null;
  impressions: number | null;
  reach: number | null;
  profileViews: number | null;
}

export interface PostMetricsSnapshot {
  postId: string;
  targetId: string;
  network: Network;
  snapshotAt: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  impressions: number | null;
  engagementRate: number | null;
}

export interface AnalyticsSummary {
  periodDays: number;
  totalReach: number;
  totalEngagement: number;
  followerGrowth: number;
  postsPublished: number;
  weeklyEngagement: Array<{ weekStart: string; likes: number; comments: number; shares: number }>;
  contentMix: Array<{ network: Network; count: number }>;
}

export interface Competitor {
  id: string;
  network: Network;
  username: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  addedAt: number;
  lastSnapshotAt: number | null;
}

export interface CompetitorSnapshotItem {
  date: string;
  followers: number | null;
  mediaCount: number | null;
  recentAvgLikes: number | null;
  recentAvgComments: number | null;
  recentPostsSampled: number | null;
}

export interface TopPostItem {
  postId: string;
  body: string;
  network: Network;
  publishedAt: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  engagementRate: number | null;
  score: number;
}

export interface WoWComparison {
  current: AnalyticsSummary;
  previous: AnalyticsSummary;
  delta: {
    totalReachPct: number | null;
    totalEngagementPct: number | null;
    followerGrowthPct: number | null;
    postsPublishedPct: number | null;
  };
}

export interface ContentPillar {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  position: number;
  createdAt: number;
}

export interface PillarPerformance {
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
}

export interface InspirationSource {
  id: string;
  network: Network;
  username: string;
  note: string | null;
  addedAt: number;
}

export interface SuggestedPost {
  day: "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
  time: string;
  network: Network;
  pillarId: string | null;
  format: string;
  hook: string;
  body: string;
  mediaSuggestion: string;
}

export interface WeeklySuggestion {
  id: string;
  weekStart: string;
  theme: string | null;
  status: "pending" | "approved" | "discarded";
  rationale: string | null;
  posts: SuggestedPost[];
  createdAt: number;
  approvedAt: number | null;
  model: string;
  tokens: { input: number | null; output: number | null; cached: number | null };
}
