import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "1 May 2026";

export function Terms() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-16 max-w-3xl">
      <SEO
        title="Terms & Conditions | Royvento"
        description="The terms and conditions that govern your use of Royvento — booking, payments, cancellations and partner obligations."
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
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Use of the Service</h2>
          <p>
            You must be at least 18 years old to use the Service or to make bookings at venues that serve alcohol. By creating an account or placing a booking you represent and warrant that you meet this requirement. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.
          </p>
          <p className="mt-3">
            You agree not to misuse the Service, including but not limited to: submitting false or fraudulent bookings, scraping or crawling content without permission, or attempting to interfere with the security or availability of the platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Bookings &amp; Payments</h2>
          <p>
            Bookings made through Royvento are subject to availability and confirmation by the venue partner. A booking is only confirmed once you receive a confirmation notification from us.
          </p>
          <p className="mt-3">
            Payment methods vary by event: some venues accept payment at the door (Cash on Delivery), while others require online payment at the time of booking. All stated prices are inclusive of applicable taxes unless noted otherwise.
          </p>
          <p className="mt-3">
            Cancellation and refund policies are set by individual venue partners. Please check the event detail page before booking. Royvento is not responsible for any refund disputes between customers and venue partners.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. User Conduct</h2>
          <p>
            You agree to treat venue staff, other guests, and Royvento personnel with respect. Any abusive, threatening, or illegal behaviour may result in immediate suspension of your account. You are responsible for complying with all local laws and venue rules when attending an event.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Partner Listings</h2>
          <p>
            Venue partners are independent third parties. Royvento acts as a platform connecting customers with partners and does not own or operate the venues listed. We make reasonable efforts to ensure listing accuracy but do not guarantee the completeness or currency of information provided by partners, including pricing, capacity, or amenities.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Intellectual Property</h2>
          <p>
            All content on the Royvento platform — including logos, design, text, and software — is owned by or licensed to Royvento and may not be copied, reproduced, or distributed without prior written consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Royvento and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the Service, including but not limited to damages for loss of profits, data, goodwill, or other intangible losses.
          </p>
          <p className="mt-3">
            Our total liability to you for any claim arising from or related to the Service shall not exceed the amount you paid to Royvento in the twelve months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Your continued use of the Service after any changes constitutes acceptance of the new Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Contact Us</h2>
          <p>
            If you have questions about these Terms, please reach out via our{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact page</Link> or email us at{" "}
            <a href="mailto:legal@royvento.com" className="text-primary hover:underline">legal@royvento.com</a>.
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
