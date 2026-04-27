import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ScanLine, Users, Ticket as TicketIcon, Wine } from "lucide-react";

interface ScanSuccess {
  code: "OK";
  checkedInAt: string;
  booking: any;
}

interface ScanAlreadyUsed {
  code: "ALREADY_CHECKED_IN";
  message: string;
  checkedInAt: string | null;
  booking: any;
}

interface ScanError {
  code: string;
  message: string;
}

type ScanResult = ScanSuccess | ScanAlreadyUsed | ScanError;

export function TicketScanner() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const { toast } = useToast();

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = input.trim();
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
      const json = await res.json();
      if (res.ok) {
        setResult(json as ScanSuccess);
      } else {
        const scanResult: ScanResult = {
          code: json?.code ?? "UNKNOWN",
          message: json?.message ?? `Error ${res.status}`,
          ...(json?.checkedInAt ? { checkedInAt: json.checkedInAt } : {}),
          ...(json?.booking ? { booking: json.booking } : {}),
        } as ScanResult;
        setResult(scanResult);
        if (json?.code !== "ALREADY_CHECKED_IN") {
          toast({ title: "Scan failed", description: (scanResult as ScanError).message, variant: "destructive" });
        }
      }
    } catch (err: any) {
      const scanErr: ScanError = { code: "NETWORK_ERROR", message: "Network error. Check your connection." };
      setResult(scanErr);
      toast({ title: "Scan failed", description: scanErr.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resultCode = result ? (result as any).code : null;
  const booking = result ? (result as any).booking : null;

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-primary mb-2 accent-underline inline-block">Partner tool</p>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-3 flex items-center gap-3">
          <ScanLine className="h-9 w-9 text-primary" /> Ticket scanner
        </h1>
        <p className="mt-2 text-muted-foreground">Type or paste a booking code (e.g. RV-000042) to validate entry at the door.</p>
      </header>

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

      {result && (
        <div className={`mt-6 rounded-3xl overflow-hidden border ${
          resultCode === "OK"
            ? "border-green-500/40 bg-green-900/10"
            : resultCode === "ALREADY_CHECKED_IN"
            ? "border-red-500/60 bg-red-900/20"
            : "border-red-500/40 bg-red-900/10"
        }`}>
          {resultCode === "OK" && booking ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
                  <CheckCircle2 className="h-7 w-7 text-green-400" />
                </div>
                <div>
                  <p className="text-green-300 font-semibold text-lg">Entry granted</p>
                  <p className="text-xs text-muted-foreground">
                    Checked in at {new Date((result as ScanSuccess).checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <BookingDetails booking={booking} />
            </div>
          ) : resultCode === "ALREADY_CHECKED_IN" ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 border border-red-500/60 p-2">
                  <XCircle className="h-7 w-7 text-red-400" />
                </div>
                <div>
                  <p className="text-red-300 font-semibold text-lg">Already used</p>
                  <p className="text-xs text-muted-foreground">
                    {(result as ScanAlreadyUsed).checkedInAt
                      ? `Checked in at ${new Date((result as ScanAlreadyUsed).checkedInAt!).toLocaleString("en-IN")}`
                      : "This ticket was already checked in."}
                  </p>
                </div>
              </div>
              {booking && <BookingDetails booking={booking} />}
            </div>
          ) : (
            <div className="p-6 flex items-center gap-3">
              <div className="rounded-full bg-red-500/20 border border-red-500/40 p-2">
                <XCircle className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <p className="text-red-300 font-semibold">Invalid ticket</p>
                <p className="text-sm text-muted-foreground mt-0.5">{(result as ScanError).message}</p>
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

function BookingDetails({ booking: b }: { booking: any }) {
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
          <p className="font-medium">{b.personName || b.userName}</p>
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
      {isPubTicket && (b.ticketWomen || b.ticketMen || b.ticketCouple) ? (
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
