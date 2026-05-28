import { describe, it, expect } from "vitest";
import { parseFeed } from "../../src/worker/integrations/rss";

const RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <link>https://example.com</link>
    <item>
      <title><![CDATA[OpenAI ships a new model]]></title>
      <link>https://example.com/a</link>
      <description><![CDATA[<p>It is <b>fast</b> &amp; cheap.</p>]]></description>
      <pubDate>Wed, 27 May 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/b</link>
      <pubDate>Tue, 26 May 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>No link should be skipped</title>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Source</title>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://atom.example/1"/>
    <summary>Short summary here</summary>
    <updated>2026-05-25T12:00:00Z</updated>
  </entry>
  <entry>
    <title>Atom entry two</title>
    <link href="https://atom.example/2"/>
    <published>2026-05-24T12:00:00Z</published>
  </entry>
</feed>`;

describe("parseFeed - RSS 2.0", () => {
  it("extracts items, decodes CDATA/entities, strips HTML, and reads source", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2); // third item has no link → skipped
    expect(items[0].title).toBe("OpenAI ships a new model");
    expect(items[0].url).toBe("https://example.com/a");
    expect(items[0].source).toBe("Example News");
    expect(items[0].summary).toBe("It is fast & cheap.");
    expect(items[0].publishedAt).toBe(Date.parse("Wed, 27 May 2026 10:00:00 GMT"));
    expect(items[1].title).toBe("Second story");
  });
});

describe("parseFeed - Atom", () => {
  it("prefers rel=alternate href and falls back to bare href", () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe("https://atom.example/1");
    expect(items[0].source).toBe("Atom Source");
    expect(items[1].url).toBe("https://atom.example/2");
    expect(items[1].publishedAt).toBe(Date.parse("2026-05-24T12:00:00Z"));
  });
});

describe("parseFeed - resilience", () => {
  it("returns [] for empty or junk input", () => {
    expect(parseFeed("")).toEqual([]);
    expect(parseFeed("<html><body>not a feed</body></html>")).toEqual([]);
  });

  it("uses sourceFallback when the feed has no channel title", () => {
    const xml = `<rss><channel><item><title>x</title><link>https://h/x</link></item></channel></rss>`;
    const items = parseFeed(xml, "Fallback");
    expect(items[0].source).toBe("Fallback");
  });
});
