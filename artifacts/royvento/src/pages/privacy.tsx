import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "9 June 2026";

export function Privacy() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-16 max-w-3xl">
      <SEO
        title="Privacy Policy | Royvento"
        description="How Royvento collects, uses and safeguards personal and business data for both customers and pub partners — including bookings, payments, payouts and marketing preferences."
        canonical="/privacy"
      />
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Legal</p>
        <h1 className="font-serif text-4xl font-bold mb-3">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm leading-7 text-muted-foreground">

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Who We Are</h2>
          <p>
            Royvento ("we", "us", or "our") operates the Royvento platform — a marketplace connecting customers ("Users") with pubs, clubs, event organisers, and game/entertainment organisers ("Partners") across India, including ticketed events, table and game bookings, food &amp; drink offers, a loyalty points programme, and our premium <strong className="text-foreground">Solo Connect</strong> feature. This Privacy Policy explains how we collect, use, and protect personal and business information when you use our Service, whether as a User or a Partner.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Information We Collect from Users</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Account information:</strong> Name, email address, phone number, gender (collected once during onboarding), and password when you register.</li>
            <li><strong className="text-foreground">Booking data:</strong> Event, table, and game bookings, ticket types, number of guests, and payment method preferences.</li>
            <li><strong className="text-foreground">Location data:</strong> City selected by you or, with your permission, your approximate location for personalisation.</li>
            <li><strong className="text-foreground">Usage data:</strong> Pages visited, search queries, filters used, and interactions with listings.</li>
            <li><strong className="text-foreground">Device data:</strong> Device type, operating system, browser type, and IP address.</li>
            <li><strong className="text-foreground">Communications:</strong> Messages you send to us via contact forms or support channels.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Information We Collect from Pub Partners</h2>
          <p>
            When you register as a Pub Partner, we additionally collect business and verification information needed to list your venue and pay you:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">Business details:</strong> Business or venue name, address, contact person, business phone and email, and operating hours.</li>
            <li><strong className="text-foreground">Verification &amp; compliance:</strong> Licence and registration details (such as liquor licence, FSSAI, and GST number) where required to verify your venue.</li>
            <li><strong className="text-foreground">Payout details:</strong> Bank account or UPI details used to settle the amounts we collect on your behalf, net of commission.</li>
            <li><strong className="text-foreground">Listing content:</strong> Venue and event descriptions, pricing, images, offers, and cancellation policies you publish.</li>
            <li><strong className="text-foreground">Performance data:</strong> Bookings, ticket sales, ratings, and other metrics shown in your partner dashboard.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Solo Connect &amp; Identity Verification</h2>
          <p>
            If you use our premium <strong className="text-foreground">Solo Connect</strong> feature, we collect additional information specifically to verify identity and keep members safe:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">Identity documents:</strong> An image of a government ID you upload (Passport, Driving Licence, or Voter ID) and a selfie, used solely to verify that you are a real, unique person.</li>
            <li><strong className="text-foreground">Mobile verification:</strong> Your mobile number and a one-time passcode (OTP) used to confirm it.</li>
            <li><strong className="text-foreground">Gender &amp; location:</strong> Your profile gender and current city — used to enforce single-gender, same-city groups. We request device location only to determine your city.</li>
            <li><strong className="text-foreground">Group activity:</strong> Groups you create or join, membership status, and ratings/reputation you give or receive.</li>
            <li><strong className="text-foreground">Group chat:</strong> Messages you post in a group's temporary chat. These are visible to that group's members and are <strong className="text-foreground">automatically and permanently deleted every day at 3:00 AM</strong>.</li>
            <li><strong className="text-foreground">Reports:</strong> Any reports you submit, or that are submitted about you, for safety and moderation.</li>
          </ul>
          <p className="mt-3">
            Your ID document and selfie are reviewed only by Royvento's moderation team for verification and are <strong className="text-foreground">never shown to other members</strong>. Within a group, other members see only your name and approved status — not your documents, contact details, or exact location. We use this information to verify identity, enforce safety rules, review reports, and take enforcement action against misuse. Providing this information is optional, but Solo Connect cannot be used without it.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Offline safety is your responsibility.</strong> Identity verification reduces but does not eliminate risk, and it is not a background check or a guarantee about any member's character or conduct. Joining Solo Connect and meeting anyone in person is entirely voluntary and at your own risk. Royvento does not supervise or take part in offline meetups and is not responsible for what happens during them. <strong className="text-foreground">If you ever feel unsafe, suspicious, or uncomfortable, leave immediately and contact local emergency services directly — in India dial 112, 100, or 1091.</strong> The in-app Safety Center provides these emergency contacts for your convenience only. Full details of these terms are set out in our <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To create and manage accounts, process bookings, and settle Partner payouts.</li>
            <li>To send booking confirmations, reminders, payout notices, and service updates via email or SMS.</li>
            <li>To personalise the experience — for example, surfacing events in your city.</li>
            <li>To verify Partner eligibility and the accuracy of listings.</li>
            <li>To verify member identity for Solo Connect, enforce single-gender and same-city group rules, review reports, and act against misuse.</li>
            <li>To run the loyalty points programme — awarding, expiring, and reconciling points.</li>
            <li>To improve the platform through analytics and user research.</li>
            <li>To detect and prevent fraud, abuse, or security incidents.</li>
            <li>To comply with applicable laws and legal obligations, including tax and record-keeping requirements.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Sharing Your Information</h2>
          <p>
            We do not sell your personal data. We may share information in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">With Pub Partners:</strong> When you make a booking, your name and contact details are shared with the relevant Pub Partner so they can manage attendance and provide the service.</li>
            <li><strong className="text-foreground">With Users:</strong> A Partner's public venue and event information is displayed to Users; payout and private business details are never shown publicly.</li>
            <li><strong className="text-foreground">Within Solo Connect groups:</strong> Other members of a group you join see only your name and approved status. Your identity documents, selfie, contact details, and exact location are never shared with other members.</li>
            <li><strong className="text-foreground">Payment processors:</strong> Payment and payout data is handled by third-party processors (e.g. PhonePe) and is governed by their own privacy policies.</li>
            <li><strong className="text-foreground">Service providers:</strong> We use third-party services for hosting, analytics, and communications, all operating under data processing agreements.</li>
            <li><strong className="text-foreground">Legal requirements:</strong> We may disclose data if required by law, court order, or to protect the rights and safety of Royvento, our Users, or our Partners.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Cookies &amp; Tracking</h2>
          <p>
            We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the platform is used. You can disable cookies in your browser settings, but some features may not work correctly as a result.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Data Retention</h2>
          <p>
            We retain account, booking, and payout data for as long as your account is active or as required to fulfil the purposes described in this Policy. Transaction, invoice, and payout records may be retained for longer where tax or accounting law requires. <strong className="text-foreground">Solo Connect group chat messages are deleted automatically every day at 3:00 AM.</strong> Identity-verification records (including your ID document and selfie) are retained only while needed to keep your verification valid and to maintain platform safety, and are deleted when you close your account or your verification is removed, except where short-term retention is required to handle a safety report or to comply with law. You may request deletion of your account at any time; we will delete your personal data within 30 days, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate or incomplete information.</li>
            <li>Request deletion of your personal data.</li>
            <li>Opt out of marketing communications at any time.</li>
            <li>Withdraw consent for optional data processing.</li>
          </ul>
          <p className="mt-3">To exercise any of these rights, contact us using the details below.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including encrypted connections (HTTPS), hashed passwords, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
          <p className="mt-3">
            Royvento will never ask for your password, OTP, card CVV, PIN, or full card number by phone, email, or SMS. If you receive such a request, do not respond and report it to{" "}
            <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Children's Privacy</h2>
          <p>
            The Service is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If we become aware that a minor has provided us with personal data, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the updated Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">13. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy, please contact us via our{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact page</Link> or email{" "}
            <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>.
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-white/10 flex gap-4 text-xs text-muted-foreground">
        <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>
        <Link href="/contact" className="hover:text-foreground">Contact</Link>
      </div>
    </div>
  );
}
