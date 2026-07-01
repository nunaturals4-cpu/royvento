import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "1 July 2026";

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
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Consent &amp; Legal Basis</h2>
          <p>
            By using the Service and providing your information, you consent to the collection, use, storage, processing, and disclosure of your information as described in this Policy, in accordance with the <strong className="text-foreground">Digital Personal Data Protection Act, 2023</strong>, the Information Technology Act, 2000, and other applicable laws. We process personal data where you have given consent, where it is necessary to provide the Service or perform a contract with you, to comply with a legal obligation, or for our legitimate interests in operating, securing, and improving the Service.
          </p>
          <p className="mt-3">
            Providing certain information is necessary to use the Service; if you do not provide it, we may be unable to offer some features. You may withdraw your consent at any time by contacting us, although this will not affect any processing already carried out and may limit your ability to use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Information We Collect from Users</h2>
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
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Information We Collect from Pub Partners</h2>
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
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Solo Connector &amp; Verification</h2>
          <p>
            If you use our premium <strong className="text-foreground">Solo Connector</strong> feature, we collect additional information specifically to verify you are a real person and to keep members safe:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">Mobile verification:</strong> Your mobile number, verified via <strong className="text-foreground">Firebase Phone Authentication</strong> (an OTP sent by SMS). We store the verified number and a Firebase account identifier; we do not store the SMS code.</li>
            <li><strong className="text-foreground">Live selfie:</strong> A selfie captured live with your camera (gallery uploads are not accepted), used solely to confirm you are a real, unique person.</li>
            <li><strong className="text-foreground">Gender &amp; location:</strong> The gender you select and your current city. Gender is shown only as an aggregate member count on group cards; city is used so you only see groups in your city.</li>
            <li><strong className="text-foreground">Group activity:</strong> Groups you create or join and your membership status.</li>
            <li><strong className="text-foreground">Group chat:</strong> Messages you post in a group's temporary chat. These are visible to that group's members and are <strong className="text-foreground">automatically and permanently deleted every day at 3:00 AM</strong>.</li>
            <li><strong className="text-foreground">Reports:</strong> Any reports (and optional evidence photos) you submit, or that are submitted about you, for safety and moderation.</li>
          </ul>
          <p className="mt-3">
            Your selfie is reviewed only by Royvento's moderation team for verification and is <strong className="text-foreground">never shown to other members</strong> — it is served only through an access-controlled, admin-authenticated channel. Within a group, other members see only your name, the group's aggregate gender counts, and your approved status — not your selfie, phone number, or exact location.
          </p>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mt-3 space-y-2">
            <p>Royvento only provides a platform for users to discover and join social groups.</p>
            <p>Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, interactions, conversations, or activities that occur after users join a group.</p>
            <p>Users participate entirely at their own risk and are responsible for exercising personal judgment and ensuring their own safety.</p>
            <p>Royvento is not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents that occur during or after meeting group members.</p>
          </div>
          <p className="mt-3">
            <strong className="text-foreground">If you ever feel unsafe, leave immediately and contact local emergency services directly — in India dial 112, 100, or 1091.</strong> See our <Link href="/community-guidelines" className="text-primary hover:underline">Community Guidelines</Link> and <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To create and manage accounts, process bookings, and settle Partner payouts.</li>
            <li>To send booking confirmations, reminders, payout notices, and service updates via email or SMS.</li>
            <li>To personalise the experience — for example, surfacing events in your city.</li>
            <li>To verify Partner eligibility and the accuracy of listings.</li>
            <li>To verify members for Solo Connector, enforce same-city group rules, review reports, and act against misuse.</li>
            <li>To run the loyalty points programme — awarding, expiring, and reconciling points.</li>
            <li>To improve the platform through analytics and user research.</li>
            <li>To detect and prevent fraud, abuse, or security incidents.</li>
            <li>To comply with applicable laws and legal obligations, including tax and record-keeping requirements.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Sharing Your Information</h2>
          <p>
            We do not sell your personal data. We may share information in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">With Pub Partners:</strong> When you make a booking, your name and contact details are shared with the relevant Pub Partner so they can manage attendance and provide the service.</li>
            <li><strong className="text-foreground">With Users:</strong> A Partner's public venue and event information is displayed to Users; payout and private business details are never shown publicly.</li>
            <li><strong className="text-foreground">Within Solo Connector groups:</strong> Other members of a group you join see only your name and approved status. Your selfie, phone number, and exact location are never shared with other members.</li>
            <li><strong className="text-foreground">Payment processors:</strong> Payment and payout data is handled by third-party processors (e.g. PhonePe) and is governed by their own privacy policies.</li>
            <li><strong className="text-foreground">Service providers:</strong> We use third-party services for hosting, analytics, and communications, all operating under data processing agreements.</li>
            <li><strong className="text-foreground">Legal requirements:</strong> We may disclose data if required by law, court order, or to protect the rights and safety of Royvento, our Users, or our Partners.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Cookies &amp; Tracking</h2>
          <p>
            We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the platform is used. You can disable cookies in your browser settings, but some features may not work correctly as a result.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Third-Party Services &amp; Links</h2>
          <p>
            The Service integrates with and links to third-party services — including payment processors (e.g. PhonePe), authentication (e.g. Firebase), mapping, hosting, analytics, and communications providers. When you use these, your information may be processed by them under their own privacy policies, which we do not control. The Service may also contain links to third-party websites; we are not responsible for the content, security, or privacy practices of those sites, and we encourage you to review their policies before providing any information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. International Data Transfers</h2>
          <p>
            We are based in India and primarily process data within India. Some of our service providers may store or process data on servers located outside India. Where data is transferred across borders, we take reasonable steps to ensure it continues to be protected consistently with this Policy and applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Data Retention</h2>
          <p>
            We retain account, booking, and payout data for as long as your account is active or as required to fulfil the purposes described in this Policy. Transaction, invoice, and payout records may be retained for longer where tax or accounting law requires. <strong className="text-foreground">Solo Connector group chat messages are deleted automatically every day at 3:00 AM, and inactive groups (with their chat and data) are removed automatically after 15 days.</strong> Verification records (including your selfie) are retained only while needed to keep your verification valid and to maintain platform safety, and are deleted when you close your account or your verification is removed, except where short-term retention is required to handle a safety report or to comply with law. You may request deletion of your account at any time; we will delete your personal data within 30 days, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">12. Your Rights</h2>
          <p>Subject to applicable law, including the Digital Personal Data Protection Act, 2023, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate or incomplete information.</li>
            <li>Request deletion of your personal data.</li>
            <li>Opt out of marketing communications at any time.</li>
            <li>Withdraw consent for optional data processing.</li>
            <li>Nominate another individual to exercise your rights in the event of your death or incapacity.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us using the details below. We may need to verify your identity before acting on a request, and some rights may be subject to legal exceptions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">13. Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including encrypted connections (HTTPS), hashed passwords, and access controls. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
          <p className="mt-3">
            Royvento will never ask for your password, OTP, card CVV, PIN, or full card number by phone, email, or SMS. If you receive such a request, do not respond and report it to{" "}
            <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">14. Limitation of Liability</h2>
          <p>
            While we take reasonable measures to protect your information, you provide it at your own risk. To the fullest extent permitted by law, Royvento is not liable for any unauthorised access to, or loss, misuse, or alteration of, your information arising from events beyond our reasonable control — including hacking, third-party breaches, or your own failure to safeguard your credentials. Your use of the Service is also governed by our{" "}
            <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>, including their limitation of liability.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">15. Children's Privacy</h2>
          <p>
            The Service is intended for users aged 18 and over. We do not knowingly collect personal data from anyone under 18. If we become aware that a minor has provided us with personal data, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">16. Grievance Officer &amp; Data Protection Contact</h2>
          <p>
            In accordance with the Information Technology Act, 2000, the rules made thereunder, and the Digital Personal Data Protection Act, 2023, you may contact our Grievance Officer regarding this Policy, your personal data, or any concern about how your information is handled:
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Sandip Dey</strong> — Grievance Officer, Royvento<br />
            Near New Town Water Tank No. 3, Kolkata - 700156<br />
            Email: <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>
          </p>
          <p className="mt-3">
            We will acknowledge your complaint within 48 hours and endeavour to resolve it within the timelines prescribed by applicable law. If you are not satisfied with our response, you may have the right to escalate your complaint to the Data Protection Board of India or other competent authority.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">17. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the updated Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">18. Contact Us</h2>
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
