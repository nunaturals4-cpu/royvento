import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import jsQR from "jsqr";
import { useGetParty, useScanPartyTicket } from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2, XCircle, ScanLine, Camera, CameraOff, ArrowLeft, Keyboard } from "lucide-react";

const GOLD = "#d4af37";
const RED = "#b91c1c";
const PARTY = "#f472b6";

interface ScanResult { ok: boolean; title: string; sub?: string; }

export function PartyScanner() {
  const params = useParams();
  const id = Number(params.id);
  const { data: party, isLoading } = useGetParty(id, { query: { enabled: !Number.isNaN(id), retry: false } as any });
  const scan = useScanPartyTicket();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });
  const [cameraOn, setCameraOn] = useState(true);
  const [camError, setCamError] = useState("");
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleCode = useCallback((raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const now = Date.now();
    // Debounce repeat reads of the same code for 3s.
    if (lastRef.current.code === code && now - lastRef.current.t < 3000) return;
    lastRef.current = { code, t: now };
    if (scan.isPending) return;
    scan.mutate(
      { id, data: { code } },
      {
        onSuccess: (r) => setResult({ ok: true, title: `✓ ${r.name || "Checked in"}`, sub: `${r.quantity ?? 1} ${(r.quantity ?? 1) === 1 ? "ticket" : "tickets"} · ${code}` }),
        onError: (e: any) => setResult({ ok: false, title: e?.data?.error ?? (e instanceof Error ? e.message.replace(/^HTTP \d+[^:]*:\s*/, "") : "Scan failed"), sub: code }),
      },
    );
  }, [id, scan]);

  // Camera + scan loop. Prefer the native BarcodeDetector; fall back to jsQR.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    const BD = (window as any).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCamError("Camera unavailable — use manual entry below.");
        return;
      }

      const tick = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              const found = await detector.detect(v);
              if (found?.[0]?.rawValue) handleCode(found[0].rawValue);
            } else if (ctx) {
              const w = 640;
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w; canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const q = jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" });
              if (q?.data) handleCode(q.data);
            }
          } catch { /* keep scanning */ }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOn, handleCode]);

  if (isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center bg-background"><Spinner /></div>;
  }
  if (!party) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-background text-center px-4">
        <p className="font-serif text-2xl" style={{ color: "#fff" }}>Party not found</p>
        <Link href="/dashboard/parties" className="text-sm" style={{ color: GOLD }}>Back to dashboard</Link>
      </div>
    );
  }
  if (!party.isOrganizer) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-background text-center px-4">
        <XCircle className="h-10 w-10" style={{ color: RED }} />
        <p className="font-serif text-2xl" style={{ color: "#fff" }}>Hosts only</p>
        <p className="text-sm max-w-sm" style={{ color: "rgba(255,255,255,0.6)" }}>You can only scan tickets for parties you created.</p>
        <Link href="/dashboard/parties" className="text-sm" style={{ color: GOLD }}>Back to dashboard</Link>
      </div>
    );
  }

  return (
    <>
      <SEO title={`Scan tickets · ${party.name} | Royvento`} noindex />
      <div className="min-h-screen bg-background pb-16">
        <div className="container mx-auto px-4 md:px-6 py-6 max-w-xl">
          <Link href="/dashboard/parties">
            <a className="inline-flex items-center gap-1.5 mb-4 text-xs font-medium hover:text-white" style={{ color: "rgba(255,255,255,0.6)" }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </a>
          </Link>

          <div className="flex items-center gap-3 mb-5">
            <span className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0" style={{ background: `${PARTY}1f`, border: `1px solid ${PARTY}44` }}>
              <ScanLine className="h-5 w-5" style={{ color: PARTY }} />
            </span>
            <div className="min-w-0">
              <h1 className="font-serif text-2xl truncate" style={{ color: "#fff" }}>Scan tickets</h1>
              <p className="text-sm truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{party.name}</p>
            </div>
          </div>

          {/* Camera viewport */}
          <div className="relative rounded-3xl overflow-hidden mb-4" style={{ aspectRatio: "1 / 1", background: "#000", border: "1px solid rgba(255,255,255,0.1)" }}>
            {cameraOn ? (
              <>
                <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="h-2/3 w-2/3 rounded-2xl" style={{ border: `2px solid ${PARTY}`, boxShadow: `0 0 0 9999px rgba(0,0,0,0.35)` }} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: "rgba(255,255,255,0.5)" }}>
                <CameraOff className="h-8 w-8" /> Camera off
              </div>
            )}
          </div>

          {camError && <p className="text-xs mb-3 text-center" style={{ color: "#fca5a5" }}>{camError}</p>}

          <button type="button" onClick={() => setCameraOn((v) => !v)}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
            {cameraOn ? <><CameraOff className="h-4 w-4" /> Turn camera off</> : <><Camera className="h-4 w-4" /> Turn camera on</>}
          </button>

          {/* Result */}
          {result && (
            <div className="rounded-2xl p-4 mb-4 flex items-start gap-3"
              style={{ background: result.ok ? "rgba(74,222,128,0.1)" : `${RED}14`, border: `1px solid ${result.ok ? "rgba(74,222,128,0.4)" : `${RED}55`}` }}>
              {result.ok ? <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "#4ade80" }} /> : <XCircle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "#fca5a5" }} />}
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: result.ok ? "#4ade80" : "#fca5a5" }}>{result.title}</p>
                {result.sub && <p className="text-xs mt-0.5 font-mono" style={{ color: "rgba(255,255,255,0.55)" }}>{result.sub}</p>}
              </div>
            </div>
          )}

          {/* Manual entry */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="flex items-center gap-1.5 text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>
              <Keyboard className="h-3.5 w-3.5" /> Enter code manually
            </p>
            <div className="flex gap-2">
              <input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { handleCode(manual); setManual(""); } }}
                placeholder="e.g. AB12CD34" maxLength={32}
                className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-mono uppercase outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
              <button type="button" disabled={!manual.trim() || scan.isPending}
                onClick={() => { handleCode(manual); setManual(""); }}
                className="px-5 rounded-xl text-sm font-semibold"
                style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff", opacity: !manual.trim() ? 0.5 : 1 }}>
                Check in
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
