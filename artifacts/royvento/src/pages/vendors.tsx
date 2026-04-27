import { useState } from "react";
import { useListVendors } from "@workspace/api-client-react";
import { VendorCard } from "@/components/VendorCard";
import { Button } from "@/components/ui/button";
import { EVENT_CATEGORIES } from "@/lib/api";

const CATEGORIES = ["All", ...EVENT_CATEGORIES];

export function Vendors() {
  const [active, setActive] = useState<string>("All");
  const params: Record<string, string> = {};
  if (active !== "All") params["category"] = active;
  const { data: vendors = [], isLoading } = useListVendors(params);

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <header className="max-w-2xl mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Vendors</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Browse our makers</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Every vendor on Royvento has been reviewed and approved by our team. Real portfolios, real reviews, real availability.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-10">
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            variant={active === c ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(c)}
            className="rounded-full"
          >
            {c}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading vendors…</p>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border bg-card p-16 text-center">
          <p className="font-serif text-2xl mb-2">No vendors here yet</p>
          <p className="text-muted-foreground">Check back soon.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((v) => <VendorCard key={v.id} vendor={v} />)}
        </div>
      )}
    </div>
  );
}
