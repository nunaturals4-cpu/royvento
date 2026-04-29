import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Send, Loader2, Sparkles, MapPin } from "lucide-react";
import { apiPost, apiGet } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AnnouncementCtx {
  title: string;
  vendorName: string;
  announceDate: string;
  announceTime: string;
  eventId: number;
}

const TOP_CITIES = ["Kolkata", "Delhi", "Mumbai", "Bangalore", "Hyderabad"];

const STATIC_CHIPS = [
  "Best pubs in Kolkata",
  "Best pubs in Delhi",
  "Best pubs in Mumbai",
  "Book a table tonight",
];

const WELCOME_MSG =
  "Welcome to Royvento — your guide to India's best pubs and nightlife. Ask me anything or pick a topic below.";

function parseCity(text: string): string {
  const lower = text.toLowerCase();
  for (const city of TOP_CITIES) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  if (lower.includes("kolkata") || lower.includes("calcutta")) return "Kolkata";
  if (lower.includes("delhi") || lower.includes("new delhi")) return "Delhi";
  if (lower.includes("bombay") || lower.includes("mumbai")) return "Mumbai";
  if (lower.includes("bangalore") || lower.includes("bengaluru")) return "Bangalore";
  if (lower.includes("hyderabad") || lower.includes("hyd")) return "Hyderabad";
  if (lower.includes("goa")) return "Goa";
  if (lower.includes("pune")) return "Pune";
  if (lower.includes("chennai") || lower.includes("madras")) return "Chennai";
  return "";
}

function renderMessageContent(content: string) {
  const parts = content.split(/(\[View & Book →\]\(\/events\/\d+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/\[View & Book →\]\(\/events\/(\d+)\)/);
    if (match) {
      return (
        <Link key={i} href={`/events/${match[1]}`}>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 mt-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-xs font-semibold cursor-pointer border border-primary/30">
            View &amp; Book →
          </span>
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME_MSG },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState("");
  const [detectedCity, setDetectedCity] = useState("");
  const [awaitingCity, setAwaitingCity] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementCtx[]>([]);
  const [locationInit, setLocationInit] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!open || locationInit) return;
    setLocationInit(true);

    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await r.json();
          const raw =
            data.address?.city ||
            data.address?.town ||
            data.address?.state_district ||
            data.address?.state ||
            "";
          const found = parseCity(raw) || raw.split(",")[0].trim();
          if (found) {
            setDetectedCity(found);
            setCity(found);
            apiGet<AnnouncementCtx[]>("/api/announcements/recent")
              .then(setAnnouncements)
              .catch(() => {});
          }
        } catch {
          // silently ignore — welcome message already shown
        }
      },
      () => {
        // permission denied — show city picker on first interaction
      }
    );
  }, [open]);

  function askForCity() {
    setAwaitingCity(true);
  }

  function pickCity(c: string) {
    setCity(c);
    setAwaitingCity(false);
    sendMessage(`Best pubs in ${c}`, c);
  }

  const chips = detectedCity
    ? [`Best pubs near me in ${detectedCity}`, ...STATIC_CHIPS.filter((c) => !c.includes(detectedCity))]
    : STATIC_CHIPS;

  async function sendMessage(text: string, overrideCity?: string) {
    const activeCity = overrideCity ?? city;
    const userMsg: Message = { role: "user", content: text };
    const history = messages.slice(-8);
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const detectedFromText = parseCity(text);
    const finalCity = detectedFromText || activeCity;
    if (detectedFromText && !city) setCity(detectedFromText);

    try {
      const res = await apiPost<{ reply: string }>("/api/ai/chat", {
        message: text,
        city: finalCity,
        history,
        announcements,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble connecting right now. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    if (awaitingCity) {
      const found = parseCity(text) || text.trim();
      setCity(found);
      setAwaitingCity(false);
      sendMessage(`Best pubs in ${found}`, found);
      return;
    }

    if (!city) {
      askForCity();
      return;
    }

    sendMessage(text);
  };

  const handleChip = (chip: string) => {
    if (loading) return;
    const found = parseCity(chip);
    if (found && !city) setCity(found);
    setInput("");
    sendMessage(chip, found || city);
  };

  const showChips = messages.length <= 1 && !loading;

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Open Roy AI"
            className="h-14 w-14 rounded-full shadow-xl active:scale-95 transition-all flex items-center justify-center red-glow"
            style={{ background: "linear-gradient(135deg, #e11d48 0%, #9333ea 100%)" }}
          >
            <Sparkles className="h-6 w-6 text-white" />
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[370px] max-w-[calc(100vw-1.5rem)] rounded-3xl glass-card-strong border border-border shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "540px" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ background: "linear-gradient(135deg, #e11d48 0%, #9333ea 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 border-2 border-white/30">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-white leading-none">Roy</p>
                <p className="text-[11px] text-white/80 mt-0.5">✦ Nightlife AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {city && (
                <span className="flex items-center gap-1 text-[10px] text-white/70 bg-white/10 rounded-full px-2 py-0.5">
                  <MapPin className="h-2.5 w-2.5" />{city}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div
                    className="h-6 w-6 rounded-full shrink-0 mr-2 mt-0.5 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #e11d48 0%, #9333ea 100%)" }}
                  >
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm text-foreground"
                  }`}
                >
                  {m.role === "assistant" ? renderMessageContent(m.content) : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start items-end">
                <div
                  className="h-6 w-6 rounded-full shrink-0 mr-2 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #e11d48 0%, #9333ea 100%)" }}
                >
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="bg-card border border-border px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {/* City picker — shown when city unknown */}
            {awaitingCity && (
              <div className="flex flex-wrap gap-2 mt-2">
                <p className="w-full text-xs text-muted-foreground mb-1">Which city are you in?</p>
                {TOP_CITIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => pickCity(c)}
                    className="px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Quick-start chips */}
            {showChips && !awaitingCity && (
              <div className="flex flex-wrap gap-2 mt-1">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChip(chip)}
                    className="px-3 py-1.5 rounded-full bg-card border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-3 border-t border-border shrink-0">
            <form onSubmit={send} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={awaitingCity ? "Type a city name…" : "Ask about pubs, events, pricing…"}
                className="flex-1 h-10 bg-background border-border text-sm"
                disabled={loading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={loading || !input.trim()}
                className="h-10 w-10 rounded-xl text-white shrink-0 border-0"
                style={{ background: "linear-gradient(135deg, #e11d48 0%, #9333ea 100%)" }}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
