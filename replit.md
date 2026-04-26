# Royvento

A full-stack event management marketplace for hosts and vendors.

## Stack
- **Frontend**: React + Vite (artifact: `royvento`, served at `/`)
- **Backend**: Express + TypeScript (artifact: `api-server`, port 8080, mounted at `/api`)
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API contract**: OpenAPI 3 (`lib/api-spec/openapi.yaml`) → Zod (`lib/api-zod`) + React Query hooks (`lib/api-client-react`)
- **Auth**: JWT (HS256, 30-day) via cookie `royvento_token` + Authorization Bearer header. SESSION_SECRET as signing key.

## Roles
- `user`: book events, leave reviews
- `vendor`: create vendor profile (auto-flips role from user → vendor on creation), manage events, bookings, availability
- `admin`: approve vendors, manage users, view analytics

## Key directories
- `artifacts/api-server/src/routes/` — auth, users, vendors, events, bookings, reviews, availability, admin
- `artifacts/api-server/src/lib/auth.ts` — JWT, requireAuth middleware, password hashing
- `artifacts/api-server/src/lib/aggregates.ts` — vendor/event rating aggregation
- `artifacts/api-server/src/lib/notifications.ts` — booking confirmation + status emails. Currently logs formatted emails to the server console (no real provider configured). To enable real delivery, replace the `deliver()` function body with a SendGrid / SMTP / Resend call.
- `artifacts/royvento/src/pages/` — home, explore, vendors, event-detail, vendor-detail, login, register, contact, vendor-dashboard, bookings, admin, profile, become-vendor

## Recent additions
- Public Contact form (name/email/phone/subject/message) → POST /api/contact. Admin reviews under Admin → Messages with Resolved/Cancel buttons (both DELETE).
- Booking form has an event-type dropdown (wedding, birthday, casual, surprise, corporate, cultural, other) saved on the booking row.
- Categories dropdown in the navbar deep-links into /explore?category=...
- /dashboard/profile lets every logged-in user edit name/phone/about/profile picture.
- User → Vendor request flow: /dashboard/become-vendor (POST /api/vendor-requests). Admin approves/rejects in Admin → Vendor requests; approval flips usersTable.role to "vendor", letting the user create their vendor profile from the existing /dashboard/vendor page.
- Frontend uses thin `apiGet/apiPost/apiPatch/apiDelete` helpers (`src/lib/api.ts`) that read the JWT from localStorage for the new endpoints; existing endpoints continue to use the orval-generated React Query client.
- `scripts/src/seed.ts` — seed data

## Demo accounts (after running `pnpm --filter @workspace/scripts run seed`)
- `admin@royvento.com` / `admin123`
- `alice@example.com` / `password123`
- `bob@example.com` / `password123`
- `lumiere@royvento.com` / `vendor123` (approved vendor)
- `atelier@royvento.com` / `vendor123` (approved vendor)
- `harvest@royvento.com` / `vendor123` (approved vendor)
- `newvendor@royvento.com` / `vendor123` (pending vendor)

## Common tasks
- Regenerate API client: `pnpm --filter @workspace/api-spec run codegen`
- Push DB schema: `pnpm --filter @workspace/db run push`
- Seed database: `pnpm --filter @workspace/scripts run seed`

## Design tokens
Deep plum primary on warm parchment background. Serif (display) + sans (body). See `artifacts/royvento/src/index.css`.
