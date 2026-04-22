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
}

export interface CreatePostRequest {
  body?: string;
  mediaId?: string | null;
  networks?: Network[];
}
export interface UpdatePostRequest {
  body?: string;
  mediaId?: string | null;
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
