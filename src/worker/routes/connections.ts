import { Hono } from "hono";
import { LinkedIn } from "arctic";
import type { Env } from "../index";
import { requireAuth } from "../middleware/requireAuth";
import {
  saveOauthState, consumeOauthState,
  upsertLinkedInConnection, replaceLinkedInOrgs,
  getLinkedInConnection, listLinkedInOrgs, deleteLinkedInConnection,
  getMetaConnection, upsertMetaConnection, replaceInstagramAccounts,
  listInstagramAccounts, deleteMetaConnection,
} from "../db/queries";
import { fetchMemberInfo, fetchAdminOrgs } from "../integrations/linkedin";
import {
  buildOAuthUrl, exchangeCodeForToken, exchangeForLongLivedToken,
  fetchMetaUserInfo, resolveInstagramAccounts,
} from "../integrations/meta";

export const connections = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

const SCOPES = [
  "openid", "profile", "email",
  "w_member_social",
  "w_organization_social", "r_organization_social", "rw_organization_admin",
];

function linkedInClient(env: Env, redirectUrl: string) {
  return new LinkedIn(env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET, redirectUrl);
}

function redirectUrl(c: { env: Env; req: { url: string } }): string {
  if (c.env.LINKEDIN_REDIRECT_URL) return c.env.LINKEDIN_REDIRECT_URL;
  return new URL("/api/connections/linkedin/callback", c.req.url).toString();
}

// START: redirect user to LinkedIn
connections.get("/linkedin/start", requireAuth, async (c) => {
  const userId = c.get("userId");
  const state = crypto.randomUUID();
  await saveOauthState(c.env.DB, { state, userId, network: "linkedin", redirectTo: "/settings" });
  const li = linkedInClient(c.env, redirectUrl(c));
  const url = li.createAuthorizationURL(state, SCOPES);
  return c.redirect(url.toString());
});

// CALLBACK: no auth middleware (user just came from LinkedIn; session cookie still present)
connections.get("/linkedin/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("missing_params", 400);

  const ctx = await consumeOauthState(c.env.DB, state);
  if (!ctx || ctx.network !== "linkedin") return c.text("invalid_state", 400);

  const li = linkedInClient(c.env, redirectUrl(c));
  let tokens;
  try { tokens = await li.validateAuthorizationCode(code); }
  catch { return c.text("token_exchange_failed", 400); }

  const accessToken = tokens.accessToken();
  const expiresAtDate = tokens.accessTokenExpiresAt();
  const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;

  const me = await fetchMemberInfo(accessToken);

  const connId = `lic_${ctx.userId}`;
  await upsertLinkedInConnection(c.env.DB, {
    id: connId,
    userId: ctx.userId,
    memberId: `urn:li:person:${me.sub}`,
    memberName: me.name,
    accessToken,
    refreshToken,
    expiresAt: expiresAtDate.getTime(),
    scopes: SCOPES.join(" "),
  });

  const orgs = await fetchAdminOrgs(accessToken);
  await replaceLinkedInOrgs(c.env.DB, connId, orgs.map((o) => ({
    orgUrn: o.urn, orgName: o.name, orgLogoUrl: o.logoUrl,
  })));

  return c.redirect(ctx.redirectTo || "/");
});

const META_SCOPES = [
  "public_profile", "email",
  "pages_show_list", "pages_read_engagement", "business_management",
  "instagram_basic", "instagram_content_publish",
];

function metaRedirectUrl(c: { env: Env; req: { url: string } }): string {
  if (c.env.META_REDIRECT_URL) return c.env.META_REDIRECT_URL;
  return new URL("/api/connections/instagram/callback", c.req.url).toString();
}

connections.get("/instagram/start", requireAuth, async (c) => {
  const userId = c.get("userId");
  const state = crypto.randomUUID();
  await saveOauthState(c.env.DB, { state, userId, network: "instagram", redirectTo: "/settings" });
  const url = buildOAuthUrl({
    appId: c.env.META_APP_ID,
    redirectUri: metaRedirectUrl(c),
    state,
    scopes: META_SCOPES,
  });
  return c.redirect(url);
});

