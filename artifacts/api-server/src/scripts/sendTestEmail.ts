/**
 * One-off: send a test email through the Email Management send path.
 *
 *   pnpm --filter @workspace/api-server exec tsx --env-file=.env.local src/scripts/sendTestEmail.ts [recipient]
 *
 * Requires RESEND_API_KEY in the environment to actually deliver; without it
 * the send is logged in dev mode (no real email is sent).
 */

import { sendEmailViaResend, wrapHtmlEmail, getInfoFromAddress } from "../lib/emailService";

async function main() {
  const to = process.argv[2] ?? "sandipd310@gmail.com";
  const hasKey = !!process.env["RESEND_API_KEY"];

  console.log("──────────────────────────────────────────────");
  console.log("Royvento email — test send");
  console.log("From:           ", getInfoFromAddress());
  console.log("To:             ", to);
  console.log("RESEND_API_KEY: ", hasKey ? "present (will deliver)" : "MISSING (dev mode — not delivered)");
  console.log("──────────────────────────────────────────────");

  const html = wrapHtmlEmail(`
    <p style="margin:0 0 16px 0;font-size:17px;font-weight:600;">Test email from Royvento</p>
    <p style="margin:0 0 16px 0;color:#333;">This is a test of the new <strong>Send &amp; Receive Email</strong> system in the Admin Panel, delivered via Resend.</p>
    <p style="margin:0 0 16px 0;color:#333;">If you're reading this in your inbox, sending works end-to-end. 🎉</p>
    <p style="margin:24px 0 0 0;color:#888;font-size:13px;">— The Royvento team</p>
  `);

  const text = [
    "Test email from Royvento",
    "",
    "This is a test of the new Send & Receive Email system in the Admin Panel, delivered via Resend.",
    "If you're reading this in your inbox, sending works end-to-end.",
    "",
    "— The Royvento team",
  ].join("\n");

  const result = await sendEmailViaResend({
    to: [to],
    subject: "Royvento test email — Email Management System",
    html,
    text,
  });

  console.log("Result:", JSON.stringify(result, null, 2));
  if (result.ok && hasKey) console.log("\n✅ Sent. Check the inbox (and spam) for", to);
  else if (result.ok && !hasKey) console.log("\nℹ️  Dev mode: payload built OK but no email was delivered (set RESEND_API_KEY to deliver).");
  else console.log("\n❌ Send failed:", result.error);

  process.exit(0);
}

main().catch((err) => {
  console.error("Test send threw:", err);
  process.exit(1);
});
