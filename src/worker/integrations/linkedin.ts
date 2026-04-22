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
