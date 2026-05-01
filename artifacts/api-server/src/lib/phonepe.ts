import crypto from "crypto";
import https from "https";

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

  const payload = {
    merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: params.merchantUserId,
    amount: params.amountPaise,
    redirectUrl: params.redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl: params.callbackUrl,
    ...(params.mobileNumber ? { mobileNumber: params.mobileNumber } : {}),
    paymentInstrument: { type: "PAY_PAGE" },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const endpoint = "/pg/v1/pay";
  const checksum = buildChecksum(base64Payload, endpoint, saltKey, saltIndex);

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
    console.error("[phonepe] Initiate payment failed:", JSON.stringify(raw));
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
  return expected === receivedChecksum;
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
  if (process.env["APP_URL"]) return process.env["APP_URL"];
  const productionDomains = process.env["REPLIT_DOMAINS"];
  if (productionDomains) {
    const domain = productionDomains.split(",")[0]?.trim();
    if (domain) return `https://${domain}`;
  }
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) return `https://${devDomain}`;
  return "http://localhost:3000";
}
