import type { Env } from "../index";
import { getLinkedInConnection, getMetaConnection, upsertAccountMetrics, insertPostMetrics, upsertCompetitorSnapshot } from "../db/queries";
import { fetchIgAccountMetrics, fetchIgPostMetrics, fetchCompetitorBasic } from "../integrations/meta";
import { fetchLinkedInPostMetrics } from "../integrations/linkedin";

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

function today(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function computeEngagementRate(reach: number | null, likes: number | null, comments: number | null, shares: number | null, saved: number | null): number | null {
  if (!reach || reach === 0) return null;
  const eng = (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saved ?? 0);
  return eng / reach;
}

export async function collectMetrics(env: Env): Promise<{ usersProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let usersProcessed = 0;

  // Get all users (MVP: single user only, but iterate for future)
  const { results: users } = await env.DB.prepare("SELECT id FROM users").all<{ id: string }>();
  for (const user of users ?? []) {
    usersProcessed++;
    try {
      await collectForUser(env, user.id);
    } catch (e) {
      errors.push(`user ${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { usersProcessed, errors };
}

async function collectForUser(env: Env, userId: string): Promise<void> {
  const snapshotDate = today();
  const now = Date.now();

  // --- Instagram ---
  const metaConn = await getMetaConnection(env.DB, userId);
  if (metaConn) {
    const { results: igAccounts } = await env.DB.prepare(
      "SELECT * FROM instagram_accounts WHERE connection_id = ?"
    ).bind(metaConn.id).all<{ id: string; ig_user_id: string; fb_page_access_token: string }>();

    for (const acct of igAccounts ?? []) {
      try {
        const accountMetrics = await fetchIgAccountMetrics(acct.ig_user_id, acct.fb_page_access_token);
        await upsertAccountMetrics(env.DB, {
          id: randomId("am"),
          userId,
          network: "instagram",
          accountRef: acct.ig_user_id,
          snapshotDate,
          followers: accountMetrics.followers,
          impressions: accountMetrics.impressions,
          reach: accountMetrics.reach,
          profileViews: accountMetrics.profileViews,
          extra: null,
        });
      } catch (e) {
        console.error(`ig account metrics ${acct.ig_user_id}`, e);
      }

      // Per-post metrics for published IG posts on this account
      const { results: posts } = await env.DB.prepare(
        `SELECT t.id AS target_id, t.post_id, t.external_id
         FROM post_targets t
         JOIN posts p ON p.id = t.post_id
         WHERE p.user_id = ? AND t.network = 'instagram' AND t.status = 'published' AND t.external_id IS NOT NULL
           AND t.target_ref = ?`
      ).bind(userId, acct.ig_user_id).all<{ target_id: string; post_id: string; external_id: string }>();

      for (const p of posts ?? []) {
        try {
          const m = await fetchIgPostMetrics(p.external_id, acct.fb_page_access_token);
          await insertPostMetrics(env.DB, {
            id: randomId("pm"),
            postId: p.post_id,
            targetId: p.target_id,
            network: "instagram",
            snapshotAt: now,
            likes: m.likes,
            comments: m.comments,
            shares: m.shares,
            saved: m.saved,
            reach: m.reach,
            impressions: m.impressions,
            engagementRate: computeEngagementRate(m.reach, m.likes, m.comments, m.shares, m.saved),
            extra: null,
          });
        } catch (e) {
          console.error(`ig post metrics ${p.external_id}`, e);
        }
      }
    }

    // --- Competitors (uses first IG account's page token) ---
    if ((igAccounts?.length ?? 0) > 0) {
      const firstAcct = igAccounts[0];
      const { results: comps } = await env.DB.prepare(
        "SELECT id, username FROM competitors WHERE user_id = ? AND network = 'instagram'"
      ).bind(userId).all<{ id: string; username: string }>();
      const snapshotDateStr = today();
      for (const comp of comps ?? []) {
        try {
          const info = await fetchCompetitorBasic(firstAcct.ig_user_id, firstAcct.fb_page_access_token, comp.username);
          if (info) {
            await upsertCompetitorSnapshot(env.DB, {
              id: randomId("cs"),
              competitorId: comp.id,
              snapshotDate: snapshotDateStr,
              followers: info.followers,
              mediaCount: info.mediaCount,
              recentAvgLikes: info.recentAvgLikes,
              recentAvgComments: info.recentAvgComments,
              recentPostsSampled: info.recentPostsSampled,
            });
            // Enrich competitor profile (name + picture) when available
            if (info.displayName || info.profilePictureUrl) {
              await env.DB.prepare(
                "UPDATE competitors SET display_name = COALESCE(?, display_name), profile_picture_url = COALESCE(?, profile_picture_url) WHERE id = ?"
              ).bind(info.displayName, info.profilePictureUrl, comp.id).run();
            }
          }
        } catch (e) {
          console.error(`competitor ${comp.username}`, e);
        }
      }
    }
  }

  // --- LinkedIn ---
  const liConn = await getLinkedInConnection(env.DB, userId);
  if (liConn) {
    const { results: liPosts } = await env.DB.prepare(
      `SELECT t.id AS target_id, t.post_id, t.external_id
       FROM post_targets t
       JOIN posts p ON p.id = t.post_id
       WHERE p.user_id = ? AND t.network = 'linkedin' AND t.status = 'published' AND t.external_id IS NOT NULL`
    ).bind(userId).all<{ target_id: string; post_id: string; external_id: string }>();

    for (const p of liPosts ?? []) {
      try {
        const m = await fetchLinkedInPostMetrics(liConn.access_token, p.external_id);
        await insertPostMetrics(env.DB, {
          id: randomId("pm"),
          postId: p.post_id,
          targetId: p.target_id,
          network: "linkedin",
          snapshotAt: now,
          likes: m.likes,
          comments: m.comments,
          shares: null,
          saved: null,
          reach: null,
          impressions: null,
          engagementRate: null,
          extra: null,
        });
      } catch (e) {
        console.error(`li post metrics ${p.external_id}`, e);
      }
    }
  }
}
