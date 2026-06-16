import crypto from "crypto";
import https from "https";
import { logger as rzpLogger } from "./logger";

function getConfig() {
  const keyId = process.env["RAZORPAY_KEY_ID"] ?? "";
  const keySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
  const isConfigured = !!(keyId && keySecret);
  return { keyId, keySecret, webhookSecret, isConfigured };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

async function apiPost(endpoint: string, body: object, keyId: string, keySecret: string): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.razorpay.com",
      path: `/v1${endpoint}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function isRazorpayOrderResponse(v: unknown): v is RazorpayOrder {
  return typeof v === "object" && v !== null && "id" in v && "amount" in v && "status" in v;
}

export async function createOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret, isConfigured } = getConfig();

  if (!isConfigured) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  if (!Number.isFinite(params.amountPaise) || params.amountPaise < 100) {
    throw new Error(`Razorpay requires a minimum amount of ₹1. Got ${params.amountPaise} paise.`);
  }

  const payload: Record<string, unknown> = {
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receipt,
  };
  if (params.notes) payload["notes"] = params.notes;

  rzpLogger.info({ receipt: params.receipt, amountPaise: params.amountPaise }, "[razorpay] Creating order");

  const raw = await apiPost("/orders", payload, keyId, keySecret);

  if (!isRazorpayOrderResponse(raw)) {
    rzpLogger.error({ raw }, "[razorpay] Create order failed — unexpected response");
    throw new Error("Razorpay order creation failed");
  }

  rzpLogger.info({ orderId: raw.id, status: raw.status }, "[razorpay] Order created");
  return raw;
}

/**
 * Verify the HMAC-SHA256 signature Razorpay sends in the X-Razorpay-Signature
 * header for every webhook POST. Uses timing-safe comparison to prevent
 * byte-by-byte leakage of the expected value.
 */
export function verifyWebhookSignature(rawBody: string | Buffer, receivedSignature: string): boolean {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature ?? "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify the payment signature the Razorpay checkout sends to the client on
 * successful payment. The client passes it to our /payments/razorpay/verify
 * endpoint so the server can confirm the payment before activating the booking.
 */
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): boolean {
  const { keySecret } = getConfig();
  if (!keySecret) return false;

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(razorpaySignature ?? "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isRazorpayConfigured(): boolean {
  return getConfig().isConfigured;
}

export function getKeyId(): string {
  return getConfig().keyId;
}
