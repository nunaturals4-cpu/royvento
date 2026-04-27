# Royvento

A full-stack event management marketplace for hosts and vendors.

## Stack
- **Frontend**: React + Vite (artifact: `royvento`, served at `/`)
- **Backend**: Express + TypeScript (artifact: `api-server`, port 8080, mounted at `/api`)
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API contract**: OpenAPI 3 (`lib/api-spec/openapi.yaml`) → Zod (`lib/api-zod`) + React Query hooks (`lib/api-client-react`)
- **Auth**: JWT (HS256, 30-day) via cookie `royvento_token` + Authorization Bearer header. SESSION_SECRET as signing key.

## Roles
- `user`: book events, leave reviews, claim coupons, subscribe (₹200/mo)
- `vendor` (UI label: **Partner**): create profile, manage events/pubs, bookings, availability, media tied to event types/budget, blocked dates (Google Calendar sync stub), ad requests, leads/CRM (premium ₹999/mo)
- `admin`: approve partners, manage users, view analytics, grant coupons, approve ads, delete events/pubs

## UI overhaul (Apr 2026)
- Premium 3D dark theme (red/white/black) — `index.css` utilities: `glass-card`, `glass-card-strong`, `lift-3d`, `red-glow`, `red-ring`, `accent-underline`, `text-gradient-red`, `hero-grid`, `stat-number`, `perspective-card`. Inter + Playfair Display fonts.
- All prices INR via `formatINR` (artifacts/royvento/src/lib/api.ts). Budget filter ranges defined in `BUDGET_RANGES` (₹5k–₹100cr).
- Pubs are events with `type='pub'` rendered on `/pubs`. Popular events surface on `/` via `/api/events/popular`.
- Coupon = login-gated 10% off. Subscribing auto-grants a coupon. Admin can grant per-user coupons.
- Vendor → "Partner" rename in UI/new endpoints; DB table stays `vendors`.
- Auth additions: phone field on signup, Google OAuth STUB at `/api/auth/google/*`.
- Demo accounts: `admin@admin.com` / `admin123@`, `showcase@royvento.in` / `partner123`.

## New backend routes (April 2026)
`/api/subscriptions/me|POST`, `/api/coupons/me|validate`, `/api/partner/media`, `/api/partner/blocked-dates` (+ google-sync stub), `/api/partner/ads`, `/api/partner/leads/me`, `/api/partner/profile`, `/api/admin/{events,subscriptions,coupons,ads}`, `/api/events/popular`, `/api/events?type=pub&category=&state=&city=&country=&minPrice=&maxPrice=`. Routes use `apiGet/apiPost/apiPatch/apiDelete` from `lib/api.ts` (no orval regen for new endpoints).

## Booking approval system & notifications (Task #3, Apr 2026)
- `bookingsTable` gets `rejectionReason text` (nullable) column
- `notificationsTable` added: id, userId, title, message, isRead, createdAt
- PATCH `/api/bookings/:id/status` and `/api/admin/bookings/:id/status` now:
  - Require `rejectionReason` when cancelling (400 if missing)
  - Create an in-app notification for the booking's user on status change
- GET `/api/notifications` — returns user's notifications newest-first (auth required)
- PATCH `/api/notifications/:id/read` — marks a notification as read (auth required)
- **Navbar** now shows a Bell icon (logged-in only) with unread count badge; clicking opens a dropdown with notification list and mark-all-read; polls every 30s
- **admin.tsx** has a new "Booking Requests" tab listing pending bookings with Approve / Reject (+ required reason) actions
- **vendor-dashboard.tsx** BookingsManager split into Pending requests (Approve/Reject with reason) vs. All bookings sections
- **bookings.tsx** displays rejection reason in a red callout on cancelled bookings

## Partner ticket scanner (Task #4, Apr 2026)
- `bookingsTable` gains `checkedIn boolean default false` + `checkedInAt timestamp` nullable columns (db:push applied)
- POST `/api/partner/scan-ticket` — vendor-only endpoint:
  - Accepts `{ code: "RV-000042" }` (also accepts RV000042 or bare number)
  - Validates ownership (must belong to calling partner's vendor), status (must be "confirmed"), and checkedIn state
  - On success: sets checkedIn=true + checkedInAt, returns full booking details
  - Structured error codes: INVALID_CODE, NOT_FOUND, WRONG_VENDOR, NOT_CONFIRMED, CANCELLED, ALREADY_CHECKED_IN, SERVER_ERROR
- `/dashboard/vendor/scanner` route — vendor-only TicketScanner page with:
  - Monospace code input (accepts RV-XXXXXX format)
  - "Validate" button with loading state
  - Green success card (guest name, ticket breakdown W/M/C counts, event name, check-in time)
  - Red "Already used" card (shows when checked in, with original booking)
  - Red "Invalid ticket" card with friendly message for each error case
  - "Scan another ticket" reset button
- "Ticket scanner" link button added to vendor dashboard tab bar (links out to scanner page)
- Route added in App.tsx with RequireAuth role="vendor" guard

## Event approval workflow (Apr 2026)
- `eventsTable` gains `approvalStatus varchar(20) default 'pending'` + `rejectionReason text` columns (db:push applied)
- All public listing endpoints (`GET /events`, `GET /events/featured`, `GET /events/popular`) filter by `approvalStatus = 'approved'`
- `POST /events` always sets `approvalStatus: 'pending'` on creation
- Admin endpoints: `GET /admin/events` returns `approvalStatus` + `partnerName`; new `GET /admin/events/pending`; `PATCH /admin/events/:id` handles approval/rejection with optional `rejectionReason`; `DELETE /admin/events/:id`
- Admin panel has new "Event Approvals" tab with pending event cards (gallery thumbnails) and Approve / Reject (requires reason) buttons
- Partner dashboard event cards show coloured status badges: Live (green), Pending review (amber), Rejected (red) plus a rejection reason callout strip
- Event create form "Publish" button renamed to "Submit for review"; success toast updated accordingly
- Admin all-events table now shows Status column alongside Popular toggle

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
