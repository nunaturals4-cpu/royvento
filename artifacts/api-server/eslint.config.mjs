// Server-only ESLint flat config. Bans `console.*` so that all logs go
// through `req.log` (in handlers) or the singleton `logger` (elsewhere).
// PII/secrets must never end up in raw stdout — pino is configured with
// redaction in `src/lib/logger.ts`.

export default [
  {
    files: ["src/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-console": "error",
    },
  },
];
