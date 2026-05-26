import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "26 May 2026";

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
            <li><strong className="text-foreground">Users</strong> (also "Customers") — individuals who browse, book, and attend events or reserve tables at venues listed on Royvento.</li>
            <li><strong className="text-foreground">Pub Partners</strong> (also "Partners" or "Vendors") — pubs, clubs, restaurants, and event organisers who list their venues, events, offers, and tickets on Royvento.</li>
          </ul>
          <p className="mt-3">
            Sections 3–4 apply to all account holders. Section 5 applies specifically to Users; Section 6 applies specifically to Pub Partners.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Our Role as a Platform</h2>
          <p>
            Royvento is an intermediary marketplace that connects Users with Pub Partners. Pub Partners are independent third parties; Royvento does not own, operate, or control the venues, events, food, or beverages offered through the Service. Any contract for the supply of services or goods is formed directly between the User and the Pub Partner. Royvento is not a party to that contract and is not liable for its performance.
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
            <strong className="text-foreground">Cancellations &amp; refunds.</strong> Cancellation and refund policies are set by individual Pub Partners and shown on the event detail page before you book. Where a refund is due, it is processed to your original payment method, less any non-refundable fees disclosed at checkout. Royvento facilitates but is not responsible for refund decisions made by Pub Partners.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">At the venue.</strong> You are responsible for carrying valid ID and any required ticket or booking reference, for complying with all local laws and venue rules, and for drinking responsibly. Entry may be refused for intoxication, underage attendance, or breach of venue policy without a refund.
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
            <strong className="text-foreground">Suspension &amp; delisting.</strong> Royvento may suspend, restrict, or delist a Partner account at its discretion where there is suspected fraud, a breach of these Terms, a regulatory issue, or a risk to Users. Outstanding confirmed bookings must still be honoured, and verified payouts due to you for completed bookings will be settled in the ordinary course.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Intellectual Property</h2>
          <p>
            All content on the Royvento platform — including logos, design, text, and software — is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent. Pub Partners grant Royvento a non-exclusive, royalty-free licence to display their venue name, logo, images, and listing content for the purpose of operating and promoting the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service, including but not limited to damages for loss of profits, data, goodwill, or other intangible losses, or for the acts or omissions of any Pub Partner or User.
          </p>
          <p className="mt-3">
            Our total liability to you for any claim arising from or related to the Service shall not exceed the amount of commission or fees you paid to Royvento in the twelve months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Kolkata, West Bengal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">11. Contact Us</h2>
          <p>
            If you have questions about these Terms, please reach out via our{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact page</Link> or email us at{" "}
            <a href="mailto:info@royvento.com" className="text-primary hover:underline">info@royvento.com</a>.
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
