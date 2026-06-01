import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import jsQR from "jsqr";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ScanLine, Users, Ticket as TicketIcon, Wine, Bell, Camera, CameraOff, Zap, ZapOff, Plus, Minus, IndianRupee, Banknote, LogOut, Search } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import {
  useGetMe,
  useGetPartnerScannerBookings,
  useGetPartnerScannerOccupancy,
  usePartnerCheckoutTicket,
  getGetPartnerScannerBookingsQueryKey,
  getGetPartnerScannerOccupancyQueryKey,
  getGetPartnerAnalyticsQueryKey,
  getGetPartnerLeadsQueryKey,
  getGetPartnerCommissionQueryKey,
  getGetPartnerCheckinReportQueryKey,
  getGetAdminAnalyticsQueryKey,
  getGetAdminBookingsReportQueryKey,
  getGetAdminCheckinReportQueryKey,
  getGetAdminLeadsQueryKey,
  getGetCommissionReportQueryKey,
  getGetAdminLiveOccupancyQueryKey,
} from "@workspace/api-client-react";
import type {
  ScannerBookingRow as ApiScannerBookingRow,
  GetPartnerScannerBookingsParams,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface BookingData {
  id: number;
  ticketCode?: string;
  eventTitle: string;
  vendorName: string;
  eventImage: string | null;
  bookingDate: string;
  personName: string | null;
  userName: string;
  pubMode: string;
  eventType_: string;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  guests: number;
  // Pre-discount booking gross (per-tier × per-tier-price, FER applied).
  // Used with finalPrice to derive the discount ratio so the live cash
  // total at the door matches the amount printed on the guest's ticket.
  totalPrice?: number;
  // Post-discount amount the guest paid online or owes at the door.
  finalPrice: number;
  // Service/platform fee charged on top of finalPrice. Fixed at booking time.
  baseFee?: number | null;
  discountAmount?: number;
  pointsUsed?: number;
  couponCode?: string;
  priceWomen?: number;
  priceMen?: number;
  priceCouple?: number;
  paymentMethod?: string;
  actualWomen?: number | null;
  actualMen?: number | null;
  actualCouple?: number | null;
  actualGuests?: number | null;
  actualAmountDue?: number | null;
  freeEntryRules?: {
    enabled?: boolean;
    days?: string[];
    genders?: string[];
  } | null;
}

// Day abbreviations matching server's free-entry-rules day list (e.g. "Wed", "Thu").
const SCANNER_FREE_ENTRY_DAY_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors the per-tier rule used in artifacts/mobile/app/scanner.tsx and
// artifacts/api-server/src/routes/bookings.ts (calcActualAmountDue): a tier
// is free only when the booking date's weekday is in the active FER day list
// AND the tier's gender is in fer.genders. The whole booking is free only
// when every gender is listed.
function bookingFerState(b: Pick<BookingData, "bookingDate" | "freeEntryRules">): {
  active: boolean;
  allGendersFree: boolean;
  isTierFree: (g: "women" | "men" | "couple") => boolean;
} {
  const fer = b.freeEntryRules;
  const days = Array.isArray(fer?.days) ? fer!.days! : [];
  const dayName = b.bookingDate
    ? SCANNER_FREE_ENTRY_DAY_ABBRS[new Date(`${b.bookingDate}T12:00:00`).getDay()]
    : undefined;
  const active = !!(fer?.enabled && dayName && days.includes(dayName));
  const ferGenders = active ? (fer?.genders ?? []).map((g) => String(g).toLowerCase()) : [];
  const allGendersFree = active && ["women", "men", "couple"].every((g) => ferGenders.includes(g));
  return {
    active,
    allGendersFree,
    isTierFree: (g) => active && ferGenders.includes(g),
  };
}

// Lookup result: the QR resolved to a valid booking that has NOT been
// finalized. The scanner UI surfaces the editable headcount form so the
// manager can confirm/adjust counts and tap Save Actual Entry to finalize.
interface ScanReady {
  code: "READY";
  checkedInAt: string | null;
  booking: BookingData;
}

// Lookup result: the booking has already been finalized via Save Actual
// Entry. Locked — show recorded counts read-only.
interface ScanAlreadyFinalized {
  code: "ALREADY_FINALIZED";
  message?: string;
  checkedInAt: string | null;
  booking: BookingData;
}

// Returned from a successful Save Actual Entry (or grace-window duplicate).
interface ScanFinalized {
  code: "OK";
  checkedInAt: string;
  booking: BookingData;
  justFinalized?: boolean;
}

interface ScanError {
  code: string;
  message: string;
}

type ScanResult = ScanReady | ScanAlreadyFinalized | ScanFinalized | ScanError;

function isScanReady(r: ScanResult): r is ScanReady {
  return r.code === "READY";
}
function isScanFinalized(r: ScanResult): r is ScanFinalized {
  return r.code === "OK";
}
function isScanAlreadyFinalized(r: ScanResult): r is ScanAlreadyFinalized {
  return r.code === "ALREADY_FINALIZED";
}

interface Invitation {
  id: number;
  vendorName: string;
  createdAt: string;
}

function ManagerInvitations() {
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [acting, setActing] = useState<number | null>(null);

  useEffect(() => {
    apiGet<Invitation[]>("/api/manager/invitations").then(setInvitations).catch(() => {});
  }, []);

  if (invitations.length === 0) return null;

  const respond = async (id: number, action: "accept" | "reject") => {
    setActing(id);
    try {
      await apiPost(`/api/manager/invitations/${id}/${action}`, {});
      toast({ title: action === "accept" ? "Invitation accepted! You can now scan tickets." : "Invitation declined." });
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
    } catch {
      toast({ title: "Error", description: "Failed to respond to invitation.", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="mb-8 space-y-3">
      {invitations.map((inv) => (
        <div key={inv.id} className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">{inv.vendorName} invited you as a ticket scanner manager</p>
              <p className="text-xs text-muted-foreground">Accepting grants you access to scan tickets for their venue.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" disabled={acting === inv.id} onClick={() => respond(inv.id, "accept")}
              className="bg-primary hover:bg-primary/90 border-0 text-primary-foreground">Accept</Button>
            <Button size="sm" variant="outline" disabled={acting === inv.id} onClick={() => respond(inv.id, "reject")}
              className="border-white/10 text-muted-foreground hover:text-foreground">Decline</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function useAccessCheck() {
  const [accessStatus, setAccessStatus] = useState<"loading" | "allowed" | "denied">("loading");
  const [managedVendors, setManagedVendors] = useState<{ id: number; businessName: string }[]>([]);

  // Use server-confirmed role via /api/auth/me — avoids stale JWT where a partner
  // approved after login still has role "user" cached in localStorage.
  const { data: me, isError: meError } = useGetMe({ query: { retry: false } as any });

  useEffect(() => {
    // Still loading — wait
    if (!me && !meError) return;

    // Not logged in at all
    if (meError || !me?.user) { setAccessStatus("denied"); return; }

    const role = me.user.role as string;

    // Vendors and admins get immediate access — fetch their managed venues in background
    if (role === "vendor" || role === "admin") {
      setAccessStatus("allowed");
      apiGet<{ id: number; businessName: string }[]>("/api/manager/my-vendors")
        .then(setManagedVendors)
        .catch(() => {});
      return;
    }

    // For regular users, check if they have accepted manager relationships
    apiGet<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then((vendors) => {
      setManagedVendors(vendors);
      setAccessStatus(vendors.length > 0 ? "allowed" : "denied");
    }).catch(() => {
      setAccessStatus("denied");
    });
  }, [me, meError]);

  return { accessStatus, managedVendors };
}

function CameraScanner({
  onDetect,
  disabled = false,
}: {
  onDetect: (code: string) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const disabledRef = useRef(disabled);
  const lastCodeRef = useRef("");
  const lastCodeTimeRef = useRef(0);
  // Native QR detector — available in Chromium (Android Chrome, desktop Chrome,
  // Edge). ~5× faster than jsQR because it runs in C++/GPU. We fall back to
  // jsQR on Firefox/Safari/older browsers transparently.
  const nativeDetectorRef = useRef<{ detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detected, setDetected] = useState(false);

  // Keep ref in sync without restarting the RAF loop
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleHit = useCallback((data: string) => {
    const now = Date.now();
    // Debounce: skip same code within 2 seconds to prevent double-fires
    if (data === lastCodeRef.current && now - lastCodeTimeRef.current < 2000) return false;
    lastCodeRef.current = data;
    lastCodeTimeRef.current = now;
    setDetected(true);
    setTimeout(() => setDetected(false), 600);
    onDetect(data);
    return true;
  }, [onDetect]);

  const scanFrame = useCallback(async () => {
    // Pause scanning while an API call is in flight
    if (disabledRef.current) {
      rafRef.current = requestAnimationFrame(() => { void scanFrame(); });
      return;
    }
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(() => { void scanFrame(); });
      return;
    }
    // Fast path: native BarcodeDetector — accepts the <video> element directly,
    // no canvas roundtrip, and runs on the GPU on most platforms.
    if (nativeDetectorRef.current) {
      try {
        const codes = await nativeDetectorRef.current.detect(video);
        if (codes.length > 0 && codes[0]?.rawValue) {
          if (handleHit(codes[0].rawValue)) return;
        }
      } catch {
        // If native detector throws for any reason, fall through to jsQR for
        // this frame (and silently keep using native on the next one — most
        // failures are transient).
      }
      rafRef.current = requestAnimationFrame(() => { void scanFrame(); });
      return;
    }
    // Fallback: jsQR via offscreen canvas, downscaled to 640px wide. Slightly
    // wider than the previous 480-wide path so dense-modules QR codes from
    // small phone screens still decode without forcing the user to back up.
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(() => { void scanFrame(); }); return; }
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, 1));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(() => { void scanFrame(); }); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // attemptBoth lets us decode inverted (white-on-black) codes too, which
    // also helps in low-light when the camera flips contrast.
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (code?.data && handleHit(code.data)) return;
    rafRef.current = requestAnimationFrame(() => { void scanFrame(); });
  }, [handleHit]);

  const startCamera = useCallback(async () => {
    setError(null);
    lastCodeRef.current = "";
    lastCodeTimeRef.current = 0;
    // Wire up native detector if the browser supports it.
    nativeDetectorRef.current = null;
    const BD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (BD) {
      try {
        nativeDetectorRef.current = new BD({ formats: ["qr_code"] });
      } catch {
        nativeDetectorRef.current = null;
      }
    }
    try {
      // Ask for 1280×720 — native detector handles the higher resolution
      // easily and we get sharper edges on small/dense QR codes. The jsQR
      // fallback downscales to 640px in software anyway, so this doesn't
      // hurt the fallback path either. `focusMode: continuous` keeps the
      // lens hunting without user input.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // `advanced` + `focusMode: "continuous"` is supported by
          // Chromium/Safari but not in the WHATWG MediaTrackConstraints
          // typings, so we cast via unknown.
          advanced: [{ focusMode: "continuous" }],
        } as unknown as MediaTrackConstraints,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const caps = (videoTrack.getCapabilities as (() => Record<string, unknown>) | undefined)?.();
        if (caps?.torch) setTorchSupported(true);
      }
      rafRef.current = requestAnimationFrame(() => { void scanFrame(); });
    } catch {
      setError("Camera access denied. Please allow camera permission and try again.");
    }
  }, [scanFrame]);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track.applyConstraints as (c: unknown) => Promise<void>)({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-900/10 p-6 text-center space-y-3">
        <CameraOff className="h-8 w-8 text-red-400 mx-auto" />
        <p className="text-sm text-red-300">{error}</p>
        <Button size="sm" variant="outline" onClick={startCamera}>Try again</Button>
      </div>
    );
  }

  const frameColor = detected ? "#22c55e" : disabled ? "#6366f1" : "#e53e3e";
  const frameLabel = detected ? "QR detected — checking…" : disabled ? "Validating ticket…" : scanning ? "Align the QR code inside the frame" : "Starting camera…";

  return (
    <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black scanner-shell">
      {/* Aspect-ratio container — full bleed, ~4:3 on mobile, capped at 65vh */}
      <div className="relative w-full bg-black" style={{ aspectRatio: "4 / 3", maxHeight: "65vh" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Vignette so the reticle stays the focal point even on bright surfaces */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.7) 100%)" }}
        />

        {/* Reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="relative"
            style={{ width: "min(72vw, 360px)", aspectRatio: "1 / 1" }}
          >
            {/* Animated corner brackets */}
            {([
              { pos: "top-0 left-0", radius: "12px 0 0 0" },
              { pos: "top-0 right-0", radius: "0 12px 0 0" },
              { pos: "bottom-0 left-0", radius: "0 0 0 12px" },
              { pos: "bottom-0 right-0", radius: "0 0 12px 0" },
            ] as const).map(({ pos, radius }) => {
              const isTop = pos.includes("top");
              const isBottom = pos.includes("bottom");
              const isLeft = pos.includes("left");
              const isRight = pos.includes("right");
              return (
                <div
                  key={pos}
                  className={`absolute h-12 w-12 ${pos}`}
                  style={{
                    borderTop: isTop ? `3px solid ${frameColor}` : "none",
                    borderBottom: isBottom ? `3px solid ${frameColor}` : "none",
                    borderLeft: isLeft ? `3px solid ${frameColor}` : "none",
                    borderRight: isRight ? `3px solid ${frameColor}` : "none",
                    borderRadius: radius,
                    filter: `drop-shadow(0 0 8px ${frameColor}55)`,
                    transition: "border-color 0.25s ease, filter 0.25s ease",
                  }}
                />
              );
            })}

            {/* Scan line — only when actively scanning */}
            {scanning && !disabled && !detected && (
              <div
                className="absolute left-4 right-4 h-[2px] rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${frameColor}, transparent)`,
                  boxShadow: `0 0 12px ${frameColor}aa`,
                  animation: "scanLine 2.2s ease-in-out infinite",
                }}
              />
            )}

            {/* Detected flash + ripple */}
            {detected && (
              <>
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: "rgba(34,197,94,0.18)",
                    border: "2px solid #22c55e",
                    animation: "scanFlash 0.5s cubic-bezier(0.22,0.61,0.36,1) both",
                  }}
                />
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    border: "2px solid #22c55e",
                    animation: "scanRipple 0.7s ease-out both",
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* Torch toggle */}
        {torchSupported && (
          <button
            onClick={toggleTorch}
            aria-label={torchOn ? "Turn off torch" : "Turn on torch"}
            className="absolute top-3 right-3 rounded-full h-11 w-11 bg-black/65 border border-white/20 text-white hover:bg-black/85 transition-colors z-10 flex items-center justify-center backdrop-blur-md"
          >
            {torchOn ? <Zap className="h-5 w-5 text-yellow-300" /> : <ZapOff className="h-5 w-5 text-white/60" />}
          </button>
        )}
      </div>

      {/* Status strip — below the camera so it never covers the reticle */}
      <div className="px-4 py-2.5 bg-black/85 border-t border-white/8 flex items-center gap-2.5">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{
            background: frameColor,
            boxShadow: `0 0 8px ${frameColor}aa`,
            animation: scanning && !detected && !disabled ? "scanPulse 1.4s ease-in-out infinite" : "none",
          }}
        />
        <p className="text-[13px] font-medium tracking-wide" style={{ color: frameColor, transition: "color 0.25s" }}>
          {frameLabel}
        </p>
        <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/40">
          {nativeDetectorRef.current ? "Fast detect" : "Compatibility mode"}
        </span>
      </div>

      <style>{`
        @keyframes scanLine {
          0%   { transform: translateY(-44%); opacity: 0.55; }
          50%  { transform: translateY(44%);  opacity: 1; }
          100% { transform: translateY(-44%); opacity: 0.55; }
        }
        @keyframes scanFlash {
          0%   { opacity: 0; transform: scale(0.96); }
          50%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
        }
        @keyframes scanRipple {
          0%   { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0;   transform: scale(1.18); }
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.25); }
        }
      `}</style>
    </div>
  );
}