connections.get("/instagram/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("missing_params", 400);

  const ctx = await consumeOauthState(c.env.DB, state);
  if (!ctx || ctx.network !== "instagram") return c.text("invalid_state", 400);

  let shortExchange;
  try {
    shortExchange = await exchangeCodeForToken({
      appId: c.env.META_APP_ID,
      appSecret: c.env.META_APP_SECRET,
      redirectUri: metaRedirectUrl(c),
      code,
    });
  } catch (e) {
    return c.text(`token_exchange_failed_${e instanceof Error ? e.message : "unknown"}`, 400);
  }

  // Exchange for long-lived token
  const longLived = await exchangeForLongLivedToken({
    appId: c.env.META_APP_ID,
    appSecret: c.env.META_APP_SECRET,
    shortToken: shortExchange.accessToken,
  });

  const me = await fetchMetaUserInfo(longLived.accessToken);

  const connId = `mc_${ctx.userId}`;
  await upsertMetaConnection(c.env.DB, {
    id: connId,
    userId: ctx.userId,
    fbUserId: me.id,
    fbUserName: me.name,
    accessToken: longLived.accessToken,
    expiresAt: Date.now() + longLived.expiresIn * 1000,
    scopes: META_SCOPES.join(","),
  });

  // Resolve IG accounts
  const igAccounts = await resolveInstagramAccounts(longLived.accessToken);
  await replaceInstagramAccounts(c.env.DB, connId, igAccounts);

  return c.redirect(ctx.redirectTo || "/");
});

// All other routes require auth
connections.use("*", requireAuth);

connections.get("/instagram", async (c) => {
  const userId = c.get("userId");
  const conn = await getMetaConnection(c.env.DB, userId);
  if (!conn) return c.json({ connected: false });
  const accts = await listInstagramAccounts(c.env.DB, conn.id);
  return c.json({
    connected: true,
    member: {
      fbUserId: conn.fb_user_id,
      fbUserName: conn.fb_user_name,
      expiresAt: conn.expires_at,
      scopes: conn.scopes.split(","),
    },
    accounts: accts.map((a) => ({
      id: a.id,
      igUserId: a.ig_user_id,
      igUsername: a.ig_username,
      fbPageId: a.fb_page_id,
      fbPageName: a.fb_page_name,
      profilePictureUrl: a.profile_picture_url,
    })),
  });
});

connections.post("/instagram/refresh", async (c) => {
  const userId = c.get("userId");
  const conn = await getMetaConnection(c.env.DB, userId);
  if (!conn) return c.json({ error: "not_connected" }, 400);
  const accts = await resolveInstagramAccounts(conn.access_token);
  await replaceInstagramAccounts(c.env.DB, conn.id, accts);
  return c.json({ ok: true, count: accts.length });
});

connections.delete("/instagram", async (c) => {
  const userId = c.get("userId");
  await deleteMetaConnection(c.env.DB, userId);
  return c.json({ ok: true });
});

connections.get("/linkedin", async (c) => {
  const userId = c.get("userId");
  const conn = await getLinkedInConnection(c.env.DB, userId);
  if (!conn) return c.json({ connected: false });
  const orgs = await listLinkedInOrgs(c.env.DB, conn.id);
  return c.json({
    connected: true,
    member: {
      memberId: conn.linkedin_member_id,
      memberName: conn.linkedin_member_name,
      expiresAt: conn.expires_at,
      scopes: conn.scopes.split(" "),
    },
    orgs: orgs.map((o) => ({ id: o.id, orgUrn: o.org_urn, orgName: o.org_name, orgLogoUrl: o.org_logo_url })),
  });
});

connections.post("/linkedin/refresh-orgs", async (c) => {
  const userId = c.get("userId");
  const conn = await getLinkedInConnection(c.env.DB, userId);
  if (!conn) return c.json({ error: "not_connected" }, 400);
  const orgs = await fetchAdminOrgs(conn.access_token);
  await replaceLinkedInOrgs(c.env.DB, conn.id, orgs.map((o) => ({ orgUrn: o.urn, orgName: o.name, orgLogoUrl: o.logoUrl })));
  return c.json({ ok: true, count: orgs.length });
});

connections.delete("/linkedin", async (c) => {
  const userId = c.get("userId");
  await deleteLinkedInConnection(c.env.DB, userId);
  return c.json({ ok: true });
});
