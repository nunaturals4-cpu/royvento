/**
 * Unit tests for the email quality analyzer.
 * Run: pnpm --filter @workspace/api-server exec tsx src/lib/emailQuality.test.ts
 */
import assert from "node:assert/strict";
import { analyzeEmail } from "./emailQuality";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const has = (codes: { code: string }[], code: string) => codes.some((i) => i.code === code);

test("clean plain-text email scores high", () => {
  const r = analyzeEmail({
    subject: "Your booking is confirmed",
    isHtml: false,
    text: "Hi there, your table for Saturday is confirmed. We look forward to hosting you. See you soon — the Royvento team.",
    recipientCount: 1,
  });
  assert.ok(r.score >= 90, `expected >=90, got ${r.score}`);
  assert.equal(r.grade, "Excellent");
  assert.equal(r.issues.length, 0);
});

test("clean rich HTML email with alt text scores high", () => {
  const r = analyzeEmail({
    subject: "A note from Royvento",
    isHtml: true,
    html: '<h1>Welcome</h1><p>Thanks for joining us. Here is everything you need to get started with your account this week.</p><img src="x.png" alt="Royvento banner"/><p>Visit your <a href="https://royvento.com/dashboard">dashboard</a> any time.</p>',
    recipientCount: 1,
  });
  assert.ok(r.score >= 90, `expected >=90, got ${r.score}`);
  assert.equal(r.issues.length, 0);
});

test("empty subject is an error", () => {
  const r = analyzeEmail({ subject: "  ", isHtml: false, text: "Some real body text here for testing.", recipientCount: 1 });
  assert.ok(has(r.issues, "subject_empty"));
  assert.ok(r.issues.some((i) => i.severity === "error"));
});

test("empty body is an error", () => {
  const r = analyzeEmail({ subject: "Hello", isHtml: false, text: "", recipientCount: 1 });
  assert.ok(has(r.issues, "body_empty"));
  assert.ok(r.score < 75);
});

test("image-only HTML email is flagged as error", () => {
  const r = analyzeEmail({ subject: "Look", isHtml: true, html: '<img src="promo.png"/>', recipientCount: 1 });
  assert.ok(has(r.issues, "image_only"));
});

test("spam words + shouting subject are penalised", () => {
  const r = analyzeEmail({
    subject: "CONGRATULATIONS YOU WON A FREE PRIZE!!!",
    isHtml: false,
    text: "Act now and buy now to claim your 100% free cash bonus. Click here, this is a guaranteed winner!",
    recipientCount: 1,
  });
  assert.ok(has(r.issues, "subject_caps"));
  assert.ok(has(r.issues, "subject_punct"));
  assert.ok(has(r.issues, "subject_spam_words") || has(r.issues, "body_spam_words"));
  assert.ok(r.score < 75, `expected penalised score, got ${r.score}`);
});

test("missing alt text is a warning", () => {
  const r = analyzeEmail({
    subject: "Newsletter",
    isHtml: true,
    html: '<p>Here is our latest update with plenty of words to make the ratio healthy and readable for everyone.</p><img src="a.png"/>',
    recipientCount: 1,
  });
  assert.ok(has(r.issues, "img_alt"));
});

test("link stuffing is detected", () => {
  const links = Array.from({ length: 15 }, (_, i) => `<a href="https://x.com/${i}">l${i}</a>`).join(" ");
  const r = analyzeEmail({ subject: "Links", isHtml: true, html: `<p>Short note.</p>${links}`, recipientCount: 1 });
  assert.ok(has(r.issues, "link_stuffing"));
});

test("many To recipients suggests Bcc", () => {
  const r = analyzeEmail({ subject: "Update", isHtml: false, text: "A reasonable amount of body text for this broadcast message.", recipientCount: 25 });
  assert.ok(has(r.issues, "many_recipients"));
});

test("score never leaves 0..100", () => {
  const r = analyzeEmail({ subject: "", isHtml: true, html: "", recipientCount: 999 });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log(`\n${passed} tests passed.`);
