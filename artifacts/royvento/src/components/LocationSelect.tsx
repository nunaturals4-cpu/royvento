import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_NAMES, getStates, getCities } from "@/lib/locations";

interface Props {
  country: string;
  state: string;
  city: string;
  onChange: (next: { country: string; state: string; city: string }) => void;
  className?: string;
  compact?: boolean;
}

const ANY = "__any__";

// The Select dropdown portals to <body> at z-50, but this picker is often used
// inside the hand-rolled party / solo-connect modals that sit at z-[9998]+.
// Without bumping it, the opened dropdown renders *behind* the modal and looks
// "not working" (invisible + unclickable). Float it above the modal layer.
const CONTENT_Z = "z-[10050]";

export function LocationSelect({ country, state, city, onChange, className, compact }: Props) {
  const states = country ? getStates(country) : [];
  const cities = country && state ? getCities(country, state) : [];
  const grid = compact
    ? "grid grid-cols-1 md:grid-cols-3 gap-2"
    : "grid grid-cols-1 md:grid-cols-3 gap-3";

  return (
    <div className={`${grid} ${className ?? ""}`}>
      <Select
        value={country || ANY}
        onValueChange={(v) =>
          onChange({ country: v === ANY ? "" : v, state: "", city: "" })
        }
      >
        <SelectTrigger className="bg-card/60 border-white/10">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent className={CONTENT_Z}>
          <SelectItem value={ANY}>Any country</SelectItem>
          {COUNTRY_NAMES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state || ANY}
        onValueChange={(v) => onChange({ country, state: v === ANY ? "" : v, city: "" })}
        disabled={!country}
      >
        <SelectTrigger className="bg-card/60 border-white/10">
          <SelectValue placeholder={country ? "State" : "Pick country"} />
        </SelectTrigger>
        <SelectContent className={CONTENT_Z}>
          <SelectItem value={ANY}>Any state</SelectItem>
          {states.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={city || ANY}
        onValueChange={(v) => onChange({ country, state, city: v === ANY ? "" : v })}
        disabled={!state}
      >
        <SelectTrigger className="bg-card/60 border-white/10">
          <SelectValue placeholder={state ? "City" : "Pick state"} />
        </SelectTrigger>
        <SelectContent className={CONTENT_Z}>
          <SelectItem value={ANY}>Any city</SelectItem>
          {cities.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
