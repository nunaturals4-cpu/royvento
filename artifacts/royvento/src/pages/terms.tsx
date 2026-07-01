import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "1 July 2026";

export function Terms() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-16 max-w-3xl">
      <SEO
        title="Terms & Conditions | Royvento"
        description="The terms and conditions that govern your use of Royvento — covering both customers who book and pub partners who list venues, events, payments, commissions and cancellations."
        canonical="/terms"
      />
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Legal</p>
        <h1 className="font-serif text-4xl font-bold mb-3">Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm leading-7 text-muted-foreground">

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Introduction</h2>
          <p>
            Welcome to <strong className="text-foreground">Royvento</strong> ("we", "us", or "our"). By accessing or using the Royvento platform — including our website, mobile application, and related services (collectively, the "Service") — you agree to be bound by these Terms &amp; Conditions. If you do not agree, please do not use the Service.
          </p>
          <p className="mt-3">
            These Terms apply to two types of account holders:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            <li><strong className="text-foreground">Users</strong> (also "Customers") — individuals who browse, book, and attend events, reserve tables, book games, or join Solo Connect groups on Royvento.</li>
            <li><strong className="text-foreground">Partners</strong> (also "Pub Partners" or "Vendors") — pubs, clubs, restaurants, event organisers, and game/entertainment organisers who list their venues, events, games, offers, and tickets on Royvento.</li>
          </ul>
          <p className="mt-3">
            Royvento brings these together across nightlife (pubs &amp; clubs), ticketed events, games &amp; entertainment venues, food &amp; drink offers, a loyalty points programme, and <strong className="text-foreground">Solo Connect</strong> — a premium, verified group-discovery feature for going out alone.
          </p>
          <p className="mt-3">
            Sections 3–4 apply to all account holders. Section 5 applies specifically to Users; Section 6 applies specifically to Partners; Section 7 applies specifically to Solo Connect.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Our Role as a Platform</h2>
          <p>
            Royvento is an intermediary marketplace that connects Users with Pub Partners. Pub Partners are independent third parties; Royvento does not own, operate, or control the venues, events, food, or beverages offered through the Service. Any contract for the supply of services or goods is formed directly between the User and the Pub Partner. Royvento is not a party to that contract and is not liable for its performance.
          </p>
          <p className="mt-3">
            Royvento acts solely as an <strong className="text-foreground">"intermediary"</strong> within the meaning of the Information Technology Act, 2000 and the rules made thereunder. Listings, offers, reviews, images, group content, and other materials made available through the Service are provided by Users and Partners, not by Royvento. Except where we expressly state that we have verified something, Royvento does not create, endorse, verify, or guarantee any third-party content, and is entitled to the protections and safe harbour available to intermediaries under applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Eligibility &amp; Accounts</h2>
          <p>
            You must be at least 18 years old to use the Service or to make or accept bookings at venues that serve alcohol. By creating an account you represent and warrant that you meet this requirement and that the information you provide is accurate and kept up to date. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Acceptable Use</h2>
          <p>
            All account holders agree not to misuse the Service, including but not limited to: submitting false, fraudulent, or duplicate bookings or listings; scraping or crawling content without permission; uploading unlawful, misleading, or infringing content; or attempting to interfere with the security or availability of the platform. You agree to treat venue staff, guests, Partners, and Royvento personnel with respect. Abusive, threatening, or illegal behaviour may result in immediate suspension of your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Terms for Users</h2>
          <p>
            <strong className="text-foreground">Bookings.</strong> Bookings made through Royvento are subject to availability and confirmation by the Pub Partner. A booking is only confirmed once you receive a confirmation notification from us.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Payments.</strong> Payment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking via our payment processor. All stated prices are inclusive of applicable taxes unless noted otherwise.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Fees &amp; charges.</strong> Royvento may charge a convenience or booking fee on certain bookings or ticket purchases. Where applicable, this fee is shown to you clearly at checkout before you confirm and pay, and is collected by Royvento for the booking service it provides, separately from any amount payable to the Pub Partner. Unless stated otherwise at checkout or required by law, convenience and booking fees are non-refundable, including where a booking is later cancelled.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Cancellations &amp; refunds.</strong> Cancellation and refund policies are set by individual Pub Partners and shown on the event detail page before you book. Where a refund is due, it is processed to your original payment method, less any non-refundable fees disclosed at checkout. Royvento facilitates but is not responsible for refund decisions made by Pub Partners.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">At the venue.</strong> You are responsible for carrying valid ID and any required ticket or booking reference, for complying with all local laws and venue rules, and for drinking responsibly. Entry may be refused for intoxication, underage attendance, or breach of venue policy without a refund.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Loyalty points.</strong> Royvento may award promotional loyalty points for activity such as bookings, check-ins, referrals, or subscriptions. Points have no cash value, are non-transferable, may expire (typically after a set period from the date earned), and may be adjusted or revoked where they were earned through error, fraud, or abuse. We may change or end the points programme at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Terms for Pub Partners</h2>
          <p>
            <strong className="text-foreground">Listings &amp; accuracy.</strong> You are solely responsible for the content of your listings — including venue details, event descriptions, pricing, capacity, ticket types, offers, images, and cancellation policies — and warrant that they are accurate, lawful, and kept current. You must honour every confirmed booking at the price and terms displayed at the time of booking.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Licences &amp; compliance.</strong> You represent and warrant that you hold all licences, permits, and registrations required to operate your venue and serve food and alcohol (including any liquor licence and FSSAI registration), and that you comply with all applicable laws, including fire-safety, occupancy, taxation (GST), and local excise regulations. Royvento may request proof of such licences and may suspend or remove listings that do not comply.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Commissions &amp; payouts.</strong> Royvento charges a commission on bookings and ticket sales made through the Service, at the rate agreed in your partner dashboard or partner agreement. Commission is deducted from amounts collected on your behalf, and the net balance is paid out to your nominated bank account according to the payout schedule then in effect. You are responsible for issuing any tax invoices required by law to your customers and for your own tax obligations.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Cancellations &amp; service quality.</strong> You set your own cancellation and refund policy but must apply it fairly and honour valid refund requests promptly. Repeated cancellations, no-shows, misleading listings, or poor service quality may result in reduced visibility, suspension, or removal from the platform.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Partner indemnity.</strong> You are solely responsible for the goods, services, events, and experiences you provide, and for compliance with all laws applicable to them. You agree to indemnify and hold Royvento harmless from any claim, penalty, or liability arising from your listings, your service to customers, your breach of these Terms, or your non-compliance with any law, licence, or tax obligation.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Suspension &amp; delisting.</strong> Royvento may suspend, restrict, or delist a Partner account at its discretion where there is suspected fraud, a breach of these Terms, a regulatory issue, or a risk to Users. Outstanding confirmed bookings must still be honoured, and verified payouts due to you for completed bookings will be settled in the ordinary course.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Solo Connector</h2>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 mb-3 space-y-2">
            <p>Royvento only provides a platform for users to discover and join social groups.</p>
            <p>Royvento does not organize, supervise, verify, monitor, or take responsibility for meetings, outings, interactions, conversations, or activities that occur after users join a group.</p>
            <p>Users participate entirely at their own risk and are responsible for exercising personal judgment and ensuring their own safety.</p>
            <p>Royvento is not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents that occur during or after meeting group members.</p>
          </div>
          <p>
            <strong className="text-foreground">What it is.</strong> Solo Connector is a premium, moderated feature that lets verified members discover and join small, activity-based groups (for nightlife, events, games, and activities) so they can go out when going alone. It is <strong className="text-foreground">not</strong> a dating service — members join experiences, not individuals. See our <Link href="/community-guidelines" className="text-foreground underline">Community Guidelines</Link>.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Eligibility.</strong> Solo Connector is available only to Royvento Premium subscribers and verified Partners, and only to members aged 18 or over. Access may be withdrawn at any time for breach of these Terms.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Verification &amp; consent.</strong> Before creating or joining any group you must verify your mobile number (via Firebase Phone Authentication), capture a live selfie, select your gender, and acknowledge these Terms, the Privacy Policy, and the Community Guidelines. You represent that the selfie is a genuine, current image of yourself. Royvento reviews submissions and may approve, reject, suspend, ban, or later revoke access at its discretion.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Single-gender, same-city groups.</strong> For member safety, groups are single-gender and you may only view or join groups that match the gender recorded on your profile and your current verified city. Mixed-gender groups are not permitted, and you may not attempt to access groups outside your gender category or city.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Conduct &amp; zero-tolerance policy.</strong> You must treat every member with respect. Harassment, abuse, threats, impersonation, fake identity, spam, solicitation, sharing of others' private information, or any unsafe behaviour is strictly prohibited. Violations result in <strong className="text-foreground">immediate and permanent removal from Solo Connect, forfeiture of your reputation points</strong>, and may lead to suspension of your Royvento account and referral to law-enforcement where appropriate.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Temporary group chat.</strong> Each group includes a temporary chat whose messages are automatically and permanently deleted every day at 3:00 AM. The chat is not a record-keeping service; do not rely on it to retain information and never share sensitive, personal, or financial details in it.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Voluntary participation.</strong> Joining Solo Connect and attending any meetup is entirely your own choice. Royvento does not require you to meet anyone, and you may leave a group or stop participating at any time. By choosing to use Solo Connect and to meet other members offline, you accept full personal responsibility for that decision.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Offline meetings &amp; your safety.</strong> Members may choose to meet in person. Royvento does not arrange, host, supervise, accompany, vet beyond the verification described above, or guarantee any meetup, member, venue, or outcome, and is <strong className="text-foreground">not responsible or liable for anything that happens offline</strong>, including the conduct of other members. You meet and attend entirely at your own risk. Always meet in public places, tell someone where you are going, and never share financial information. <strong className="text-foreground">If at any point you feel unsafe, suspicious, or uncomfortable, leave the location immediately and, where needed, contact local emergency services directly — in India dial 112 (emergency), 100 (police), or 1091 (women's helpline).</strong> Royvento's role is limited to providing the platform and the in-app Safety Center emergency contacts for your convenience; it cannot intervene in or take responsibility for offline interactions. Your decision to use Solo Connect, to meet anyone, and to act on any safety concern remains your own.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Reputation &amp; ratings.</strong> After activities, members may rate the group, organiser, and overall experience. These feed a reputation score. Members with repeated violations or consistently poor ratings may lose visibility or access to Solo Connect.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Fraud Prevention &amp; Payment Safety</h2>
          <p>
            Royvento communicates with you only through its official website, mobile application, and the contact channels published on this site. Royvento and its staff will never ask for your one-time password (OTP), card CVV, PIN, full card number, UPI PIN, or account password by phone, email, SMS, or chat. All payments must be made only through the official payment options presented within the Service; never transfer money to a personal account or pay outside the platform at the request of any person claiming to represent Royvento or a Pub Partner. If you receive a suspicious request or believe you have been targeted by a fraudulent or phishing attempt, do not share any details and report it to us at{" "}
            <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>. Royvento is not responsible for losses arising from payments made, or information shared, outside its official channels.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Assumption of Risk &amp; Personal Responsibility</h2>
          <p>
            Attending venues, events, games, parties, and any activity discovered through Royvento is voluntary and undertaken <strong className="text-foreground">at your own risk</strong>. You are responsible for your own health, safety, conduct, belongings, and lawful behaviour, including responsible consumption of alcohol and compliance with all venue rules and local laws. Royvento does not supervise, control, or guarantee the condition or safety of any venue or event, the conduct of any Partner, staff member, performer, or other guest, or any outcome of your attendance.
          </p>
          <p className="mt-3">
            To the fullest extent permitted by law, Royvento is <strong className="text-foreground">not liable for any personal injury, illness, death, loss, theft, damage, altercation, harassment, or other harm</strong> arising before, during, or after any booking, event, meetup, or activity, whether caused by a Partner, another User, a third party, or your own acts or omissions. You are solely responsible for assessing whether any venue, event, or activity is appropriate and safe for you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. User-Generated Content &amp; Reviews</h2>
          <p>
            The Service may allow you to submit reviews, ratings, photos, comments, group messages, and other materials ("User Content"). You are solely responsible for your User Content and represent that you own or have the rights to it and that it is lawful, accurate, and not defamatory, obscene, infringing, harassing, or misleading. By submitting User Content you grant Royvento a worldwide, perpetual, irrevocable, royalty-free, transferable, and sub-licensable licence to use, host, store, reproduce, adapt, publish, translate, and display it in connection with operating, improving, and promoting the Service.
          </p>
          <p className="mt-3">
            Royvento does not endorse any User Content and may, without obligation and without notice, review, moderate, refuse, edit, disable, or remove any User Content at its discretion — including on receipt of a valid complaint or legal notice — without liability to you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Third-Party Links &amp; Services</h2>
          <p>
            The Service may contain links to, or integrations with, third-party websites, applications, and services (including payment processors, mapping, authentication, and analytics providers). These are provided for convenience only. Royvento does not control and is not responsible for the content, policies, availability, security, or practices of any third party, and your use of them is governed by their own terms and undertaken at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">12. Intellectual Property</h2>
          <p>
            All content on the Royvento platform — including logos, design, text, and software — is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent. Pub Partners grant Royvento a non-exclusive, royalty-free licence to display their venue name, logo, images, and listing content for the purpose of operating and promoting the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">13. Disclaimer of Warranties</h2>
          <p>
            The Service is provided on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. Royvento does not warrant that the Service will be uninterrupted, timely, secure, or error-free, or that listings, pricing, availability, or other information provided by Pub Partners are accurate, complete, or current. The quality, safety, and legality of venues, events, food, and beverages are the sole responsibility of the relevant Pub Partner, and any reliance you place on the Service or on Pub Partner content is at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">14. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, punitive, or consequential damages arising out of or related to your use of, or inability to use, the Service, including but not limited to damages for loss of profits, revenue, data, goodwill, or other intangible losses, for any service interruption or data loss, or for the acts or omissions of any Pub Partner, User, or third party.
          </p>
          <p className="mt-3">
            To the maximum extent permitted by law, Royvento's total aggregate liability to you for any and all claims arising from or related to the Service shall not exceed the greater of (a) the total fees or commission you actually paid to Royvento in connection with the transaction giving rise to the claim, or (b) INR 1,000 (Indian Rupees one thousand).
          </p>
          <p className="mt-3">
            Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law. Where such liability cannot be wholly excluded, it is limited to the minimum extent permitted by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">15. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Royvento and its officers, directors, employees, and agents from and against any claims, demands, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or related to: (a) your use or misuse of the Service; (b) your breach of these Terms or of any applicable law; (c) any content you submit or listing you publish; or (d) your violation of the rights of any third party, including any Pub Partner or User. Royvento may, at your expense, assume the exclusive defence and control of any matter subject to indemnification, and you agree to cooperate with that defence.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">16. Force Majeure</h2>
          <p>
            Royvento shall not be liable for any failure or delay in performing its obligations, or for any unavailability of the Service, caused by circumstances beyond its reasonable control, including acts of God, natural disasters, epidemics or pandemics, fire, flood, power or internet failure, strikes, civil unrest, war, terrorism, government or regulatory action, or the failure of any third-party service provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">17. Termination &amp; Suspension</h2>
          <p>
            You may stop using the Service and close your account at any time. Royvento may suspend, restrict, or terminate your access to the Service, in whole or in part, with or without prior notice, where we reasonably believe you have breached these Terms or any applicable law, engaged in fraudulent, abusive, or harmful conduct, or where action is needed to protect the Service, other Users, or Pub Partners. On termination your right to use the Service ends immediately; confirmed bookings and any payment, payout, refund, or tax obligations accrued beforehand survive, as do the provisions that by their nature should continue (including Assumption of Risk &amp; Personal Responsibility, Intellectual Property, Disclaimer of Warranties, Limitation of Liability, Indemnification, Force Majeure, Grievance Redressal &amp; Dispute Resolution, General Provisions, and Governing Law).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">18. Grievance Redressal &amp; Dispute Resolution</h2>
          <p>
            <strong className="text-foreground">Grievance Officer.</strong> In accordance with the Information Technology Act, 2000 and the rules made thereunder, any complaint regarding the Service or any content available on it may be addressed to our Grievance Officer:
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Sandip Dey</strong> — Grievance Officer, Royvento<br />
            Near New Town Water Tank No. 3, Kolkata - 700156<br />
            Email: <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>
          </p>
          <p className="mt-3">
            We will acknowledge your complaint within 48 hours and endeavour to resolve it within the timelines prescribed by applicable law.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Amicable resolution.</strong> Before initiating any formal proceedings, you agree to first contact us and attempt in good faith to resolve any dispute informally.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">Arbitration.</strong> Any dispute, claim, or difference arising out of or relating to these Terms or the Service that is not resolved informally shall be referred to and finally settled by arbitration by a sole arbitrator appointed by mutual agreement of the parties in accordance with the Arbitration and Conciliation Act, 1996. The seat and venue of arbitration shall be Kolkata, West Bengal, and the proceedings shall be conducted in English. The arbitrator's award shall be final and binding on the parties. Nothing in this clause prevents Royvento from seeking urgent injunctive or equitable relief before any court of competent jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">19. General Provisions</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Entire agreement.</strong> These Terms, together with the Privacy Policy and any policies referenced here, constitute the entire agreement between you and Royvento regarding the Service and supersede all prior agreements or understandings.</li>
            <li><strong className="text-foreground">Severability.</strong> If any provision of these Terms is held invalid or unenforceable, it will be limited or removed to the minimum extent necessary, and the remaining provisions will remain in full force and effect.</li>
            <li><strong className="text-foreground">No waiver.</strong> Royvento's failure to enforce any right or provision of these Terms will not be a waiver of that right or provision.</li>
            <li><strong className="text-foreground">Assignment.</strong> You may not assign or transfer these Terms without our prior written consent. Royvento may assign these Terms, in whole or in part, to any affiliate or successor without restriction.</li>
            <li><strong className="text-foreground">No partnership or agency.</strong> Nothing in these Terms creates any partnership, joint venture, employment, franchise, or agency relationship between you and Royvento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">20. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">21. Governing Law &amp; Jurisdiction</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of India. Subject to the Grievance Redressal &amp; Dispute Resolution section above, the courts of Kolkata, West Bengal shall have exclusive jurisdiction over any dispute arising under or in connection with these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">22. Contact Us</h2>
          <p>
            If you have questions about these Terms, please reach out via our{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact page</Link> or email us at{" "}
            <a href="mailto:support@royvento.com" className="text-primary hover:underline">support@royvento.com</a>.
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-white/10 flex gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        <Link href="/contact" className="hover:text-foreground">Contact</Link>
      </div>
    </div>
  );
}
