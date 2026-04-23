const LINKEDIN_API = "https://api.linkedin.com";

export interface LinkedInMemberInfo {
  sub: string;
  name: string;
}

export async function fetchMemberInfo(accessToken: string): Promise<LinkedInMemberInfo> {
  const res = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`linkedin_userinfo_${res.status}`);
  const data = await res.json() as { sub: string; name: string };
  return { sub: data.sub, name: data.name };
}

export interface LinkedInOrgItem { urn: string; name: string; logoUrl: string | null; }

export async function fetchAdminOrgs(accessToken: string): Promise<LinkedInOrgItem[]> {
  const aclsRes = await fetch(
    `${LINKEDIN_API}/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName,logoV2(original~:playableStreams))))`,
    { headers: { authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
  );
  if (!aclsRes.ok) return [];
  const body = await aclsRes.json() as {
    elements?: Array<{
      "organizationalTarget~"?: {
        id: number;
        localizedName: string;
        logoV2?: { "original~"?: { elements?: Array<{ identifiers?: Array<{ identifier: string }> }> } };
      };
    }>;
  };
  const out: LinkedInOrgItem[] = [];
  for (const el of body.elements ?? []) {
    const org = el["organizationalTarget~"];
    if (!org) continue;
    const logo = org.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier ?? null;
    out.push({ urn: `urn:li:organization:${org.id}`, name: org.localizedName, logoUrl: logo });
  }
  return out;
}

export async function refreshAccessToken(
  env: { LINKEDIN_CLIENT_ID: string; LINKEDIN_CLIENT_SECRET: string },
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`refresh_failed_${res.status}`);
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageBytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  if (!regRes.ok) {
    const t = await regRes.text().catch(() => "");
    throw new Error(`register_upload_${regRes.status}_${t.slice(0, 200)}`);
  }
  const reg = await regRes.json() as {
    value: {
      asset: string;
      uploadMechanism: {
        ["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]: { uploadUrl: string };
      };
    };
  };
  const asset = reg.value.asset;
  const uploadUrl = reg.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;

  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": mimeType,
    },
    body: imageBytes,
  });
  if (!upRes.ok) throw new Error(`upload_${upRes.status}`);
  return asset;
}

export interface PublishUgcArgs {
  accessToken: string;
  authorUrn: string;
  text: string;
  imageAsset?: string;
}

export async function publishUgcPost(args: PublishUgcArgs): Promise<{ ugcUrn: string }> {
  const media = args.imageAsset
    ? [{ status: "READY", description: { text: "" }, media: args.imageAsset, title: { text: "" } }]
    : [];
  const body = {
    author: args.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text },
        shareMediaCategory: media.length ? "IMAGE" : "NONE",
        ...(media.length ? { media } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`publish_${res.status}_${t.slice(0, 200)}`);
  }
  const location = res.headers.get("x-restli-id") ?? res.headers.get("location") ?? "";
  return { ugcUrn: location || "unknown" };
}

export async function fetchLinkedInPostMetrics(
  accessToken: string,
  ugcUrn: string
): Promise<{ likes: number | null; comments: number | null }> {
  const encoded = encodeURIComponent(ugcUrn);
  // Likes count: /socialActions/{urn}/likes?count=0 (just gets paging.total)
  const likesUrl = `https://api.linkedin.com/v2/socialActions/${encoded}/likes?count=0`;
  const likesRes = await fetch(likesUrl, { headers: { authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } });
  let likes: number | null = null;
  if (likesRes.ok) {
    const body = await likesRes.json() as { paging?: { total?: number } };
    likes = body.paging?.total ?? null;
  }

  const commentsUrl = `https://api.linkedin.com/v2/socialActions/${encoded}/comments?count=0`;
  const commentsRes = await fetch(commentsUrl, { headers: { authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } });
  let comments: number | null = null;
  if (commentsRes.ok) {
    const body = await commentsRes.json() as { paging?: { total?: number } };
    comments = body.paging?.total ?? null;
  }

  return { likes, comments };
}
