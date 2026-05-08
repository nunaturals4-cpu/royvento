import { Link } from "wouter";

interface CrossLinkRailProps {
  title: string;
  links: { href: string; label: string }[];
}

export function CrossLinkRail({ title, links }: CrossLinkRailProps) {
  if (!links.length) return null;
  return (
    <section className="mt-12">
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary mb-3 accent-underline inline-flex">
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="px-3 py-1.5 rounded-full text-xs font-medium border bg-black/40 border-white/10 text-white/80 hover:border-primary hover:text-primary transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
