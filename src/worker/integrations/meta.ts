const GRAPH = "https://graph.facebook.com/v20.0";
const GRAPH_V20 = "https://graph.facebook.com/v20.0";
const OAUTH_BASE = "https://www.facebook.com/v20.0/dialog/oauth";
const OAUTH_TOKEN = `${GRAPH}/oauth/access_token`;

export function buildOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const u = new URL(OAUTH_BASE);
  u.searchParams.set("client_id", params.appId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("state", params.state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", params.scopes.join(","));
  return u.toString();
}

export async function exchangeCodeForToken(args: {
  appId: string; appSecret: string; redirectUri: string; code: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const u = new URL(OAUTH_TOKEN);
  u.searchParams.set("client_id", args.appId);
  u.searchParams.set("client_secret", args.appSecret);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("code", args.code);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`meta_code_exchange_${res.status}`);
  const data = await res.json() as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

export async function exchangeForLongLivedToken(args: {
  appId: string; appSecret: string; shortToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const u = new URL(OAUTH_TOKEN);
  u.searchParams.set("grant_type", "fb_exchange_token");
  u.searchParams.set("client_id", args.appId);
  u.searchParams.set("client_secret", args.appSecret);
  u.searchParams.set("fb_exchange_token", args.shortToken);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`meta_long_lived_${res.status}`);
  const data = await res.json() as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 60 * 24 * 3600 };
}

export async function fetchMetaUserInfo(accessToken: string): Promise<{ id: string; name: string }> {
  const u = new URL(`${GRAPH}/me`);
  u.searchParams.set("fields", "id,name");
  u.searchParams.set("access_token", accessToken);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`meta_me_${res.status}`);
  return (await res.json()) as { id: string; name: string };
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

export async function fetchPages(accessToken: string): Promise<FacebookPage[]> {
  const u = new URL(`${GRAPH}/me/accounts`);
  u.searchParams.set("fields", "id,name,access_token");
  u.searchParams.set("access_token", accessToken);
  u.searchParams.set("limit", "100");
  const res = await fetch(u.toString());
  if (!res.ok) return [];
  const data = await res.json() as { data?: FacebookPage[] };
  return data.data ?? [];
}

export interface IgBusinessAccountInfo {
  igUserId: string;
  igUsername: string;
  profilePictureUrl: string | null;
}

export async function fetchInstagramBusinessAccount(pageId: string, pageAccessToken: string): Promise<IgBusinessAccountInfo | null> {
  const u = new URL(`${GRAPH}/${pageId}`);
  u.searchParams.set("fields", "instagram_business_account{id,username,profile_picture_url}");
  u.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const data = await res.json() as {
    instagram_business_account?: { id: string; username: string; profile_picture_url?: string };
  };
  if (!data.instagram_business_account) return null;
  return {
    igUserId: data.instagram_business_account.id,
    igUsername: data.instagram_business_account.username,
    profilePictureUrl: data.instagram_business_account.profile_picture_url ?? null,
  };
}

export async function resolveInstagramAccounts(
  userAccessToken: string
): Promise<Array<{ igUserId: string; igUsername: string; fbPageId: string; fbPageName: string; fbPageAccessToken: string; profilePictureUrl: string | null }>> {
  const pages = await fetchPages(userAccessToken);
  const out: Array<{ igUserId: string; igUsername: string; fbPageId: string; fbPageName: string; fbPageAccessToken: string; profilePictureUrl: string | null }> = [];
  for (const page of pages) {
    const ig = await fetchInstagramBusinessAccount(page.id, page.access_token);
    if (ig) {
      out.push({
        igUserId: ig.igUserId,
        igUsername: ig.igUsername,
        fbPageId: page.id,
        fbPageName: page.name,
        fbPageAccessToken: page.access_token,
        profilePictureUrl: ig.profilePictureUrl,
      });
    }
  }
  return out;
}

export interface PublishInstagramArgs {
  pageAccessToken: string;
  igUserId: string;
  caption: string;
  mediaUrl: string;
  mediaType: "image" | "video";
}

export async function publishInstagram(args: PublishInstagramArgs): Promise<{ igMediaId: string }> {
  // Step 1: create container
  const createUrl = new URL(`${GRAPH_V20}/${args.igUserId}/media`);
  createUrl.searchParams.set("access_token", args.pageAccessToken);
  createUrl.searchParams.set("caption", args.caption);
  if (args.mediaType === "image") {
    createUrl.searchParams.set("image_url", args.mediaUrl);
  } else {
    createUrl.searchParams.set("media_type", "REELS");
    createUrl.searchParams.set("video_url", args.mediaUrl);
  }

  const createRes = await fetch(createUrl.toString(), { method: "POST" });
  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    throw new Error(`ig_container_${createRes.status}_${t.slice(0, 200)}`);
  }
  const { id: containerId } = (await createRes.json()) as { id: string };

  // Step 2: poll status for videos (images are usually instant)
  if (args.mediaType === "video") {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3_000));
      const statusUrl = new URL(`${GRAPH_V20}/${containerId}`);
      statusUrl.searchParams.set("fields", "status_code");
      statusUrl.searchParams.set("access_token", args.pageAccessToken);
      const statusRes = await fetch(statusUrl.toString());
      if (!statusRes.ok) continue;
      const { status_code } = (await statusRes.json()) as { status_code?: string };
      if (status_code === "FINISHED") break;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new Error(`ig_container_status_${status_code}`);
      }
    }
  }

  // Step 3: publish
  const publishUrl = new URL(`${GRAPH_V20}/${args.igUserId}/media_publish`);
  publishUrl.searchParams.set("access_token", args.pageAccessToken);
  publishUrl.searchParams.set("creation_id", containerId);
  const pubRes = await fetch(publishUrl.toString(), { method: "POST" });
  if (!pubRes.ok) {
    const t = await pubRes.text().catch(() => "");
    throw new Error(`ig_publish_${pubRes.status}_${t.slice(0, 200)}`);
  }
  const { id: igMediaId } = (await pubRes.json()) as { id: string };
  return { igMediaId };
}

