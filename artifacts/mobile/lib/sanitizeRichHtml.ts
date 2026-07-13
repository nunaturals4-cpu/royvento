import { Linking } from "react-native";
import type { DomVisitorCallbacks } from "react-native-render-html";

/**
 * Hardens react-native-render-html against admin/partner-authored rich text
 * (blog bodies, event/organizer descriptions) the same way web's
 * src/components/RichText.tsx uses DOMPurify — the API returns the raw HTML
 * unsanitized (sanitization happens client-side on both platforms), so a
 * native renderer that doesn't strip scriptable content would carry the same
 * XSS-class risk DOMPurify was added to close on web.
 *
 * react-native-render-html has no document/window, so <script> tags never
 * execute — the residual risk here is malicious links (javascript:/data:
 * hrefs), local-file image probes (file:// src), and inline event-handler /
 * style attributes used for phishing-style UI redressing. This strips all of
 * those during DOM parsing (a real parse tree, not a regex string filter).
 */

// Tags with no legitimate purpose in prose content, or that can smuggle
// executable/trackable content — dropped entirely, not just their attributes.
export const RICH_HTML_IGNORED_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "input",
  "video", "audio", "source", "track", "svg", "link", "meta", "base",
];

const SAFE_HREF = /^(?:https?:|mailto:|tel:)/i;
const SAFE_IMG_SRC = /^https?:/i;

export const richHtmlDomVisitors: DomVisitorCallbacks = {
  onElement(element) {
    const attribs = element.attribs;
    if (!attribs) return;

    // Strip inline styles and any on* event-handler attribute on every tag.
    delete attribs["style"];
    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name)) delete attribs[name];
    }

    if (element.name === "a" && attribs["href"] && !SAFE_HREF.test(attribs["href"].trim())) {
      delete attribs["href"];
    }
    if (element.name === "img" && attribs["src"] && !SAFE_IMG_SRC.test(attribs["src"].trim())) {
      delete attribs["src"];
    }
  },
};

/** Only open http(s)/mailto/tel links tapped inside rendered rich text. */
export function openRichTextLink(href: string) {
  if (SAFE_HREF.test(href.trim())) {
    Linking.openURL(href).catch(() => {});
  }
}
