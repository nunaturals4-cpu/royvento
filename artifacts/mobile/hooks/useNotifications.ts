import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export interface NotificationItem {
  id: number;
  isRead: boolean;
}

/**
 * Single source of truth for the in-app notifications poll on mobile.
 *
 * Multiple UIs (the persistent bottom-nav badge, the Profile tab badge, etc.)
 * call this hook; React Query deduplicates the request because they all share
 * the `["notifications"]` query key. Without this hook the bottom-nav and
 * profile screens each declared their own `useQuery` with `refetchInterval:
 * 90_000`, doubling the network traffic for any logged-in user sitting on the
 * Profile tab.
 */
export function useNotifications() {
  const { user } = useAuth();
  return useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => customFetch<NotificationItem[]>("/api/notifications"),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
}

export function useUnreadNotificationCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.isRead).length;
}
