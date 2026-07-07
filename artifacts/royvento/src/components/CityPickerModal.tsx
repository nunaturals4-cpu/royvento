import { useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Search,
  MapPin,
  Navigation,
  Building2,
  Anchor,
  Landmark,
  Trees,
  Waves,
  Mountain,
  UtensilsCrossed,
  Music,
  Sunset,
} from "lucide-react";
import { COUNTRIES } from "@/lib/locations";
import { useSelectedCity } from "@/components/LocationContext";
import { LocationPinModal } from "@/components/LocationPinModal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPULAR_CITIES: { name: string; icon: React.ReactNode }[] = [
  { name: "Mumbai",     icon: <Anchor className="h-6 w-6" /> },
  { name: "Delhi",      icon: <Landmark className="h-6 w-6" /> },
  { name: "Bengaluru",  icon: <Building2 className="h-6 w-6" /> },
  { name: "Hyderabad",  icon: <Building2 className="h-6 w-6" /> },
  { name: "Chennai",    icon: <Waves className="h-6 w-6" /> },
  { name: "Kolkata",    icon: <Landmark className="h-6 w-6" /> },
  { name: "Pune",       icon: <Mountain className="h-6 w-6" /> },
  { name: "Ahmedabad",  icon: <UtensilsCrossed className="h-6 w-6" /> },
  { name: "Chandigarh", icon: <Trees className="h-6 w-6" /> },
  { name: "Goa",        icon: <Sunset className="h-6 w-6" /> },
  { name: "Jaipur",     icon: <Landmark className="h-6 w-6" /> },
  { name: "Kochi",      icon: <Music className="h-6 w-6" /> },
];

const ALL_CITIES: string[] = Array.from(
  new Set(
    COUNTRIES.flatMap((country) =>
      country.states.flatMap((state) => state.cities)
    )
  )
).sort((a, b) => a.localeCompare(b));

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function CityPickerModal({ open, onOpenChange }: Props) {
  const { selectedCity, selectedLocality, setSelectedCity, detectLocation, detecting, locationError } = useSelectedCity();
  const [query, setQuery] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filteredCities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_CITIES;
    return ALL_CITIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  const groupedByLetter = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const city of filteredCities) {
      const letter = city[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(city);
    }
    return groups;
  }, [filteredCities]);

  const availableLetters = new Set(Object.keys(groupedByLetter));

  const handleSelect = (city: string) => {
    // Manual pick → flag it so GPS auto-detect won't override the user's choice.
    setSelectedCity(city, "", true);
    onOpenChange(false);
    setQuery("");
  };

  // Lets the user set their EXACT area/locality as free text (e.g. "Tarulia 2nd
  // Lane") when GPS / the city list can't pin it — works on any device with no
  // API needed. The typed text becomes the displayed locality; the city is kept
  // (or set to the text) for content matching.
  const handleUseTypedArea = () => {
    const q = query.trim();
    if (!q) return;
    setSelectedCity(selectedCity || q, q, true);
    onOpenChange(false);
    setQuery("");
  };

  const handleUseLocation = async () => {
    const ok = await detectLocation();
    if (ok) { onOpenChange(false); setQuery(""); }
  };

  const scrollToLetter = (letter: string) => {
    const el = letterRefs.current[letter];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showingSearch = query.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setQuery(""); }}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold mb-3">
            {selectedCity ? (
              <span>
                {selectedLocality ? (
                  <><span className="text-primary">{selectedLocality}</span><span className="text-muted-foreground">, {selectedCity}</span></>
                ) : (
                  <>City: <span className="text-primary">{selectedCity}</span></>
                )}
              </span>
            ) : (
              "Select your city"
            )}
          </DialogTitle>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city, area or locality"
              className="pl-9 bg-card/60 border-border focus:border-primary/40"
              autoFocus
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              onClick={handleUseLocation}
              disabled={detecting}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium disabled:opacity-50"
            >
              <Navigation className={`h-4 w-4 shrink-0 ${detecting ? "animate-pulse" : ""}`} />
              {detecting ? "Detecting precise location…" : "Use Current Location"}
            </button>
            {/* The reliable exact-location path on ANY device: pin it on a map. */}
            <button
              onClick={() => setPinOpen(true)}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <MapPin className="h-4 w-4 shrink-0" />
              Pin exact location on map
            </button>
          </div>
          {locationError && (
            <p className="mt-2 text-xs text-amber-400">{locationError}</p>
          )}
          <LocationPinModal
            open={pinOpen}
            onOpenChange={setPinOpen}
            onConfirmed={() => { onOpenChange(false); setQuery(""); }}
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {showingSearch ? (
            <div className="px-5 py-4">
              {/* Always offer the exact typed text as a precise area — this is
                  the reliable "set my exact location" path on any device. */}
              <button
                onClick={handleUseTypedArea}
                className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2.5 text-left text-sm hover:bg-primary/10 transition-colors"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span>Use <span className="font-semibold text-primary">"{query.trim()}"</span> as my area</span>
              </button>
              {filteredCities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No saved cities match — tap the option above to use your exact area.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {filteredCities.map((city) => (
                    <button
                      key={city}
                      onClick={() => handleSelect(city)}
                      className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-primary/10 hover:text-primary ${
                        selectedCity === city ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="px-5 pt-5 pb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Popular Cities
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {POPULAR_CITIES.map(({ name, icon }) => (
                    <button
                      key={name}
                      onClick={() => handleSelect(name)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all hover:border-primary/50 hover:bg-primary/5 ${
                        selectedCity === name
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card/40"
                      }`}
                    >
                      <span className={`${selectedCity === name ? "text-primary" : "text-muted-foreground"}`}>
                        {icon}
                      </span>
                      <span className={`text-[10px] font-medium text-center leading-tight ${
                        selectedCity === name ? "text-primary" : "text-foreground"
                      }`}>
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border">
                <div className="px-5 pt-4 pb-2 flex items-center gap-1 flex-wrap sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground mr-1 shrink-0" />
                  {ALPHABET.map((letter) => (
                    <button
                      key={letter}
                      onClick={() => scrollToLetter(letter)}
                      disabled={!availableLetters.has(letter)}
                      className={`text-xs font-medium w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        availableLetters.has(letter)
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground/30 cursor-default"
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>

                <div className="px-5 pb-5">
                  {ALPHABET.filter((l) => groupedByLetter[l]).map((letter) => (
                    <div
                      key={letter}
                      ref={(el) => { letterRefs.current[letter] = el; }}
                      className="mb-4"
                    >
                      <p className="text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-widest">
                        {letter}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {groupedByLetter[letter].map((city) => (
                          <button
                            key={city}
                            onClick={() => handleSelect(city)}
                            className={`text-left px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-primary/10 hover:text-primary ${
                              selectedCity === city
                                ? "text-primary font-medium"
                                : "text-foreground"
                            }`}
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
