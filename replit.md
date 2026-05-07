# Royvento

A full-stack event management marketplace that connects event hosts with vendors, facilitating event management, bookings, and promotions.

## Run & Operate

```bash
# Start development servers for frontend and backend
pnpm dev

# Build all services
pnpm build

# Run type checks across the workspace
pnpm typecheck

# Regenerate API client code from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push latest DB schema changes
pnpm --filter @workspace/db run push
```

**Environment Variables:**
- `SESSION_SECRET`: JWT signing key for authentication.
- `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV`: For PhonePe payment gateway integration.
- `APP_URL`: Public URL of the application, used for PhonePe callbacks.
- `PAYMENT_BYPASS`: Set to `true` for local development to bypass actual payments.
- `GOOGLE_PLACES_API_KEY`: API key for Google Places services.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Keys for Web Push Notifications.

## Stack

- **Frontend**: React + Vite
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **API**: OpenAPI 3, Zod (validation), React Query (hooks)
- **Auth**: JWT (HS256) via cookie (`royvento_token`) and Authorization Bearer header.
- **Styling**: Custom CSS utilities in `index.css` (e.g., `glass-card`, `lift-3d`).
- **Fonts**: Inter, Playfair Display.
- **Payments**: PhonePe PG REST API.

## Where things live

- `/artifacts/royvento`: Frontend application.
- `/artifacts/api-server`: Backend application.
- `/artifacts/api-server/src/routes/`: API endpoint definitions (auth, users, vendors, events, bookings, reviews, availability, admin).
- `/artifacts/api-server/src/lib/auth.ts`: Authentication logic (JWT, middleware, password hashing).
- `/artifacts/api-server/src/lib/db`: Drizzle ORM setup and migrations.
- `/lib/api-spec/openapi.yaml`: OpenAPI specification (source of truth for API contracts).
- `/artifacts/royvento/src/index.css`: Core UI styling and design tokens.
- `/artifacts/royvento/src/pages/`: Frontend pages (home, explore, dashboards, auth).
- `/artifacts/mobile`: Mobile application (Expo).
- `/scripts/src/seed.ts`: Database seeding script.

## Architecture decisions

- **API Contract First**: OpenAPI 3 is the source of truth for API, generating Zod schemas and React Query hooks to ensure type safety and consistency between frontend and backend.
- **Role-Based Access Control**: `user`, `vendor` (Partner), and `admin` roles dictate access to features and data, enforced via authentication middleware.
- **Themed UI with Custom Utilities**: A premium 3D dark theme is implemented using CSS utilities rather than a full UI library, allowing for unique visual effects like `glass-card` and `lift-3d`.
- **Hybrid Notification System**: In-app notifications are stored in the DB, while web push notifications leverage a service worker for real-time delivery, enhancing user engagement.
- **Google Places Integration**: For pub imports, Google Places API is used to resolve URLs, fetch details, and store images, streamlining venue onboarding for admins.

## Product

- **Event Hosting & Management**: Vendors (Partners) can create profiles, manage events, bookings, availability, and media.
- **Event Discovery & Booking**: Users can explore, book events, leave reviews, and claim coupons.
- **Subscription & Premium Features**: Users can subscribe for benefits like coupons. Vendors can access premium features like ad requests and CRM tools.
- **Admin Control**: Admins manage users, approve partners and events, grant coupons, and view analytics.
- **Booking Approval Workflow**: Bookings require approval, with notifications for status changes and rejection reasons.
- **Ticket Scanning**: Vendors/Managers can scan tickets for event check-ins.
- **Vendor Team Management**: Vendors can invite and manage managers to help with event operations.
- **Settlement System**: Vendors can request settlements for their earnings, managed and approved by admins.
- **Mobile App Parity**: Comprehensive mobile application with feature parity including pubs tab, blogs, AI chat assistant, and enhanced profile features.
- **Google Pub Import**: Admins can import pub details directly from Google Business Profiles.
- **Web Push Notifications**: Users can opt-in for web push notifications for important updates.
- **Contact Form**: Public contact form for general inquiries.
- **Points History**: Users can track their earned and spent points.

## User preferences

- _Populate as you build_

## Gotchas

- **Payment Bypass**: `PAYMENT_BYPASS=true` is for development only; ensure it's removed in production to enable actual payments.
- **PhonePe Secrets**: PhonePe integration requires specific environment variables (`PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, etc.) to be set; payments will fail otherwise.
- **API Client Regeneration**: After any changes to `openapi.yaml`, always run `pnpm --filter @workspace/api-spec run codegen` to update frontend API hooks and Zod schemas.
- **DB Schema Changes**: When modifying the database schema, generate a new migration (`pnpm --filter @workspace/db run generate`) and then apply it (`pnpm --filter @workspace/db run migrate` or `pnpm --filter @workspace/db run push`).
- **Notification Emails**: Email notifications are currently logged to console; a real email provider (e.g., SendGrid) needs to be configured in `artifacts/api-server/src/lib/notifications.ts` for actual delivery.
- **Per-gender Free Entry**: `freeEntryRules.genders` now gates pricing per tier. On a configured day, only tiers whose gender is in `genders` are zero-priced; other tiers still charge normally. Server (`bookings.ts` create + `calcActualAmountDue`), web (`event-detail.tsx`, `bookings.tsx`), and mobile (`event/[id].tsx`, `(tabs)/bookings.tsx`) must stay in sync. Table-mode is treated as free only when all three genders are listed. Admin commission still accrues on all guests.
- **Password Hash Audit**: On boot the API server runs `auditPasswordHashes()` and logs an `error` if any `users.password_hash` is NULL or doesn't match the bcrypt prefix `$2a/$2b/$2y`. If it fires, identify the rows (`SELECT id, email FROM users WHERE password_hash IS NULL OR password_hash !~ '^\$2[aby]\$'`), force a password reset for real accounts, or delete dummies — never leave plaintext or empty hashes in `users`. `bookings.event_id` is `ON DELETE RESTRICT`, so events with bookings cannot be hard-deleted; cancel/reassign first.

## Pointers

- **OpenAPI Specification**: Refer to `lib/api-spec/openapi.yaml` for all API endpoints, request/response schemas, and authentication methods.
- **Drizzle ORM**: Consult the Drizzle documentation for schema definitions and database interactions.
- **React Query**: For data fetching and state management on the frontend, refer to React Query's official documentation.
- **PhonePe API Docs**: For payment gateway details, refer to the PhonePe developer portal: [https://developer.phonepe.com](https://developer.phonepe.com).
- **Web Push API**: For understanding web push notifications, refer to MDN Web Docs on Push API.
- **Google Places API**: For details on resolving place URLs and fetching details, consult the Google Places API documentation.