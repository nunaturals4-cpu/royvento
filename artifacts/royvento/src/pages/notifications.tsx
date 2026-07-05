import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { apiGet, apiPatch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  title: string;
  message: string;
  /** Deep-link target opened when the notification is tapped. */
  url?: string;
  type?: string;
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

export function Notifications() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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
    mutationFn: () => apiPatch("/api/notifications/read-all", {}),
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

  // Mark read and, when the notification carries a deep link, open the exact
  // event/offer/venue page so the user can act on it immediately.
  const openNotification = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.url && n.url !== "/") setLocation(n.url);
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-14 max-w-2xl">
      <SEO title="Notifications | Royvento" canonical="/notifications" noindex />
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
              onClick={() => openNotification(n)}
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
