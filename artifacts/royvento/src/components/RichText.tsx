import { useMemo } from "react";
import DOMPurify from "dompurify";

/**
 * Renders partner/admin-authored rich text (event & organizer descriptions,
 * blog bodies) as HTML, but sanitized so injected scripts/handlers can't run.
 *
 * The allow-list intentionally KEEPS the semantic formatting tags the editors
 * produce (headings, lists, links, emphasis, blockquotes) so the visual result
 * and the AEO-relevant structure are unchanged — only scriptable content is
 * stripped: <script>, inline event handlers (onerror/onclick/…), `style`
 * attributes and `javascript:`/`data:` URIs are all removed.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div",
  "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
  "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
];
const ALLOWED_ATTR = ["href", "target", "rel", "title", "colspan", "rowspan"];

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:/data: URIs on any surviving attribute.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });
}

export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = useMemo(() => sanitizeRichText(html), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}

export default RichText;
