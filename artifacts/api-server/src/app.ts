import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { SESSION_SECRET } from "./lib/auth";

if (
  process.env["NODE_ENV"] === "production" &&
  process.env["PAYMENT_BYPASS"] === "true"
) {
  throw new Error(
    "PAYMENT_BYPASS=true is not allowed in production. Remove the variable before starting the server.",
  );
}

// ─── CORS allow-list ──────────────────────────────────────────────────────────
//
// We explicitly allow the production hosts, the project's Replit dev domain(s),
// and the Expo dev domain. Same-origin / non-browser requests (no Origin
// header — e.g. native mobile, server-to-server, curl) are also allowed so
// that mobile clients sending Bearer tokens keep working. Other origins are
// rejected to avoid CSRF/credential leak via `credentials: include`.

function buildAllowedOrigins(): Set<string> {
  const allowed = new Set<string>([
    "https://royvento.com",
    "https://www.royvento.com",
  ]);
  const replitDomains = process.env["REPLIT_DOMAINS"];
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const trimmed = d.trim();
      if (trimmed) allowed.add(`https://${trimmed}`);
    }
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) allowed.add(`https://${dev}`);
  const expo = process.env["REPLIT_EXPO_DEV_DOMAIN"];
  if (expo) allowed.add(`https://${expo}`);
  return allowed;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser(SESSION_SECRET));

// ─── Global API rate limiter ─────────────────────────────────────────────────
//
// 120 req/min/IP by default. Per-route tighter limiters live in their routers
// (auth login/register/forgot, contact, storage uploads).

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again shortly." },
});

app.use("/api", globalApiLimiter, router);

export default app;
