import crypto from "crypto";
import https from "https";
import { logger as phonepeLogger } from "./logger";

function getConfig() {
  const merchantId = process.env["PHONEPE_MERCHANT_ID"] ?? "";
  const saltKey = process.env["PHONEPE_SALT_KEY"] ?? "";
  const saltIndex = process.env["PHONEPE_SALT_INDEX"] ?? "1";
  const env = (process.env["PHONEPE_ENV"] ?? "UAT").toUpperCase();
  const isConfigured = !!(merchantId && saltKey);
  const baseUrl =
    env === "PROD"
      ? "https://api.phonepe.com/apis/hermes"
      : "https://api-preprod.phonepe.com/apis/pg-sandbox";
  return { merchantId, saltKey, saltIndex, baseUrl, isConfigured };
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function buildChecksum(base64Payload: string, endpoint: string, saltKey: string, saltIndex: string): string {
  return sha256(base64Payload + endpoint + saltKey) + "###" + saltIndex;
}

function buildStatusChecksum(path: string, saltKey: string, saltIndex: string): string {
  return sha256(path + saltKey) + "###" + saltIndex;
}

interface PhonePeRedirectInfo {
  url: string;
  method: string;
}

interface PhonePeInstrumentResponse {
  type: string;
  redirectInfo?: PhonePeRedirectInfo;
}

interface PhonePeInitiateData {
  merchantId: string;
  merchantTransactionId: string;
  instrumentResponse?: PhonePeInstrumentResponse;
}

interface PhonePeInitiateResponse {
  success: boolean;
  code: string;
  message: string;
  data?: PhonePeInitiateData;
}

interface PhonePeStatusData {
  merchantId: string;
  merchantTransactionId: string;
  transactionId: string;
  amount: number;
  state: string;
  responseCode: string;
}

interface PhonePeStatusResponse {
  success: boolean;
  code: string;
  message: string;
  data?: PhonePeStatusData;
}

async function httpPost(url: string, body: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function httpGet(url: string, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function isPhonePeInitiateResponse(v: unknown): v is PhonePeInitiateResponse {
  return typeof v === "object" && v !== null && "success" in v;
}

function isPhonePeStatusResponse(v: unknown): v is PhonePeStatusResponse {
  return typeof v === "object" && v !== null && "success" in v && "code" in v;
}

export interface InitiatePaymentResult {
  redirectUrl: string;
  merchantTransactionId: string;
}

export async function initiatePayment(params: {
  merchantTransactionId: string;
  merchantUserId: string;
  amountPaise: number;
  redirectUrl: string;
  callbackUrl: string;
  mobileNumber?: string;
}): Promise<InitiatePaymentResult> {
  const { merchantId, saltKey, saltIndex, baseUrl, isConfigured } = getConfig();

  if (!isConfigured) {
    throw new Error("PhonePe is not configured. Please set PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, and PHONEPE_SALT_INDEX in environment secrets.");
  }

  // PhonePe rejects amounts below 100 paise (₹1) with a generic
  // "Problem processing request" error on its payment page. Catch this
  // early so users see a useful error instead of getting stuck on PhonePe.
  if (!Number.isFinite(params.amountPaise) || params.amountPaise < 100) {
    throw new Error(`PhonePe requires a minimum amount of ₹1. Got ${params.amountPaise} paise.`);
  }

  // PhonePe payment links must use HTTPS — http URLs (or relative ones)
  // are silently rejected by the gateway and surface as "Problem processing
  // request" on PhonePe's UI. Validate before sending.
  if (!/^https:\/\//.test(params.redirectUrl)) {
    throw new Error(`PhonePe redirectUrl must be HTTPS. Got: ${params.redirectUrl}`);
  }
  if (!/^https:\/\//.test(params.callbackUrl)) {
    throw new Error(`PhonePe callbackUrl must be HTTPS. Got: ${params.callbackUrl}`);
  }

  // Strip non-digits from mobileNumber so PhonePe receives a clean 10-digit
  // string. Numbers with +91 prefix or spaces ("+91 98765 43210") cause the
  // payment page to fail with "Problem processing request".
  let cleanMobile: string | undefined;
  if (params.mobileNumber) {
    const digits = params.mobileNumber.replace(/\D/g, "").slice(-10);
    if (/^\d{10}$/.test(digits)) {
      cleanMobile = digits;
    }
  }

  const payload = {
    merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: params.merchantUserId,
    amount: params.amountPaise,
    redirectUrl: params.redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl: params.callbackUrl,
    ...(cleanMobile ? { mobileNumber: cleanMobile } : {}),
    paymentInstrument: { type: "PAY_PAGE" },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const endpoint = "/pg/v1/pay";
  const checksum = buildChecksum(base64Payload, endpoint, saltKey, saltIndex);

  phonepeLogger.info(
    {
      merchantId,
      merchantTransactionId: params.merchantTransactionId,
      amountPaise: params.amountPaise,
      hasMobile: !!cleanMobile,
      baseUrl,
    },
    "[phonepe] Initiating payment",
  );

  const raw = await httpPost(
    `${baseUrl}${endpoint}`,
    JSON.stringify({ request: base64Payload }),
    {
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
    },
  );

  if (!isPhonePeInitiateResponse(raw) || !raw.success) {
    const msg = isPhonePeInitiateResponse(raw) ? raw.message : "Unknown PhonePe error";
    phonepeLogger.error({ raw, payloadSummary: { amountPaise: params.amountPaise, hasMobile: !!cleanMobile } }, "[phonepe] Initiate payment failed");
    throw new Error(msg ?? "PhonePe payment initiation failed");
  }

  const redirectUrl = raw.data?.instrumentResponse?.redirectInfo?.url;
  if (!redirectUrl) {
    throw new Error("PhonePe did not return a redirect URL");
  }

  return { redirectUrl, merchantTransactionId: params.merchantTransactionId };
}

export async function checkPaymentStatus(merchantTransactionId: string): Promise<{
  success: boolean;
  code: string;
  transactionId: string;
}> {
  const { merchantId, saltKey, saltIndex, baseUrl, isConfigured } = getConfig();

  if (!isConfigured) {
    throw new Error("PhonePe is not configured");
  }

  const path = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
  const checksum = buildStatusChecksum(path, saltKey, saltIndex);

  const raw = await httpGet(
    `${baseUrl}${path}`,
    {
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
      "X-MERCHANT-ID": merchantId,
    },
  );

  if (!isPhonePeStatusResponse(raw)) {
    throw new Error("Invalid PhonePe status response");
  }

  return {
    success: raw.success === true && raw.code === "PAYMENT_SUCCESS",
    code: raw.code ?? "UNKNOWN",
    transactionId: raw.data?.transactionId ?? "",
  };
}

export function verifyWebhookSignature(base64Response: string, receivedChecksum: string): boolean {
  const { saltKey, saltIndex } = getConfig();
  const expected = sha256(base64Response + saltKey) + "###" + saltIndex;
  // Constant-time comparison to avoid leaking the expected checksum byte-by-byte
  // via response-timing. Same boolean result as `===`, just timing-safe. The
  // length pre-check is required because timingSafeEqual throws on length
  // mismatch; differing lengths are unequal anyway.
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedChecksum ?? "");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface PhonePeWebhookPayload {
  code?: string;
  data?: {
    merchantTransactionId?: string;
    transactionId?: string;
  };
  merchantTransactionId?: string;
}

export function decodeWebhookResponse(base64Response: string): PhonePeWebhookPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(base64Response, "base64").toString("utf-8"));
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as PhonePeWebhookPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function isPhonePeConfigured(): boolean {
  return getConfig().isConfigured;
}

export function getAppUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/+$/, "");

  // Production = royvento.com — PhonePe redirect/callback URLs must hit the
  // canonical domain, not the platform host.
  if (process.env["NODE_ENV"] === "production") return "https://royvento.com";

  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
  if (railwayDomain) return `https://${railwayDomain}`;

  const productionDomains = process.env["REPLIT_DOMAINS"];
  if (productionDomains) {
    const domain = productionDomains.split(",")[0]?.trim();
    if (domain) return `https://${domain}`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;

  return "http://localhost:3000";
}
