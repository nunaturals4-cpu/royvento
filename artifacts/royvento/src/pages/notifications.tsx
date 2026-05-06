import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type PushState = "unsupported" | "loading" | "subscribed" | "unsubscribed" | "denied";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function WebPushToggle() {
  const { toast } = useToast();
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "unsubscribed");
    }).catch(() => setState("unsubscribed"));
  }, []);

  const subscribe = async () => {
    setState("loading");
    try {
      const { publicKey } = await apiGet<{ publicKey: string }>("/api/push/vapid-public-key");
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        toast({ title: "Permission denied", description: "Enable notifications in your browser settings to receive push alerts.", variant: "destructive" });
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiPost("/api/push/subscribe", { subscription: sub.toJSON() });
      setState("subscribed");
      toast({ title: "Push notifications enabled", description: "You'll now get booking reminders and announcements even when the tab is closed." });
    } catch (err: any) {
      setState("unsubscribed");
      const msg = err?.message ?? "";
      if (msg.includes("503") || msg.includes("not configured")) {
        toast({ title: "Not available yet", description: "Push notifications aren't configured on this server.", variant: "destructive" });
      } else {
        toast({ title: "Could not enable push", description: "Please try again.", variant: "destructive" });
      }
    }
  };

  const unsubscribe = async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await apiDelete("/api/push/subscribe");
      setState("unsubscribed");
      toast({ title: "Push notifications disabled", description: "You won't receive browser push alerts anymore." });
    } catch {
      setState("subscribed");
      toast({ title: "Could not disable push", description: "Please try again.", variant: "destructive" });
    }
  };

  if (state === "unsupported") return null;

  return (
    <div className="rounded-2xl glass-card px-5 py-4 flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${state === "subscribed" ? "bg-primary/15" : "bg-muted"}`}>
          {state === "subscribed" ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            {state === "subscribed" ? "Browser push on" : state === "denied" ? "Notifications blocked" : "Browser push off"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {state === "subscribed"
              ? "Reminders and announcements delivered even when the tab is closed."
              : state === "denied"
              ? "Allow notifications in your browser settings, then reload."
              : "Enable to get booking reminders and partner announcements instantly."}
          </p>
        </div>
      </div>
      {state !== "denied" && (
        <Button
          size="sm"
          variant={state === "subscribed" ? "outline" : "default"}
          onClick={state === "subscribed" ? unsubscribe : subscribe}
          disabled={state === "loading"}
          className="shrink-0"
        >
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === "subscribed" ? (
            "Turn off"
          ) : (
            "Turn on"
          )}
        </Button>
      )}
    </div>
  );
}

export function Notifications() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => apiGet<Notification[]>("/api/notifications"),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiPatch(`/api/notifications/${id}/read`, {}),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<Notification[]>(["notifications"], (prev) =>
        (prev ?? []).map((n) => n.id === id ? { ...n, isRead: true } : n),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = (data ?? []).filter((n) => !n.isRead);
      await Promise.all(unread.map((n) => apiPatch(`/api/notifications/${n.id}/read`, {})));
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<Notification[]>(["notifications"], (prev) =>
        (prev ?? []).map((n) => ({ ...n, isRead: true })),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () =>
      toast({ title: "Could not mark all as read", description: "Please try again.", variant: "destructive" }),
  });

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Bell className="h-7 w-7 text-primary" />
          <div>
            <h1 className="font-serif text-4xl tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-muted-foreground text-sm mt-1">{unreadCount} unread</p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="gap-2"
          >
            {markAllRead.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      <WebPushToggle />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-3xl glass-card p-16 text-center">
          <Bell className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-20" />
          <h2 className="font-serif text-2xl mb-2">All caught up!</h2>
          <p className="text-muted-foreground">No notifications yet. Check back later.</p>
        </div>
      ) : (
        <div className="rounded-3xl glass-card overflow-hidden divide-y divide-border">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`px-6 py-4 flex items-start gap-3 cursor-pointer hover:bg-accent/20 transition-colors ${
                !n.isRead ? "bg-primary/5" : ""
              }`}
              onClick={() => {
                if (!n.isRead) markRead.mutate(n.id);
              }}
            >
              <span
                className={`mt-2 h-2 w-2 rounded-full shrink-0 ${
                  n.isRead ? "bg-transparent" : "bg-primary"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-snug ${
                    n.isRead ? "font-normal" : "font-semibold"
                  }`}
                >
                  {n.title}
                </p>
                {n.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    {n.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {formatTime(n.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
