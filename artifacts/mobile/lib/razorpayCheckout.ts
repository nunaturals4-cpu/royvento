// Razorpay checkout for the native app — no native SDK.
//
// The API creates the Razorpay order server-side and returns its id; we open a
// server-hosted checkout page (GET /api/pay/checkout) in an in-app browser,
// which runs Razorpay Checkout and deep-links back to `royvento://payment-result`
// with `?payment=success|failed|cancelled`. The Razorpay webhook is the
// authoritative confirmation of the booking/subscription/party on the server.

import * as WebBrowser from "expo-web-browser";
import { getBaseUrl } from "@workspace/api-client-react";

export type PayResult = "success" | "failed" | "cancelled";

const SCHEME = "royvento";

export interface RazorpayCheckoutParams {
  orderId: string;
  amountPaise: number;
  name?: string;
  description?: string;
  prefillName?: string | null;
  prefillEmail?: string | null;
  prefillContact?: string | null;
  /** Context id echoed back on return (e.g. bookingId). */
  rid?: string | number | null;
}

export async function openRazorpayCheckout(params: RazorpayCheckoutParams): Promise<PayResult> {
  const base = getBaseUrl() ?? "";
  const redirect = `${SCHEME}://payment-result`;

  const qs = new URLSearchParams();
  qs.set("order_id", params.orderId);
  qs.set("amount", String(Math.max(0, Math.round(params.amountPaise || 0))));
  if (params.name) qs.set("name", params.name);
  if (params.description) qs.set("desc", params.description);
  if (params.prefillName) qs.set("pname", String(params.prefillName));
  if (params.prefillEmail) qs.set("email", String(params.prefillEmail));
  if (params.prefillContact) qs.set("contact", String(params.prefillContact));
  if (params.rid != null && params.rid !== "") qs.set("rid", String(params.rid));
  qs.set("redirect", redirect);

  const url = `${base}/api/pay/checkout?${qs.toString()}`;

  const result = await WebBrowser.openAuthSessionAsync(url, `${SCHEME}://`);
  if (result.type === "success" && result.url) {
    try {
      const parsed = new URL(result.url);
      const payment = parsed.searchParams.get("payment");
      if (payment === "success") return "success";
      if (payment === "cancelled") return "cancelled";
      return "failed";
    } catch {
      return "failed";
    }
  }
  // User closed the browser chrome without completing.
  return "cancelled";
}
