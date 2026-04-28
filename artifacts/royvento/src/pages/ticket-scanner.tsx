import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ScanLine, Users, Ticket as TicketIcon, Wine, Bell } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

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
  token: string;
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

  const respond = async (id: number, token: string, action: "accept" | "reject") => {
    setActing(id);
    try {
      await apiPost(`/api/manager/invitations/${action}`, { token });
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
            <Button size="sm" disabled={acting === inv.id} onClick={() => respond(inv.id, inv.token, "accept")}
              className="bg-primary hover:bg-primary/90 border-0 text-primary-foreground">Accept</Button>
            <Button size="sm" variant="outline" disabled={acting === inv.id} onClick={() => respond(inv.id, inv.token, "reject")}
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

  useEffect(() => {
    const token = (() => { try { return localStorage.getItem("royvento_token"); } catch { return null; } })();
    if (!token) { setAccessStatus("denied"); return; }

    // Decode role from JWT payload (no verification needed on client — server re-checks on every request)
    let role = "user";
    try {
      const payload = JSON.parse(atob(token.split(".")[1]!));
      role = typeof payload.role === "string" ? payload.role : "user";
    } catch { /* ignore */ }

    // Always fetch managed venues regardless of role
    apiGet<{ id: number; businessName: string }[]>("/api/manager/my-vendors").then((vendors) => {
      setManagedVendors(vendors);
      if (role === "vendor" || role === "admin" || vendors.length > 0) {
        setAccessStatus("allowed");
      } else {
        setAccessStatus("denied");
      }
    }).catch(() => {
      // If API call fails, still allow vendors/admins
      setAccessStatus(role === "vendor" || role === "admin" ? "allowed" : "denied");
    });
  }, []);

  return { accessStatus, managedVendors };
}

export function TicketScanner() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const { toast } = useToast();
  const { accessStatus, managedVendors } = useAccessCheck();

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
        <a href="/dashboard/profile" className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4">Go to profile to accept invitations</a>
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
