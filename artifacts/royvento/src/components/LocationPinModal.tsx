import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Loader2, Check } from "lucide-react";
import {
  useSelectedCity,
  getBestPosition,
  reverseGeocodeDetailed,
} from "@/components/LocationContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the user confirms a pin (in addition to saving to context). */
  onConfirmed?: () => void;
}

// Fallback centre when we have no coords at all (central Kolkata). The user
// drags from here; it's only the starting camera position.
const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 };

interface Resolved { city: string; locality: string; state: string }

/**
 * "Drop a pin" location picker — the reliable exact-location path on ANY device
 * (desktop/laptop/tablet/phone), mirroring Blinkit/Zomato/Swiggy. A fixed pin
 * sits at the map centre; the user pans the map so the pin sits on their exact
 * spot, and we reverse-geocode that point (Google via /api/places/reverse, with
 * OSM fallback). Confirming saves the precise coords + label to LocationContext.
 *
 * Keyless: OpenStreetMap tiles (no Google Maps JS key needed); reverse geocode
 * reuses the existing same-origin proxy, so it stays CSP-clean.
 */
export function LocationPinModal({ open, onOpenChange, onConfirmed }: Props) {
  const { coords, setPreciseLocation } = useSelectedCity();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  const [center, setCenter] = useState<{ lat: number; lng: number }>(coords ?? DEFAULT_CENTER);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  // Reverse-geocode a point, guarding against out-of-order responses.
  const geocode = useCallback(async (lat: number, lng: number) => {
    const seq = ++reqSeq.current;
    setGeocoding(true);
    try {
      const r = await reverseGeocodeDetailed(lat, lng, true);
      if (seq !== reqSeq.current) return; // a newer move superseded this one
      setResolved({ city: r.city, locality: r.locality, state: r.state });
    } catch {
      if (seq === reqSeq.current) setResolved(null);
    } finally {
      if (seq === reqSeq.current) setGeocoding(false);
    }
  }, []);

  // Debounced geocode whenever the pin (map centre) settles.
  const scheduleGeocode = useCallback((lat: number, lng: number) => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => geocode(lat, lng), 400);
  }, [geocode]);

  // Initialise the Leaflet map when the dialog opens; tear it down on close.
  useEffect(() => {
    if (!open) return;
    // Defer one tick so the dialog content is in the DOM and sized.
    const t = setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const start = coords ?? DEFAULT_CENTER;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
        [start.lat, start.lng],
        coords ? 17 : 12,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      // Clear the label the moment the map starts moving so the readout can
      // never show a resolved address that belongs to the previous point (and
      // Confirm stays disabled until the NEW point is geocoded).
      map.on("movestart", () => { setResolved(null); setGeocoding(true); });
      map.on("moveend", () => {
        const c = map.getCenter();
        const next = { lat: c.lat, lng: c.lng };
        setCenter(next);
        scheduleGeocode(next.lat, next.lng);
      });
      // Leaflet mis-measures inside an animating dialog — force a re-measure.
      setTimeout(() => map.invalidateSize(), 60);
      mapRef.current = map;
      setCenter(start);
      scheduleGeocode(start.lat, start.lng);
      // No stored coords → try a silent GPS fix to jump near the user.
      if (!coords) void recenterToGps(map);
    }, 30);
    return () => {
      clearTimeout(t);
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function recenterToGps(map?: L.Map) {
    const m = map ?? mapRef.current;
    if (!m) return;
    setGpsError("");
    setGpsLoading(true);
    try {
      const pos = await getBestPosition();
      m.setView([pos.coords.latitude, pos.coords.longitude], 17);
    } catch (err: unknown) {
      const code = (err as GeolocationPositionError | undefined)?.code;
      setGpsError(
        code === 1
          ? "Location permission denied — drag the map to your spot instead."
          : "Couldn't get GPS — drag the map to your exact spot.",
      );
    } finally {
      setGpsLoading(false);
    }
  }

  const primary = resolved?.locality || resolved?.city || "";
  const detail = [resolved?.locality, resolved?.city, resolved?.state]
    .map((s) => (s || "").trim())
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .join(", ");

  const handleConfirm = () => {
    setPreciseLocation({
      lat: center.lat,
      lng: center.lng,
      city: resolved?.city ?? "",
      locality: resolved?.locality ?? "",
      state: resolved?.state ?? "",
    });
    onOpenChange(false);
    onConfirmed?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden gap-0 max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">Pin your exact location</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Drag the map so the pin sits on your exact spot, then confirm.
          </p>
        </div>

        {/* Map + fixed centre pin overlay */}
        <div className="relative shrink-0">
          <div ref={containerRef} className="h-72 w-full bg-muted z-0" />
          {/* Centre pin — sits above the map centre; tip points at the exact
              coordinate. pointer-events-none so it never blocks map dragging. */}
          <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
            <div className="flex flex-col items-center -translate-y-3">
              <MapPin className="h-9 w-9 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] fill-primary/20" strokeWidth={2.2} />
              <div className="h-2 w-2 -mt-1 rounded-full bg-primary/30 blur-[1px]" />
            </div>
          </div>
          {/* GPS recenter button */}
          <button
            type="button"
            onClick={() => recenterToGps()}
            disabled={gpsLoading}
            className="absolute bottom-3 right-3 z-[400] flex items-center gap-1.5 rounded-full bg-background/95 border border-border shadow-lg px-3 py-2 text-xs font-medium text-primary hover:bg-background transition-colors disabled:opacity-60"
          >
            {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {gpsLoading ? "Locating…" : "Use my location"}
          </button>
        </div>

        {/* Resolved address readout + confirm */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5 min-h-[2.5rem]">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              {geocoding ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding this spot…
                </p>
              ) : primary ? (
                <>
                  <p className="text-sm font-semibold truncate">{primary}</p>
                  {detail && detail !== primary && (
                    <p className="text-xs text-muted-foreground truncate">{detail}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Drag the map to pick your area</p>
              )}
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 tabular-nums">
                {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
              </p>
            </div>
          </div>

          {gpsError && <p className="text-xs text-amber-400">{gpsError}</p>}

          <Button
            onClick={handleConfirm}
            disabled={geocoding || !primary}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-medium"
          >
            <Check className="h-4 w-4 mr-1.5" /> Confirm this location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
