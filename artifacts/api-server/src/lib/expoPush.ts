const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

export async function sendExpoPushNotification(
  messages: ExpoPushMessage[],
): Promise<void> {
  const valid = messages.filter(
    (m) => m.to && (m.to.startsWith("ExponentPushToken[") || m.to.startsWith("ExpoPushToken[")),
  );
  if (valid.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(valid.length === 1 ? valid[0] : valid),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      console.error(`[ExpoPush] HTTP ${res.status} from Expo Push API: ${text}`);
      return;
    }
    const json = (await res.json()) as { data?: { status: string; message?: string }[] };
    const results = Array.isArray(json?.data) ? json.data : [json?.data];
    for (const r of results) {
      if (r && r.status === "error") {
        console.error("[ExpoPush] Expo reported error for message:", r.message);
      }
    }
  } catch (err) {
    console.error("[ExpoPush] Failed to send notification:", err);
  }
}
