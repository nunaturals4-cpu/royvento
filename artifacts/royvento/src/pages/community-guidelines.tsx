import { Link } from "wouter";
import { SEO } from "@/components/SEO";

const LAST_UPDATED = "16 June 2026";

export function CommunityGuidelines() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-16 max-w-3xl">
      <SEO
        title="Community Guidelines | Royvento"
        description="The rules and safety expectations for Royvento Solo Connector — how members are expected to behave, how reporting works, and the limits of Royvento's role."
        canonical="/community-guidelines"
      />
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Solo Connector</p>
        <h1 className="font-serif text-4xl font-bold mb-3">Community Guidelines</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. What Solo Connector Is</h2>
          <p>
            Solo Connector helps verified members discover and join social groups around real-world activities.
            Royvento <strong className="text-foreground">only provides a platform</strong> for users to discover and join these groups.
          </p>
        </section>

        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Royvento's Role &amp; Your Responsibility</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Royvento does <strong className="text-foreground">not organize, supervise, verify, monitor, or take responsibility</strong> for meetings, outings, interactions, conversations, or activities that occur after users join a group.</li>
            <li>Users participate <strong className="text-foreground">entirely at their own risk</strong> and are responsible for exercising personal judgment and ensuring their own safety.</li>
            <li>Royvento is <strong className="text-foreground">not responsible for any disputes, misconduct, financial transactions, injuries, losses, damages, or incidents</strong> that occur during or after meeting group members.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. How to Behave</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Be respectful. Harassment, abuse, hate speech, threats, and discrimination are not tolerated.</li>
            <li>Be genuine. Impersonation, fake profiles, and misrepresenting yourself are prohibited.</li>
            <li>No spam, solicitation, scams, or requests for money.</li>
            <li>No sexual harassment or inappropriate behaviour. Solo Connector is not a dating service.</li>
            <li>Respect privacy — never share another member's personal information without consent.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Staying Safe</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Meet in public places. Tell someone you trust where you're going.</li>
            <li>Never share financial information or send money to other members.</li>
            <li>Use the in-app emergency contacts and reporting tools if you feel unsafe.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Reporting &amp; Enforcement</h2>
          <p>
            You can report any member of a group you've joined directly from the group screen. Our team reviews
            every report and may warn, suspend, ban, or remove members. Reports are confidential. Repeat or
            serious violations result in permanent removal from Solo Connector.
          </p>
        </section>

        <section>
          <p>
            By using Solo Connector you confirm you have read and accepted these guidelines together with our{" "}
            <Link href="/terms" className="text-foreground underline">Terms &amp; Conditions</Link> and{" "}
            <Link href="/privacy" className="text-foreground underline">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
