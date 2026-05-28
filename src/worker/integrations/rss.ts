export interface RssItem {
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
  publishedAt: number | null;
}

function firstMatch(block: string, tags: string[]): string | null {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    if (m) return m[1];
  }
  return null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function clean(raw: string | null): string {
  if (!raw) return "";
  let s = stripCdata(raw);
  s = s.replace(/<[^>]+>/g, " "); // strip HTML tags
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

function extractLink(block: string): string {
  // RSS: <link>url</link>. Atom: <link href="url" .../> (prefer rel="alternate" or no rel).
  const atomLinks = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  let atomHref: string | null = null;
  for (const m of atomLinks) {
    const attrs = m[1];
    const href = attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const rel = attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || rel.toLowerCase() === "alternate") return decodeEntities(href.trim());
    if (!atomHref) atomHref = href.trim();
  }
  const rss = firstMatch(block, ["link"]);
  if (rss && !/^\s*<link\b/i.test(rss)) {
    const t = clean(rss);
    if (t) return t;
  }
  return atomHref ? decodeEntities(atomHref) : "";
}

function parseDate(raw: string | null): number | null {
  if (!raw) return null;
  const t = Date.parse(clean(raw));
  return Number.isFinite(t) ? t : null;
}

/**
 * Parse an RSS 2.0 or Atom feed from raw XML. Tolerant of malformed input —
 * returns whatever items it can extract, skipping entries with no title or link.
 */
export function parseFeed(xml: string, sourceFallback: string | null = null): RssItem[] {
  if (!xml) return [];
  const channelTitle = clean(
    firstMatch(xml.split(/<item[\s>]/i)[0]?.split(/<entry[\s>]/i)[0] ?? xml, ["title"])
  ) || sourceFallback || null;

  const blocks = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].map((m) => m[1]);

  const items: RssItem[] = [];
  for (const block of blocks) {
    const title = clean(firstMatch(block, ["title"]));
    const url = extractLink(block);
    if (!title || !url) continue;
    const summary = clean(firstMatch(block, ["description", "summary", "content:encoded", "content"]));
    const publishedAt = parseDate(firstMatch(block, ["pubDate", "published", "updated", "dc:date"]));
    items.push({
      title,
      url,
      source: channelTitle,
      summary: summary ? summary.slice(0, 400) : null,
      publishedAt,
    });
  }
  return items;
}
