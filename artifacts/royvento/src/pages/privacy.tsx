import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "26 May 2026";

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
            Royvento ("we", "us", or "our") operates the Royvento platform — a marketplace connecting customers ("Users") with event venues and pub partners ("Pub Partners") across India. This Privacy Policy explains how we collect, use, and protect personal and business information when you use our Service, whether as a User or a Pub Partner.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Information We Collect from Users</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Account information:</strong> Name, email address, phone number, and password when you register.</li>
            <li><strong className="text-foreground">Booking data:</strong> Event bookings, ticket types, number of guests, and payment method preferences.</li>
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
          <h2 className="text-lg font-semibold text-foreground mb-2">4. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To create and manage accounts, process bookings, and settle Partner payouts.</li>
            <li>To send booking confirmations, reminders, payout notices, and service updates via email or SMS.</li>
            <li>To personalise the experience — for example, surfacing events in your city.</li>
            <li>To verify Pub Partner eligibility and the accuracy of listings.</li>
            <li>To improve the platform through analytics and user research.</li>
            <li>To detect and prevent fraud, abuse, or security incidents.</li>
            <li>To comply with applicable laws and legal obligations, including tax and record-keeping requirements.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Sharing Your Information</h2>
          <p>
            We do not sell your personal data. We may share information in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">With Pub Partners:</strong> When you make a booking, your name and contact details are shared with the relevant Pub Partner so they can manage attendance and provide the service.</li>
            <li><strong className="text-foreground">With Users:</strong> A Pub Partner's public venue and event information is displayed to Users; payout and private business details are never shown publicly.</li>
            <li><strong className="text-foreground">Payment processors:</strong> Payment and payout data is handled by third-party processors (e.g. PhonePe) and is governed by their own privacy policies.</li>
            <li><strong className="text-foreground">Service providers:</strong> We use third-party services for hosting, analytics, and communications, all operating under data processing agreements.</li>
            <li><strong className="text-foreground">Legal requirements:</strong> We may disclose data if required by law, court order, or to protect the rights and safety of Royvento, our Users, or our Partners.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Cookies &amp; Tracking</h2>
          <p>
            We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the platform is used. You can disable cookies in your browser settings, but some features may not work correctly as a result.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Data Retention</h2>
          <p>
            We retain account, booking, and payout data for as long as your account is active or as required to fulfil the purposes described in this Policy. Transaction, invoice, and payout records may be retained for longer where tax or accounting law requires. You may request deletion of your account at any time; we will delete your personal data within 30 days, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Your Rights</h2>
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
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including encrypted connections (HTTPS), hashed passwords, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Children's Privacy</h2>
          <p>
            The Service is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If we become aware that a minor has provided us with personal data, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the updated Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">12. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy, please contact us via our{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact page</Link> or email{" "}
            <a href="mailto:info@royvento.com" className="text-primary hover:underline">info@royvento.com</a>.
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
