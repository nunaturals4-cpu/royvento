import { apiGet, apiPost } from "./api";

// Convert a base64url VAPID public key into the Uint8Array the Push API wants.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Best-effort: ensure the browser is subscribed to web push and the
 * subscription is registered with the API for the logged-in user. Returns true
 * when a subscription is active, false otherwise. Never throws — push is a
 * progressive enhancement and must not break the calling flow.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  try {
    if (!pushSupported()) return false;

    // Ask permission if we haven't been told "no" already.
    if (Notification.permission === "denied") return false;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return false;
    }

    const reg = await navigator.serviceWorker.ready;

    // Reuse an existing subscription; otherwise create one from the server key.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await apiGet<{ publicKey: string }>("/api/push/vapid-public-key");
      if (!publicKey) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await apiPost("/api/push/subscribe", { subscription: sub.toJSON() });
    return true;
  } catch {
    return false;
  }
}