export function TicketScanner() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraMode, setCameraMode] = useState(true);
  const { toast } = useToast();
  const { accessStatus, managedVendors } = useAccessCheck();
  const queryClient = useQueryClient();

  const validateCode = async (code: string) => {
    if (!code || loading) return;
    setLoading(true);
    setResult(null);
    // Haptic feedback on scan start
    if ("vibrate" in navigator) navigator.vibrate(40);
    try {
      // Lookup only — no `confirm`, no `actualEntry`. Server returns the
      // booking with status (READY / ALREADY_FINALIZED / ALREADY_CHECKED_OUT)
      // and performs ZERO writes. Finalization happens later when the
      // manager taps Save Actual Entry.
      const res = await fetch("/api/partner/scan-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        const lookupCode = typeof json["code"] === "string" ? (json["code"] as string) : "";
        const booking = json["booking"] as BookingData | undefined;
        const checkedInAt = typeof json["checkedInAt"] === "string" ? (json["checkedInAt"] as string) : null;
        if (lookupCode === "ALREADY_FINALIZED" && booking) {
          setResult({ code: "ALREADY_FINALIZED", checkedInAt, booking });
          if ("vibrate" in navigator) navigator.vibrate([200, 60, 200]);
        } else if (lookupCode === "READY" && booking) {
          setResult({ code: "READY", checkedInAt, booking });
          if ("vibrate" in navigator) navigator.vibrate([80, 40, 80]);
        } else if (lookupCode === "ALREADY_CHECKED_OUT" && booking) {
          setResult({
            code: "ALREADY_FINALIZED",
            message: "Guest already checked out.",
            checkedInAt,
            booking,
          });
        } else {
          const message = typeof json["message"] === "string" ? (json["message"] as string) : "Unexpected response.";
          setResult({ code: lookupCode || "UNKNOWN", message });
        }
      } else {
        const errCode = typeof json["code"] === "string" ? (json["code"] as string) : "UNKNOWN";
        const message = typeof json["message"] === "string" ? (json["message"] as string) : `Error ${res.status}`;
        setResult({ code: errCode, message });
        if ("vibrate" in navigator) navigator.vibrate(300);
        toast({ title: "Scan failed", description: message, variant: "destructive" });
      }
    } catch {
      const scanErr: ScanError = { code: "NETWORK_ERROR", message: "Network error. Check your connection." };
      setResult(scanErr);
      if ("vibrate" in navigator) navigator.vibrate(300);
      toast({ title: "Scan failed", description: scanErr.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    await validateCode(input.trim());
  };

  if (accessStatus === "loading") {
    return <div className="container mx-auto px-4 md:px-6 py-20 text-center text-muted-foreground">Checking access…</div>;
  }

  if (accessStatus === "denied") {
    return (
      <div className="container mx-auto px-4 md:px-6 py-20 max-w-xl text-center">
        <ScanLine className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="font-serif text-2xl mb-2">Access restricted</h2>
        <p className="text-muted-foreground mb-6">
          This page is for venue partners and their scanner managers. If you received an invitation, please accept it from your profile.
        </p>
        <ManagerInvitations />
        <Link href="/dashboard/profile" className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4">Go to profile to accept invitations</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <SEO title="Ticket scanner | Royvento" canonical="/dashboard/vendor/scanner" noindex />
      <ManagerInvitations />
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Partner tool</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3 flex items-center gap-3">
          <ScanLine className="h-9 w-9 text-primary" /> Ticket scanner
        </h1>
        <p className="mt-2 text-muted-foreground">Type or paste a booking code (e.g. RV-000042) to validate entry at the door.</p>
        {managedVendors.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {managedVendors.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-primary/30 bg-primary/5 text-primary">
                <Users className="h-3 w-3" /> Managing: {v.businessName}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCameraMode(false)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            !cameraMode ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          <ScanLine className="h-4 w-4" /> Type code
        </button>
        <button
          onClick={() => { setCameraMode(true); setResult(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
            cameraMode ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/10 text-muted-foreground hover:border-white/20"
          }`}
        >
          <Camera className="h-4 w-4" /> Camera scan
        </button>
      </div>

      {cameraMode ? (
        <div className="rounded-3xl glass-card-strong p-5 space-y-3">
          <CameraScanner
            disabled={loading}
            onDetect={(code) => {
              const cleaned = code.trim().toUpperCase();
              setInput(cleaned);
              // Stay in camera mode — result appears below; scanner resumes after dismiss
              void validateCode(cleaned);
            }}
          />
        </div>
      ) : (
        <form onSubmit={scan} className="rounded-3xl glass-card-strong p-8 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Ticket code</label>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="RV-000042"
              className="bg-black/40 border-white/10 text-xl tracking-widest font-mono uppercase"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground mt-1">Format: RV-XXXXXX (the number from the guest's ticket)</p>
          </div>
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full bg-gradient-to-br from-red-600 to-red-800 border-0 text-base py-3 gap-2"
          >
            {loading ? "Checking…" : <><ScanLine className="h-5 w-5" />Validate ticket</>}
          </Button>
        </form>
      )}

      {result && (
        <div
          className={`mt-5 rounded-3xl overflow-hidden border ${
            isScanFinalized(result)
              ? "border-green-500/50 bg-gradient-to-b from-green-950/60 to-green-950/30"
              : isScanReady(result)
              ? "border-primary/40 bg-gradient-to-b from-primary/10 to-black/40"
              : isScanAlreadyFinalized(result)
              ? "border-amber-500/50 bg-gradient-to-b from-amber-950/60 to-amber-950/30"
              : "border-red-500/40 bg-gradient-to-b from-red-950/60 to-red-950/30"
          }`}
          style={{ animation: "resultSlideIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {isScanReady(result) ? (
            <div className="p-5 space-y-4">
              {/* Ready-to-finalize header — scan validated the ticket but
                  nothing has been written yet. Manager edits counts, then
                  taps Save Actual Entry to finalize. */}
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-primary/20 border border-primary/40 p-3 shrink-0">
                  <ScanLine className="h-8 w-8 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground font-bold text-xl tracking-tight">Ticket valid · confirm headcount</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Adjust counts below if fewer guests showed up, then tap Save Actual Entry.
                  </p>
                </div>
                <button
                  onClick={() => { setResult(null); setInput(""); }}
                  className="ml-auto shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="h-px bg-primary/20" />
              <BookingDetails booking={result.booking} />
              <FinalizeActualEntry
                key={`ready-${result.booking.id}`}
                booking={result.booking}
                onFinalized={(updated, checkedInAt) =>
                  setResult({ code: "OK", booking: updated, checkedInAt, justFinalized: true })
                }
              />
            </div>
          ) : isScanFinalized(result) ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-green-500/20 border border-green-500/40 p-3 shrink-0">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-green-300 font-bold text-xl tracking-tight">Entry finalized</p>
                  <p className="text-xs text-green-300/60 mt-0.5">
                    ✓ Saved at {new Date(result.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    {" · analytics & commission updated"}
                  </p>
                </div>
                <button
                  onClick={() => { setResult(null); setInput(""); }}
                  className="ml-auto shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                >
                  Next →
                </button>
              </div>
              <div className="h-px bg-green-500/20" />
              <BookingDetails booking={result.booking} />
              <FinalizedSummary booking={result.booking} />
            </div>
          ) : isScanAlreadyFinalized(result) ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-amber-500/20 border border-amber-500/40 p-3 shrink-0">
                  <XCircle className="h-8 w-8 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-amber-300 font-bold text-xl tracking-tight">Already finalized</p>
                  <p className="text-xs text-amber-300/70 mt-0.5">
                    {result.checkedInAt
                      ? `Saved ${new Date(result.checkedInAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}`
                      : "This ticket has already been finalized at the door."}
                  </p>
                </div>
                <button
                  onClick={() => { setResult(null); setInput(""); }}
                  className="ml-auto shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                >
                  Dismiss
                </button>
              </div>
              <div className="h-px bg-amber-500/20" />
              {result.booking && (
                <>
                  <BookingDetails booking={result.booking} />
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <XCircle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-200">Locked — no further edits</p>
                      <p className="text-xs text-amber-200/70 mt-0.5">Cash and commission have been recorded. Contact admin to correct.</p>
                    </div>
                  </div>
                  <FinalizedSummary booking={result.booking} />
                </>
              )}
            </div>
          ) : (
            <div className="p-5 flex items-start gap-4">
              <div className="rounded-2xl bg-red-500/20 border border-red-500/40 p-3 shrink-0">
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-red-300 font-bold text-lg">
                  {({
                    TICKET_EXPIRED: "Ticket Expired",
                    TICKET_FUTURE: "Future Date",
                    CANCELLED: "Booking Cancelled",
                    REFUNDED: "Booking Refunded",
                    NOT_CONFIRMED: "Not Confirmed",
                    WRONG_VENDOR: "Wrong Venue",
                    NOT_FOUND: "Ticket Not Found",
                    INVALID_CODE: "Invalid Code",
                  } as Record<string, string>)[result.code] ?? "Invalid Ticket"}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{result.message}</p>
              </div>
              <button
                onClick={() => { setResult(null); setInput(""); }}
                className="shrink-0 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes resultSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <ScannerPanels />
    </div>
  );
}

type ScannerLiveStatus = "notArrived" | "inside" | "checkedOut";

function ScannerPanels() {
  // Lift a small "mutation tick" so a successful checkout in the bookings
  // panel forces an immediate refetch in the occupancy panel above (in
  // addition to the per-key invalidation done inside the mutation).
  const [tick, setTick] = useState(0);
  return (
    <>
      <ScannerOccupancyPanel refetchKey={tick} />
      <ScannerBookingsPanel onMutated={() => setTick((t) => t + 1)} />
    </>
  );
}

function ScannerOccupancyPanel({ refetchKey }: { refetchKey?: number }) {
  const { data, refetch } = useGetPartnerScannerOccupancy({
    query: { refetchInterval: 15000 },
  });

  // External tick (e.g. after a successful check-out) forces an immediate
  // refetch so the cards reflect the new "currently inside" count without
  // waiting for the next 15s poll.
  useEffect(() => { void refetch(); }, [refetchKey, refetch]);

  if (!data || data.rows.length === 0) return null;

  return (
    <section className="mt-12 rounded-3xl glass-card-strong p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Live occupancy</h2>
        <span className="text-xs text-muted-foreground">{data.today} (IST) · auto-refreshes</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.rows.map((r) => {
          const pct = r.capacity > 0 ? r.occupancyPercent : 0;
          const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
          return (
            <div key={r.vendorId} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="font-medium truncate">{r.businessName}</p>
                <span className="text-sm tabular-nums font-semibold">{r.currentlyInside}{r.capacity > 0 ? ` / ${r.capacity}` : ""}</span>
              </div>
              {r.capacity > 0 && (
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
                  <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                {r.checkedInCount} in · {r.checkedOutCount} out · {r.notArrivedCount} pending
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScannerBookingsPanel({ onMutated }: { onMutated: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Set<ScannerLiveStatus>>(() => new Set());
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Build typed params object for the generated React Query hook so the
  // request stays in sync with the OpenAPI contract instead of hand-built
  // query strings.
  const params: GetPartnerScannerBookingsParams = {};
  if (statuses.size > 0) params.status = Array.from(statuses).join(",");
  if (q.trim()) params.q = q.trim();
  if (from && to) { params.from = from; params.to = to; }
  if (vendorFilter !== "all") {
    const vid = Number(vendorFilter);
    if (Number.isFinite(vid) && vid > 0) params.vendorId = vid;
  }

  const { data, isLoading, refetch } = useGetPartnerScannerBookings(params, {
    query: { refetchInterval: 20000 },
  });

  // Authoritative vendor scope — fetched from the server, not derived from
  // booking results. A manager assigned to one pub with zero bookings today
  // still sees their pub in the dropdown (and is forced to it when only one
  // pub is allowed).
  const [vendorOptions, setVendorOptions] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGet<{ vendors: { id: number; businessName: string }[] }>("/api/partner/scanner/allowed-vendors")
      .then((r) => {
        if (cancelled) return;
        const opts = r.vendors.map((v) => ({ id: v.id, name: v.businessName }));
        setVendorOptions(opts);
        // When the user has exactly one allowed pub, lock the filter to that
        // vendorId so the table can never show another partner's pub. The
        // dropdown is hidden in this case.
        if (opts.length === 1) setVendorFilter(String(opts[0]!.id));
      })
      .catch(() => { if (!cancelled) setVendorOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const checkout = usePartnerCheckoutTicket({
    mutation: {
      onSuccess: (_resp, vars) => {
        toast({ title: "Checked out", description: "Live occupancy updated." });
        // Invalidate both the bookings list and the occupancy panel so they
        // refresh immediately instead of waiting for the next poll.
        void queryClient.invalidateQueries({ queryKey: getGetPartnerScannerBookingsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetPartnerScannerOccupancyQueryKey() });
        void refetch();
        onMutated();
        void vars;
      },
      onError: (err: unknown) => {
        const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Network error.";
        toast({ title: "Check-out failed", description: msg, variant: "destructive" });
      },
      onSettled: () => setBusyId(null),
    },
  });

  const handleCheckout = (row: ApiScannerBookingRow) => {
    if (!confirm(`Check out ${row.personName || row.userName}? This decrements live occupancy.`)) return;
    setBusyId(row.id);
    checkout.mutate({ data: { bookingId: row.id, confirm: true } });
  };

  const toggleStatus = (s: ScannerLiveStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const rows = data?.rows ?? [];

  return (
    <section className="mt-8 rounded-3xl glass-card-strong p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-serif text-2xl flex items-center gap-2"><TicketIcon className="h-5 w-5 text-primary" />Bookings</h2>
        <div className="relative w-full sm:w-auto">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone / ticket #" className="pl-9 bg-black/40 border-white/10 w-full sm:w-64" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-[10px] uppercase text-muted-foreground block mb-1">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-black/40 border-white/10 w-40" />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground block mb-1">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-black/40 border-white/10 w-40" />
        </div>
        {vendorOptions.length > 1 && (
          <div>
            <label className="text-[10px] uppercase text-muted-foreground block mb-1">Venue</label>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm">
              <option value="all">All venues</option>
              {vendorOptions.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
            </select>
          </div>
        )}
        {(from || to || vendorFilter !== "all" || statuses.size > 0 || q) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); setVendorFilter(vendorOptions.length === 1 ? String(vendorOptions[0]!.id) : "all"); setStatuses(new Set()); setQ(""); }}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setStatuses(new Set())}
          className={`text-xs px-3 py-1.5 rounded-full border ${statuses.size === 0 ? "bg-primary border-primary text-primary-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
          All
        </button>
        {(["notArrived", "inside", "checkedOut"] as const).map((s) => (
          <button key={s} onClick={() => toggleStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full border ${statuses.has(s) ? "bg-primary border-primary text-primary-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
            {s === "notArrived" ? "Not arrived" : s === "inside" ? "Inside" : "Checked out"}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground self-center ml-auto">Tap chips to combine statuses.</span>
      </div>
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-black/90 backdrop-blur text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Ticket</th>
                <th className="text-left p-3">Guest</th>
                <th className="text-right p-3">Pax</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">In / Out</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>)}
              {!isLoading && rows.length === 0 && (<tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No bookings match these filters.</td></tr>)}
              {!isLoading && rows.map((r) => {
                const pax = r.pubMode === "ticket" ? r.ticketWomen + r.ticketMen + r.ticketCouple * 2 : r.guests;
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-3 font-mono text-xs">{r.ticketCode}</td>
                    <td className="p-3">
                      <p className="font-medium">{r.personName || r.userName}</p>
                      <p className="text-[11px] text-muted-foreground">{r.vendorName}{r.phone ? ` · ${r.phone}` : ""}</p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{pax}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${r.liveStatus === "inside" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : r.liveStatus === "checkedOut" ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-white/10 text-muted-foreground"}`}>
                        {r.liveStatus === "inside" ? "Inside" : r.liveStatus === "checkedOut" ? "Checked out" : "Not arrived"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground tabular-nums">
                      {r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      {" / "}
                      {r.checkedOutAt ? new Date(r.checkedOutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {r.liveStatus === "inside" ? (
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => handleCheckout(r)} className="gap-1">
                          <LogOut className="h-3.5 w-3.5" /> {busyId === r.id ? "…" : "Check out"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function BookingDetails({ booking: b }: { booking: BookingData }) {
  const isPubTicket = b.pubMode === "ticket";
  const guestName = b.personName ?? b.userName;
  const ticketCode = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
      {/* Event header */}
      <div className="flex items-center gap-3 p-3 border-b border-white/10">
        {b.eventImage && (
          <img src={b.eventImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{b.eventTitle}</p>
          <p className="text-[11px] text-muted-foreground truncate">{b.vendorName} · {b.bookingDate}</p>
        </div>
        <div className="ml-auto shrink-0">
          <span className="text-[10px] font-mono tracking-widest bg-primary/15 text-primary border border-primary/30 rounded-md px-2 py-0.5">
            {ticketCode}
          </span>
        </div>
      </div>
      {/* Guest info row */}
      <div className="flex items-center gap-3 p-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{guestName.charAt(0).toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{guestName}</p>
          <p className="text-[11px] text-muted-foreground">
            {isPubTicket ? (
              <span className="flex items-center gap-1"><TicketIcon className="h-3 w-3 text-primary inline" /> Pub ticket</span>
            ) : b.eventType_ === "pub" ? (
              <span className="flex items-center gap-1"><Wine className="h-3 w-3 text-red-400 inline" /> Pub event</span>
            ) : "Event booking"}
          </p>
        </div>
        {/* Ticket breakdown chips */}
        <div className="flex flex-wrap gap-1 justify-end">
          {isPubTicket ? (
            <>
              {b.ticketWomen > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/30 text-pink-200">{b.ticketWomen}W</span>}
              {b.ticketMen > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">{b.ticketMen}M</span>}
              {b.ticketCouple > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{b.ticketCouple}C</span>}
            </>
          ) : b.guests > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-muted-foreground">
              <Users className="h-2.5 w-2.5 inline mr-0.5" />{b.guests}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stepper({ label, value, max, color, onChange }: { label: string; value: number; max: number; color: string; onChange: (v: number) => void }) {
  if (max <= 0) return null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${color}`}>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/70">booked: {max}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - 1))}
          className="h-8 w-8 rounded-lg border border-white/10 bg-black/30 hover:bg-white/10 flex items-center justify-center disabled:opacity-30"
          disabled={value <= 0}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-lg font-semibold tabular-nums w-7 text-center">{value}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))}
          className="h-8 w-8 rounded-lg border border-white/10 bg-black/30 hover:bg-white/10 flex items-center justify-center disabled:opacity-30"
          disabled={value >= max}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * The single "Save Actual Entry" form shown after a successful scan lookup.
 * The manager confirms or adjusts per-tier headcounts; for COD bookings the
 * cash-to-collect recalculates live from the current stepper values. Tapping
 * Save finalizes the booking server-side in one transaction (check-in,
 * commission ledger, vendor commissionOwed, loyalty, coupon lock, audit log)
 * and invalidates every analytics/commission/booking-report query key so
 * the admin and partner dashboards reflect the new totals immediately.
 */
function FinalizeActualEntry({
  booking: b,
  onFinalized,
}: {
  booking: BookingData;
  onFinalized: (updated: BookingData, checkedInAt: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTicket = b.pubMode === "ticket";
  const isCod = b.paymentMethod === "cod";
  // Pre-fill with the booked counts so a zero-edit Save records "everyone
  // showed up" — the manager only has to touch the steppers when reality
  // differs from the booking.
  const [w, setW] = useState<number>(b.actualWomen ?? b.ticketWomen);
  const [m, setM] = useState<number>(b.actualMen ?? b.ticketMen);
  const [c, setC] = useState<number>(b.actualCouple ?? b.ticketCouple);
  const [g, setG] = useState<number>(b.actualGuests ?? b.guests);
  const [saving, setSaving] = useState(false);

  const ferState = bookingFerState(b);
  const priceWomen = ferState.isTierFree("women") ? 0 : (b.priceWomen ?? 0);
  const priceMen = ferState.isTierFree("men") ? 0 : (b.priceMen ?? 0);
  const priceCouple = ferState.isTierFree("couple") ? 0 : (b.priceCouple ?? 0);

  // Booking discount ratio = finalPrice / totalPrice. Captures BOTH coupon
  // codes AND reward-points deductions in a single multiplier. Without this
  // the door cash would show the FULL sticker gross while the guest's
  // ticket shows the discounted finalPrice — leading the manager to over-
  // collect. Mirrors server-side bookingDiscountRatio() in lib/effectiveRevenue.ts.
  const totalPrice = Number(b.totalPrice ?? 0);
  const finalPrice = Number(b.finalPrice ?? 0);
  const discountRatio = totalPrice > 0
    ? Math.min(1, Math.max(0, finalPrice / totalPrice))
    : 1;
  const hasDiscount = discountRatio < 1 - 1e-6;

  // Live recalc mirrors server's calcActualAmountDue: per-tier × edited
  // count, scaled by the booking's discount ratio so coupon/points apply
  // at the door too. For non-ticket modes finalPrice is already post-
  // discount, so the prorated calculation needs no extra scaling.
  const grossLive = isTicket
    ? w * priceWomen + m * priceMen + c * priceCouple
    : 0;
  const liveTotal = isTicket
    ? grossLive * discountRatio
    : ferState.allGendersFree
      ? 0
      : (g / Math.max(1, b.guests)) * finalPrice;
  const liveTotalRounded = Math.round(liveTotal * 100) / 100;
  const grossLiveRounded = Math.round(grossLive * 100) / 100;
  const liveDiscountAmount = Math.round((grossLive - liveTotal) * 100) / 100;

  const bookingBaseFee = b.baseFee ?? 0;
  const totalWithBaseFee = Math.round((liveTotalRounded + bookingBaseFee) * 100) / 100;

  const subRows = isTicket
    ? [
        { label: "Women", qty: w, price: priceWomen, subtotal: w * priceWomen, free: ferState.isTierFree("women") },
        { label: "Men", qty: m, price: priceMen, subtotal: m * priceMen, free: ferState.isTierFree("men") },
        { label: "Couples", qty: c, price: priceCouple, subtotal: c * priceCouple, free: ferState.isTierFree("couple") },
      ].filter((r) => r.qty > 0)
    : [];

  const hasAnyBookedTicket = b.ticketWomen > 0 || b.ticketMen > 0 || b.ticketCouple > 0;
  if (isTicket && !hasAnyBookedTicket) return null;
  if (!isTicket && b.guests <= 0) return null;

  // Every query key whose underlying aggregate reads from bookings or
  // commission_ledger. Invalidated on save so the Admin Panel (Analytics /
  // Booking Report / Commission Tab) and Partner Dashboard (Analytics /
  // Leads / Booking Report) refetch with the new totals on next focus.
  const invalidateDashboards = () => {
    const keys = [
      getGetPartnerScannerOccupancyQueryKey(),
      getGetPartnerScannerBookingsQueryKey(),
      getGetPartnerAnalyticsQueryKey(),
      getGetPartnerLeadsQueryKey(),
      getGetPartnerCommissionQueryKey(),
      getGetPartnerCheckinReportQueryKey(),
      getGetAdminAnalyticsQueryKey(),
      getGetAdminBookingsReportQueryKey(),
      getGetAdminCheckinReportQueryKey(),
      getGetAdminLeadsQueryKey(),
      getGetCommissionReportQueryKey(),
      getGetAdminLiveOccupancyQueryKey(),
    ];
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const code = b.ticketCode ?? `RV-${String(b.id).padStart(6, "0")}`;
      const actualEntry = isTicket ? { women: w, men: m, couple: c } : { guests: g };
      const res = await fetch("/api/partner/scan-ticket", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, actualEntry }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (res.ok && json["booking"]) {
        const updated = json["booking"] as BookingData;
        const checkedInAt = typeof json["checkedInAt"] === "string" ? (json["checkedInAt"] as string) : new Date().toISOString();
        toast({ title: "Entry finalized", description: "Analytics and commission updated." });
        invalidateDashboards();
        onFinalized(updated, checkedInAt);
      } else {
        const errCode = typeof json["code"] === "string" ? (json["code"] as string) : "";
        const msg = typeof json["message"] === "string" ? (json["message"] as string) : "Failed to finalize.";
        if (errCode === "ALREADY_FINALIZED") {
          toast({ title: "Already finalized", description: msg, variant: "destructive" });
        } else {
          toast({ title: "Couldn't save", description: msg, variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Network error", description: "Couldn't reach server.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-black/30 border border-primary/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Actual entry
        </p>
        <span className="text-[10px] uppercase tracking-wider text-primary/80">Not yet finalized</span>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Confirm how many guests actually entered. Tap Save Actual Entry to lock the booking and update analytics.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {isTicket ? (
          <>
            <Stepper label="Women" value={w} max={b.ticketWomen} color="border-pink-500/30 bg-pink-500/5" onChange={setW} />
            <Stepper label="Men" value={m} max={b.ticketMen} color="border-blue-500/30 bg-blue-500/5" onChange={setM} />
            <Stepper label="Couples" value={c} max={b.ticketCouple} color="border-purple-500/30 bg-purple-500/5" onChange={setC} />
          </>
        ) : (
          <Stepper label="Guests" value={g} max={Math.max(b.guests, 1)} color="border-primary/30 bg-primary/5" onChange={setG} />
        )}
      </div>

      {/* Live cash callout — only for COD, since prepaid bookings are
          already settled. The amount recalculates as the manager edits
          counts and matches what the server will write on Save. */}
      {isCod && totalWithBaseFee > 0 && (
        <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-amber-900/10 p-4 shadow-[0_0_24px_-8px_rgba(245,158,11,0.5)]">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-amber-500/25 border border-amber-400/50 flex items-center justify-center shrink-0">
              <Banknote className="h-6 w-6 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80 font-semibold">Collect cash (COD)</p>
              <p className="text-[11px] text-amber-100/70 mt-0.5">
                {hasDiscount && isTicket
                  ? "Matches the discounted amount on the guest's ticket"
                  : "Recalculates as you edit counts"}
              </p>
            </div>
            <div className="text-right">
              {hasDiscount && isTicket && grossLiveRounded > liveTotalRounded && (
                <div className="text-[11px] text-amber-200/50 line-through tabular-nums leading-none mb-0.5">
                  ₹{grossLiveRounded.toLocaleString("en-IN")}
                </div>
              )}
              <div className="flex items-center justify-end gap-0.5 text-amber-200">
                <IndianRupee className="h-5 w-5" />
                <span className="text-3xl font-bold tabular-nums leading-none">{totalWithBaseFee.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-amber-100/80">
            {isTicket && subRows.map((r) => (
              <div key={r.label} className="flex justify-between">
                <span>{r.label} · {r.qty}{r.free ? " · FREE" : ` × ₹${r.price.toLocaleString("en-IN")}`}</span>
                <span className="tabular-nums">{r.free ? "—" : `₹${r.subtotal.toLocaleString("en-IN")}`}</span>
              </div>
            ))}
            {isTicket && hasDiscount && liveDiscountAmount > 0 && (
              <>
                <div className="flex justify-between pt-1.5 border-t border-amber-500/20">
                  <span>Subtotal</span>
                  <span className="tabular-nums">₹{grossLiveRounded.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-emerald-300/90">
                  <span>
                    Discount
                    {b.couponCode ? ` (${b.couponCode})` : ""}
                    {b.pointsUsed && b.pointsUsed > 0 ? ` · ${b.pointsUsed} pts` : ""}
                  </span>
                  <span className="tabular-nums">-₹{liveDiscountAmount.toLocaleString("en-IN")}</span>
                </div>
              </>
            )}
            {liveTotalRounded > 0 && (
              <div className={`flex justify-between ${bookingBaseFee > 0 ? "" : "pt-1.5 border-t border-amber-500/20 text-amber-200 font-semibold"}`}>
                <span>Ticket total</span>
                <span className="tabular-nums">₹{liveTotalRounded.toLocaleString("en-IN")}</span>
              </div>
            )}
            {bookingBaseFee > 0 && (
              <>
                <div className="flex justify-between text-amber-300/80">
                  <span>Base Fee (Incl. GST)</span>
                  <span className="tabular-nums">₹{bookingBaseFee.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-amber-500/20 text-amber-200 font-semibold">
                  <span>Total due</span>
                  <span className="tabular-nums">₹{totalWithBaseFee.toLocaleString("en-IN")}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {isCod && liveTotalRounded === 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Banknote className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-200">No cash to collect</p>
            <p className="text-xs text-emerald-200/70 mt-0.5">Free entry or zero guests admitted.</p>
          </div>
          <span className="text-xl font-semibold text-emerald-200 tabular-nums">₹0</span>
        </div>
      )}
      {!isCod && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-200">Already paid online</p>
            <p className="text-xs text-emerald-200/70 mt-0.5">Don't collect any cash. Counts above are recorded for analytics only.</p>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={saving}
        className="w-full bg-gradient-to-br from-primary to-primary/70 border-0 text-base py-3 gap-2"
      >
        {saving ? "Saving…" : "Save Actual Entry"}
      </Button>
    </div>
  );
}

/**
 * Read-only summary card shown after a booking has been finalized — either
 * from a fresh successful Save (green path) or a re-scan of an already-
 * finalized ticket (amber path). Renders the recorded counts and the
 * amount that was written to the ledger; the form is intentionally absent
 * because edits are locked after Save.
 */
function FinalizedSummary({ booking: b }: { booking: BookingData }) {
  const isTicket = b.pubMode === "ticket";
  const aw = b.actualWomen ?? 0;
  const am = b.actualMen ?? 0;
  const ac = b.actualCouple ?? 0;
  const ag = b.actualGuests ?? 0;
  const amountDue = b.actualAmountDue ?? 0;
  const feeAmt = b.baseFee ?? 0;
  const totalCollected = amountDue + feeAmt;
  const isCod = b.paymentMethod === "cod";
  const rows = isTicket
    ? [
        { label: "Women", qty: aw, booked: b.ticketWomen },
        { label: "Men", qty: am, booked: b.ticketMen },
        { label: "Couples", qty: ac, booked: b.ticketCouple },
      ].filter((r) => r.booked > 0)
    : [{ label: "Guests", qty: ag, booked: b.guests }];
  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Recorded entry</p>
        <span className="text-[10px] uppercase tracking-wider text-green-300/80">Locked</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{r.label}</p>
            <p className="text-lg font-semibold tabular-nums">{r.qty}<span className="text-xs text-muted-foreground"> / {r.booked} booked</span></p>
          </div>
        ))}
      </div>
      {isCod && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <Banknote className="h-5 w-5 text-amber-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-200/80">Cash collected (COD)</p>
              <div className="flex items-center gap-0.5 text-amber-200">
                <IndianRupee className="h-4 w-4" />
                <span className="text-xl font-bold tabular-nums">{totalCollected.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
          {feeAmt > 0 && (
            <div className="text-[11px] text-amber-100/70 space-y-0.5 pt-1 border-t border-amber-400/20">
              <div className="flex justify-between">
                <span>Ticket amount</span>
                <span className="tabular-nums">₹{Number(amountDue).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span>Base Fee (Incl. GST)</span>
                <span className="tabular-nums">₹{feeAmt.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
