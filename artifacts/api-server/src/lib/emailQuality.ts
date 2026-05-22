/**
 * Email content quality / deliverability analyzer.
 *
 * Pure, dependency-free so it can be unit-tested in isolation and run both as a
 * live pre-send check in the Admin composer and as a server-side guard. It does
 * NOT guarantee inbox placement — mailbox providers decide that — it only flags
 * the well-known content patterns that push mail toward Spam/Promotions.
 */

export type IssueSeverity = "error" | "warning" | "info";

export interface EmailIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface EmailAnalysis {
  /** 0–100. Starts at 100; each issue deducts. */
  score: number;
  grade: "Excellent" | "Good" | "Fair" | "Poor";
  issues: EmailIssue[];
}

export interface AnalyzeInput {
  subject: string;
  isHtml: boolean;
  /** Raw HTML body (when isHtml). */
  html?: string;
  /** Plain-text body (when !isHtml). */
  text?: string;
  /** Number of addresses in the To field. */
  recipientCount: number;
}

// Well-known spam-trigger phrases. Kept moderate to limit false positives.
const SPAM_PHRASES = [
  "100% free", "act now", "buy now", "click here", "click below", "limited time",
  "offer expires", "risk free", "risk-free", "no cost", "no obligation", "winner",
  "you have won", "you've won", "congratulations you", "cash bonus", "free money",
  "earn money", "make money", "double your", "extra income", "work from home",
  "guarantee", "guaranteed", "lowest price", "best price", "cheap", "discount",
  "viagra", "casino", "lottery", "miracle", "weight loss", "this is not spam",
  "increase sales", "credit card", "no credit check", "$$$", "!!!",
];

function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(haystack: string, re: RegExp): number {
  const m = haystack.match(re);
  return m ? m.length : 0;
}

function findSpamPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return SPAM_PHRASES.filter((p) => lower.includes(p));
}

/** Ratio of uppercase letters among all alphabetic characters (0–1). */
function capsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 12) return 0; // too short to judge
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

const GRADE_THRESHOLDS: { min: number; grade: EmailAnalysis["grade"] }[] = [
  { min: 90, grade: "Excellent" },
  { min: 75, grade: "Good" },
  { min: 55, grade: "Fair" },
  { min: 0, grade: "Poor" },
];

function gradeFor(score: number): EmailAnalysis["grade"] {
  return (GRADE_THRESHOLDS.find((t) => score >= t.min) ?? GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1]!).grade;
}

export function analyzeEmail(input: AnalyzeInput): EmailAnalysis {
  const issues: EmailIssue[] = [];
  const subject = (input.subject ?? "").trim();
  const bodyText = input.isHtml ? stripHtml(input.html ?? "") : (input.text ?? "").trim();
  const html = input.isHtml ? (input.html ?? "") : "";

  // ── Subject ────────────────────────────────────────────────────────────────
  if (!subject) {
    issues.push({ severity: "error", code: "subject_empty", message: "Subject is empty. Mail without a subject is frequently filtered." });
  } else {
    if (subject.length > 78) {
      issues.push({ severity: "warning", code: "subject_long", message: `Subject is ${subject.length} chars; keep under ~60 so it isn't truncated.` });
    }
    if (capsRatio(subject) > 0.6) {
      issues.push({ severity: "warning", code: "subject_caps", message: "Subject is mostly UPPERCASE — a strong spam signal." });
    }
    if (countMatches(subject, /[!?]/g) >= 2) {
      issues.push({ severity: "warning", code: "subject_punct", message: "Excessive punctuation in subject (multiple ! or ?)." });
    }
    const subjSpam = findSpamPhrases(subject);
    if (subjSpam.length > 0) {
      issues.push({ severity: "warning", code: "subject_spam_words", message: `Subject contains spam-trigger phrases: ${subjSpam.join(", ")}.` });
    }
  }

  // ── Body presence ────────────────────────────────────────────────────────────
  if (bodyText.length === 0) {
    const hasImage = /<img/i.test(html);
    if (hasImage) {
      issues.push({ severity: "error", code: "image_only", message: "Image-only email with no readable text. Add real text content — image-only mail is heavily filtered." });
    } else {
      issues.push({ severity: "error", code: "body_empty", message: "Email body is empty." });
    }
  } else {
    const words = bodyText.split(/\s+/).filter(Boolean).length;

    // Spam phrases in body.
    const bodySpam = findSpamPhrases(bodyText);
    if (bodySpam.length > 0) {
      issues.push({ severity: bodySpam.length >= 3 ? "warning" : "info", code: "body_spam_words", message: `Body contains spam-trigger phrases: ${bodySpam.slice(0, 6).join(", ")}.` });
    }

    // Shouting.
    if (capsRatio(bodyText) > 0.35) {
      issues.push({ severity: "warning", code: "body_caps", message: "Body has a high proportion of UPPERCASE text." });
    }

    // Excessive exclamation.
    if (countMatches(bodyText, /!/g) >= 4) {
      issues.push({ severity: "warning", code: "body_punct", message: "Too many exclamation marks in the body." });
    }

    // Very short body.
    if (words < 8) {
      issues.push({ severity: "info", code: "body_short", message: "Body is very short; a few sentences of genuine text improves placement." });
    }

    // ── HTML-specific checks ───────────────────────────────────────────────────
    if (input.isHtml) {
      const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
      const linkCount = countMatches(html, /<a\b[^>]*href=/gi);

      // Image-heavy / poor text-to-image ratio.
      if (imgTags.length > 0 && words < imgTags.length * 20) {
        issues.push({ severity: "warning", code: "image_ratio", message: `Low text-to-image ratio (${words} words, ${imgTags.length} image${imgTags.length === 1 ? "" : "s"}). Add more text.` });
      }

      // Missing alt text.
      const missingAlt = imgTags.filter((t) => !/\balt\s*=/i.test(t)).length;
      if (missingAlt > 0) {
        issues.push({ severity: "warning", code: "img_alt", message: `${missingAlt} image${missingAlt === 1 ? "" : "s"} missing alt text (hurts accessibility and deliverability).` });
      }

      // Link stuffing.
      if (linkCount > 10 || (words > 0 && linkCount > Math.ceil(words / 20))) {
        issues.push({ severity: "warning", code: "link_stuffing", message: `High link density (${linkCount} links for ${words} words).` });
      }

      // Plain-text fallback quality (we auto-generate it from HTML).
      if (bodyText.length < 20) {
        issues.push({ severity: "warning", code: "weak_text_fallback", message: "The generated plain-text fallback is nearly empty; some clients show only text." });
      }
    }
  }

  // ── Recipients ─────────────────────────────────────────────────────────────
  if (input.recipientCount > 5) {
    issues.push({ severity: "info", code: "many_recipients", message: `${input.recipientCount} recipients in To. Use Bcc for bulk sends so addresses aren't exposed.` });
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  const DEDUCT: Record<IssueSeverity, number> = { error: 30, warning: 8, info: 3 };
  let score = 100;
  for (const i of issues) score -= DEDUCT[i.severity];
  score = Math.max(0, Math.min(100, score));

  return { score, grade: gradeFor(score), issues };
}
