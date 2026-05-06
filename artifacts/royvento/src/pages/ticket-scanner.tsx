import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ScanLine, Users, Ticket as TicketIcon, Wine, Bell, Camera, CameraOff, Zap, ZapOff, Plus, Minus, IndianRupee, Banknote } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useGetMe } from "@workspace/api-client-react";

interface BookingData {
  id: number;
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
  finalPrice: number;
  priceWomen?: number;
  priceMen?: number;
  priceCouple?: number;
  paymentMethod?: string;
  actualWomen?: number | null;
  actualMen?: number | null;
  actualCouple?: number | null;
  actualGuests?: number | null;
  actualAmountDue?: number | null;
}

interface ScanSuccess {
  code: "OK";
  checkedInAt: string;
  booking: BookingData;
}

interface ScanAlreadyUsed {
  code: "ALREADY_CHECKED_IN";
  message: string;
  checkedInAt: string | null;
  booking: BookingData;
}

interface ScanError {
  code: string;
  message: string;
}

type ScanResult = ScanSuccess | ScanAlreadyUsed | ScanError;

function isScanSuccess(r: ScanResult): r is ScanSuccess {
  return r.code === "OK";
}

function isScanAlreadyUsed(r: ScanResult): r is ScanAlreadyUsed {
  return r.code === "ALREADY_CHECKED_IN";
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

function CameraScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      onDetect(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [onDetect]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const caps = (videoTrack.getCapabilities as (() => Record<string, unknown>) | undefined)?.();
        if (caps?.torch) setTorchSupported(true);
      }
      rafRef.current = requestAnimationFrame(scanFrame);
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

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full"
        style={{ maxHeight: 320 }}
      />
      <canvas ref={canvasRef} className="hidden" />
      {/* Scanning overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-52 h-52 relative">
          {/* Corner markers */}
          {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos) => (
            <div key={pos} className={`absolute w-8 h-8 ${pos} border-2 border-primary`}
              style={{
                borderRight: pos.includes("right") ? undefined : "none",
                borderLeft: pos.includes("left") ? undefined : "none",
                borderBottom: pos.includes("bottom") ? undefined : "none",
                borderTop: pos.includes("top") ? undefined : "none",
                borderRadius: 4,
              }}
            />
          ))}
          {/* Scan line */}
          {scanning && (
            <div
              className="absolute left-2 right-2 h-0.5 bg-primary opacity-80"
              style={{ animation: "scanLine 2s ease-in-out infinite", top: "50%" }}
            />
          )}
        </div>
      </div>
      {torchSupported && (
        <button
          onClick={toggleTorch}
          aria-label={torchOn ? "Turn off torch" : "Turn on torch"}
          className="absolute top-3 right-3 rounded-full p-2 bg-black/60 border border-white/20 text-white hover:bg-black/80 transition-colors z-10"
        >
          {torchOn ? <Zap className="h-4 w-4 text-yellow-300" /> : <ZapOff className="h-4 w-4 text-white/60" />}
        </button>
      )}
      <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/60">
        {scanning ? "Scanning for QR code…" : "Starting camera…"}
      </p>
      <style>{`
        @keyframes scanLine {
          0% { transform: translateY(-60px); }
          50% { transform: translateY(60px); }
          100% { transform: translateY(-60px); }
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

  const validateCode = async (code: string) => {
    if (!code) return;
    setLoading(true);
    setResult(null);
    try {
      const token = (() => { try { return localStorage.getItem("royvento_token"); } catch { return null; } })();
      const res = await fetch("/api/partner/scan-ticket", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const json = (await res.json()) as ScanSuccess;
        setResult(json);
      } else {
        const json = (await res.json()) as Record<string, unknown>;
        const errCode = typeof json.code === "string" ? json.code : "UNKNOWN";
        const message = typeof json.message === "string" ? json.message : `Error ${res.status}`;
        if (errCode === "ALREADY_CHECKED_IN") {
          const scanResult: ScanAlreadyUsed = {
            code: "ALREADY_CHECKED_IN",
            message,
            checkedInAt: typeof json.checkedInAt === "string" ? json.checkedInAt : null,
            booking: json.booking as BookingData,
          };
          setResult(scanResult);
        } else {
          const scanResult: ScanError = { code: errCode, message };
          setResult(scanResult);
          toast({ title: "Scan failed", description: message, variant: "destructive" });
        }
      }
    } catch {
      const scanErr: ScanError = { code: "NETWORK_ERROR", message: "Network error. Check your connection." };
      setResult(scanErr);
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
        <div className="rounded-3xl glass-card-strong p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">Point your camera at a QR code on the guest's ticket</p>
          <CameraScanner
            onDetect={(code) => {
              const cleaned = code.trim().toUpperCase();
              setInput(cleaned);
              setCameraMode(false);
              validateCode(cleaned);
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
        <div className={`mt-6 rounded-3xl overflow-hidden border ${
          result.code === "OK"
            ? "border-green-500/40 bg-green-900/10"
            : result.code === "ALREADY_CHECKED_IN"
            ? "border-red-500/60 bg-red-900/20"
            : "border-red-500/40 bg-red-900/10"
        }`}>
          {isScanSuccess(result) ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
                  <CheckCircle2 className="h-7 w-7 text-green-400" />
                </div>
                <div>
                  <p className="text-green-300 font-semibold text-lg">Entry granted</p>
                  <p className="text-xs text-muted-foreground">
                    Checked in at {new Date(result.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <BookingDetails booking={result.booking} />
              <ActualEntryForm
                key={`ok-${result.booking.id}`}
                booking={result.booking}
                onSaved={(updated) => setResult({ ...result, booking: updated })}
              />
            </div>
          ) : isScanAlreadyUsed(result) ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 border border-red-500/60 p-2">
                  <XCircle className="h-7 w-7 text-red-400" />
                </div>
                <div>
                  <p className="text-red-300 font-semibold text-lg">Already used</p>
                  <p className="text-xs text-muted-foreground">
                    {result.checkedInAt
                      ? `Checked in at ${new Date(result.checkedInAt).toLocaleString("en-IN")}`
                      : "This ticket was already checked in."}
                  </p>
                </div>
              </div>
              <BookingDetails booking={result.booking} />
              <ActualEntryForm
                key={`used-${result.booking.id}`}
                booking={result.booking}
                onSaved={(updated) => setResult({ ...result, booking: updated })}
              />
            </div>
          ) : (
            <div className="p-6 flex items-center gap-3">
              <div className="rounded-full bg-red-500/20 border border-red-500/40 p-2">
                <XCircle className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <p className="text-red-300 font-semibold">Invalid ticket</p>
                <p className="text-sm text-muted-foreground mt-0.5">{result.message}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            onClick={() => { setResult(null); setInput(""); }}
            className="text-muted-foreground hover:text-foreground"
          >
            Scan another ticket →
          </Button>
        </div>
      )}
    </div>
  );
}

function BookingDetails({ booking: b }: { booking: BookingData }) {
  const isPubTicket = b.pubMode === "ticket";
  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-4 space-y-2">
      <div className="flex items-start gap-3">
        {b.eventImage && (
          <img src={b.eventImage} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
        )}
        <div>
          <p className="font-serif text-xl">{b.eventTitle}</p>
          <p className="text-xs text-muted-foreground">{b.vendorName}</p>
        </div>
      </div>
      <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Guest</p>
          <p className="font-medium">{b.personName ?? b.userName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="font-medium">{b.bookingDate}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ticket code</p>
          <p className="font-mono text-primary">RV-{String(b.id).padStart(6, "0")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Booking type</p>
          <p className="flex items-center gap-1">
            {isPubTicket ? (
              <><TicketIcon className="h-3.5 w-3.5 text-primary" /> Pub ticket</>
            ) : b.eventType_ === "pub" ? (
              <><Wine className="h-3.5 w-3.5 text-red-400" /> Pub event</>
            ) : (
              "Event booking"
            )}
          </p>
        </div>
      </div>
      {isPubTicket && (b.ticketWomen > 0 || b.ticketMen > 0 || b.ticketCouple > 0) ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {b.ticketWomen > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/30 text-pink-200">
              <Users className="h-3 w-3 inline mr-1" />{b.ticketWomen} Women
            </span>
          )}
          {b.ticketMen > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">
              <Users className="h-3 w-3 inline mr-1" />{b.ticketMen} Men
            </span>
          )}
          {b.ticketCouple > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">
              <Users className="h-3 w-3 inline mr-1" />{b.ticketCouple} Couple{b.ticketCouple > 1 ? "s" : ""}
            </span>
          )}
        </div>
      ) : b.guests > 0 ? (
        <p className="text-sm text-muted-foreground pt-1">
          <Users className="h-3.5 w-3.5 inline mr-1" />{b.guests} guests
        </p>
      ) : null}
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

function ActualEntryForm({ booking: b, onSaved }: { booking: BookingData; onSaved: (b: BookingData) => void }) {
  const { toast } = useToast();
  const isTicket = b.pubMode === "ticket";
  const initWomen = b.actualWomen ?? b.ticketWomen;
  const initMen = b.actualMen ?? b.ticketMen;
  const initCouple = b.actualCouple ?? b.ticketCouple;
  const initGuests = b.actualGuests ?? b.guests;
  const [w, setW] = useState<number>(initWomen);
  const [m, setM] = useState<number>(initMen);
  const [c, setC] = useState<number>(initCouple);
  const [g, setG] = useState<number>(initGuests);
  const [saving, setSaving] = useState(false);
  const isCod = b.paymentMethod === "cod";
  const alreadyRecorded = (
    b.actualWomen != null || b.actualMen != null || b.actualCouple != null || b.actualGuests != null
  );

  // LIVE running total computed from current stepper values (not server response,
  // which is null until the user saves). Only relevant for COD bookings.
  const priceWomen = b.priceWomen ?? 0;
  const priceMen = b.priceMen ?? 0;
  const priceCouple = b.priceCouple ?? 0;
  const liveTotal = isTicket
    ? w * priceWomen + m * priceMen + c * priceCouple
    : (g / Math.max(1, b.guests)) * b.finalPrice;
  const liveTotalRounded = Math.round(liveTotal * 100) / 100;
  const subRows: { label: string; qty: number; price: number; subtotal: number }[] = isTicket
    ? [
        { label: "Women", qty: w, price: priceWomen, subtotal: w * priceWomen },
        { label: "Men", qty: m, price: priceMen, subtotal: m * priceMen },
        { label: "Couples", qty: c, price: priceCouple, subtotal: c * priceCouple },
      ].filter((r) => r.qty > 0)
    : [];

  // Hide entirely when no relevant booked counts (e.g. ticket-mode with 0 across the board)
  const hasAnyBookedTicket = b.ticketWomen > 0 || b.ticketMen > 0 || b.ticketCouple > 0;
  if (isTicket && !hasAnyBookedTicket) return null;
  if (!isTicket && b.guests <= 0) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const token = (() => { try { return localStorage.getItem("royvento_token"); } catch { return null; } })();
      const code = `RV-${String(b.id).padStart(6, "0")}`;
      const actualEntry = isTicket
        ? { women: w, men: m, couple: c }
        : { guests: g };
      const res = await fetch("/api/partner/scan-ticket", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code, actualEntry }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (res.ok && json["booking"]) {
        toast({ title: "Actual entry saved" });
        onSaved(json["booking"] as BookingData);
      } else {
        const msg = typeof json["message"] === "string" ? (json["message"] as string) : "Failed to save actuals.";
        toast({ title: "Couldn't save", description: msg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Couldn't reach server.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Actual entry</p>
        {alreadyRecorded && (
          <span className="text-[10px] uppercase tracking-wider text-green-300/80">Recorded</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-1">Adjust if fewer guests showed up than booked.</p>

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

      {isCod && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          {isTicket && subRows.length > 0 && (
            <div className="space-y-1">
              {subRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs text-amber-100/80">
                  <span>{r.label} · {r.qty} × ₹{r.price.toLocaleString("en-IN")}</span>
                  <span className="tabular-nums">₹{r.subtotal.toLocaleString("en-IN")}</span>
                </div>
              ))}
              <div className="h-px bg-amber-300/20 my-1" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Total to collect (COD)
            </span>
            <span className="text-xl font-semibold text-amber-200 tabular-nums flex items-center gap-1">
              <IndianRupee className="h-4 w-4" />{liveTotalRounded.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={saving}
        className="w-full bg-gradient-to-br from-primary to-primary/70 border-0 text-base py-3 gap-2"
      >
        {saving ? "Saving…" : alreadyRecorded ? "Update actual entry" : "Save actual entry"}
      </Button>
    </div>
  );
}
