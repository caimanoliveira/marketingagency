const GRAPH = "https://graph.facebook.com/v20.0";
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
