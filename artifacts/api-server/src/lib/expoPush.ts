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
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(valid.length === 1 ? valid[0] : valid),
    });
  } catch (err) {
    console.error("[ExpoPush] Failed to send notification:", err);
  }
}
