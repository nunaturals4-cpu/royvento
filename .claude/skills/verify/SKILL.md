---
name: verify (royvento local recipe)
description: How to actually run this repo locally to observe changed behavior, not just typecheck/build it.
---

# Royvento local verify recipe

This is a pnpm monorepo. The interesting runtime surface for most changes is
`artifacts/mobile` (Expo/React Native app) talking to `artifacts/api-server`
(Express) backed by local Postgres. There is no emulator/simulator/browser
automation tool available in this environment — you cannot pixel-drive the
app. The strongest available substitute is: (1) force a full bundle build so
every route file is statically resolved, and (2) drive the real API the
screens call, and diff the JSON against what the changed client code reads.

## 1. Confirm local Postgres is up

```bash
pg_isready -h 127.0.0.1 -p 5432
```

Credentials: `royvento` / `royvento_pass` @ `127.0.0.1:5432`, db `royvento`.

## 2. Start the API server

```bash
cd /d/royvento
(nohup pnpm --filter @workspace/api-server dev:local > /tmp/api-server-verify.log 2>&1 &)
sleep 15 && tail -40 /tmp/api-server-verify.log
```

Listens on port 5000. `dev:local` runs `node build.mjs` (esbuild, NOT tsc) then
starts the server — so a clean boot does **not** mean `tsc --noEmit` is clean
for the whole package (it usually isn't; there's a pre-existing non-clean
baseline of ~20 errors in unrelated files like `mailTransport.ts`,
`seedDemoPubs.ts`, etc. — check `grep` for your specific touched file before
assuming an error is yours).

To get admin access, restart with explicit creds (each boot re-provisions the
admin row from these env vars):

```bash
taskkill //F //PID <old-pid>   # find via: netstat -ano | grep ":5000" | grep LISTENING
(ADMIN_EMAIL="verify-admin@royvento.local" ADMIN_PASSWORD="VerifyTest#2026" \
  nohup pnpm --filter @workspace/api-server dev:local > /tmp/api-server-verify.log 2>&1 &)
sleep 20
curl -s -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"verify-admin@royvento.local","password":"VerifyTest#2026"}'
```

Restarting **without** the env override afterwards restores the original
admin (it re-rotates from whatever `.env.local` specifies) — always do this
before you finish, don't leave your test admin as the live one.

New test users need email verification before login — the register endpoint
blocks it. Force it locally:

```bash
PGPASSWORD=royvento_pass psql -h 127.0.0.1 -U royvento -d royvento \
  -c "UPDATE users SET email_verified = true WHERE email = '...';"
```

## 3. Drive the real endpoints

Use `curl` with `Authorization: Bearer <token>` from the login response — auth
is JWT bearer, not just cookies. Compare the actual JSON shape byte-for-byte
against what the changed mobile/web code reads. This is the single most
valuable check in this repo: several real fields (`vendorCategory`,
`cuisines`, `facilities`, `faqs`, `kind`, `rejectionReason`, coupon
`discountType`/`discountValue`/`applicableTo`) exist on API responses but are
**not** in `lib/api-spec/openapi.yaml`, so the generated TS client doesn't
type them — `tsc` will happily pass even if you get the field name wrong.
Only a live curl catches that class of bug.

## 4. Force a full mobile bundle build

```bash
cd /d/royvento/artifacts/mobile
timeout 300 npx expo export -p web --output-dir /tmp/expo-web-verify
```

Expo Router needs to statically resolve every file under `app/` to build the
route manifest, so this touches every screen in the app even though it's a
"web" export — a real signal for the RN screens too. Exit 0 + module count is
the pass signal. Clean up `/tmp/expo-web-verify` after.

## 5. Clean up

- Kill the api-server instance you started (`taskkill //F //PID <pid>`).
- Delete throwaway coupons/subscriptions/venues you inserted for testing.
- Restart the server once more with no env override so the admin account is
  back to normal, then stop it.
