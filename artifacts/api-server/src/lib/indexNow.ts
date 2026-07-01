import { logger } from "./logger";

/**
 * IndexNow — instantly notify Bing / Yandex / Seznam / Naver (and, via the
 * shared protocol, Microsoft Copilot's index) that URLs are new or updated so
 * they get crawled quickly instead of waiting for the next organic crawl.
 *
 * The key is NOT a secret — IndexNow requires it to be publicly hosted at
 * https://royvento.com/<key>.txt to prove ownership. Overridable via env so a
 * different deploy can rotate it without a code change.
 */

const INDEXNOW_KEY = process.env["INDEXNOW_KEY"] || "rv9k3m7q2x8p1t5w0z4y6b8n2c4v6a1s";
const ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKey(): string {
  return INDEXNOW_KEY;
}

export function indexNowOrigin(): string {
  const appUrl = process.env["APP_URL"];
  if (appUrl) return appUrl.replace(/\/$/, "");
  return "https://royvento.com";
}

/** Only submit from the real production deployment. */
function enabled(): boolean {
  return process.env["NODE_ENV"] === "production" && !!INDEXNOW_KEY;
}

/**
 * Submit up to 10,000 URLs to IndexNow. Non-throwing — a failed ping must never
 * affect the caller. Returns true on a 2xx response.
 */
export async function submitUrls(urls: string[]): Promise<boolean> {
  if (!enabled() || urls.length === 0) return false;
  const origin = indexNowOrigin();
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
    // IndexNow returns 200 (accepted) or 202 (accepted, pending). 4xx = rejected.
    const ok = res.status >= 200 && res.status < 300;
    logger[ok ? "info" : "warn"](
      { status: res.status, count: urls.length },
      "IndexNow submit",
    );
    return ok;
  } catch (err) {
    logger.warn({ err }, "IndexNow submit failed (non-fatal)");
    return false;
  }
}

/** Fire-and-forget single/batch ping — never blocks or throws into the caller. */
export function pingIndexNow(urls: string | string[]): void {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (list.length === 0) return;
  void submitUrls(list);
}