export async function fetchIgAccountMetrics(
  igUserId: string,
  pageAccessToken: string
): Promise<{ followers: number | null; impressions: number | null; reach: number | null; profileViews: number | null }> {
  // Followers + media_count
  const basicUrl = new URL(`${GRAPH_V20}/${igUserId}`);
  basicUrl.searchParams.set("fields", "followers_count,media_count");
  basicUrl.searchParams.set("access_token", pageAccessToken);
  const basicRes = await fetch(basicUrl.toString());
  let followers: number | null = null;
  if (basicRes.ok) {
    const basic = await basicRes.json() as { followers_count?: number };
    followers = basic.followers_count ?? null;
  }

  // Insights (day period)
  const insightsUrl = new URL(`${GRAPH_V20}/${igUserId}/insights`);
  insightsUrl.searchParams.set("metric", "impressions,reach,profile_views");
  insightsUrl.searchParams.set("period", "day");
  insightsUrl.searchParams.set("access_token", pageAccessToken);
  const insightsRes = await fetch(insightsUrl.toString());
  let impressions: number | null = null, reach: number | null = null, profileViews: number | null = null;
  if (insightsRes.ok) {
    const body = await insightsRes.json() as { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
    for (const m of body.data ?? []) {
      const v = m.values?.[0]?.value ?? null;
      if (m.name === "impressions") impressions = v;
      else if (m.name === "reach") reach = v;
      else if (m.name === "profile_views") profileViews = v;
    }
  }
  return { followers, impressions, reach, profileViews };
}

export async function fetchIgPostMetrics(
  igMediaId: string,
  pageAccessToken: string
): Promise<{ likes: number | null; comments: number | null; saved: number | null; reach: number | null; impressions: number | null; shares: number | null }> {
  const url = new URL(`${GRAPH_V20}/${igMediaId}/insights`);
  url.searchParams.set("metric", "likes,comments,saved,reach,impressions,shares");
  url.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(url.toString());
  const out = { likes: null as number | null, comments: null as number | null, saved: null as number | null, reach: null as number | null, impressions: null as number | null, shares: null as number | null };
  if (!res.ok) return out;
  const body = await res.json() as { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
  for (const m of body.data ?? []) {
    const v = m.values?.[0]?.value ?? null;
    if (m.name in out) (out as Record<string, number | null>)[m.name] = v;
  }
  return out;
}
