# Solo Connector API & QA Reference

Redesigned Solo Connector workflow: phone-first onboarding (Firebase), no gender
restriction on joining, real member-gender counts, member reporting + admin
moderation, and automatic inactive-group cleanup. Shipped on the web app
(`artifacts/royvento`) and the Expo mobile app (`artifacts/mobile`) over a shared
API (`artifacts/api-server/src/routes/soloConnect.ts`).

## Environment variables

| Var | Where | Purpose |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | api-server | Admin SDK service account used to verify phone ID tokens. Absent ⇒ **dev-stub mode** (non-prod only). `\n` in the private key is unescaped automatically. |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` | royvento (web) | Firebase JS SDK config for `signInWithPhoneNumber`. Absent ⇒ dev-stub OTP. |
| `SOLO_GROUP_INACTIVITY_DAYS` (default 15) | api-server | Days of inactivity before a group is auto-deleted. |
| `SOLO_GROUP_WARN_DAYS_BEFORE` (default 3) | api-server | How many days before deletion members are warned. |
| `SOLO_GROUP_RESTORE_GRACE_DAYS` (default 7) | api-server | Admin restore window after soft-delete, before hard purge. |

Mobile real-Firebase phone auth requires `@react-native-firebase/app` + `/auth`
and a native dev build; the current mobile screen uses the dev-stub token path.

## Firebase token contract

The client performs Firebase Phone Auth and posts the resulting **ID token**;
the server verifies it and reads the phone number **from the verified token**,
never from a client-supplied string. Dev-stub tokens take the form
`dev:+<E164phone>` and are accepted only when Firebase is unconfigured and
`NODE_ENV !== production`.

## Endpoints (user)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/solo-connect/access` | — | eligibility + verificationStatus (`none\|draft\|pending\|approved\|rejected`) + `banned` / `suspendedUntil` |
| GET | `/solo-connect/phone/config` | — | `{ firebaseConfigured }` — tells the client real vs dev-stub mode |
| POST | `/solo-connect/phone/verify` | `{ idToken }` | rate-limited; one-phone-per-account (409 on clash); sets `phoneVerified`, status `draft` |
| GET | `/solo-connect/verification` | — | current record (selfie path, phone, consent, moderation flags) |
| POST | `/solo-connect/verification/submit` | `{ selfieUrl, gender, consent:true }` | requires phone verified; sets gender on user; status → `pending`; notifies user |
| GET | `/solo-connect/verification/selfie/:userId` | — | **auth-gated** selfie stream (owner or admin only) |
| GET | `/solo-connect/groups?city=` | — | city-scoped, excludes soft-deleted; each group carries `menCount` / `womenCount` / `memberCount` |
| POST | `/solo-connect/groups` | `SoloGroupBody` (+ optional `genderType`) | creates group; bumps activity |
| GET | `/solo-connect/groups/:id?city=` | — | group + members (each member has `gender`) |
| POST | `/solo-connect/groups/:id/join` | `{ city }` | bumps activity; notifies group admin |
| POST | `/solo-connect/groups/:id/report` | `{ reportedUserId, reason, description?, evidenceUrl? }` | rate-limited; member-only; one open report per (reporter, reported, group) |
| POST | `…/messages`, `…/leave`, `…/members/:id/(approve\|reject\|remove)`, `…/lock`, `…/close` | — | unchanged group ops; approve/message bump activity |

## Endpoints (admin — `requireAuth(["admin"])`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/solo-connect/verifications?status=&q=` | review queue + history; includes `selfieStreamUrl` |
| POST | `/admin/solo-connect/verifications/:id/review` | `{ decision, rejectionReason? }`; notifies applicant |
| GET | `/admin/solo-connect/groups?includeDeleted=1&inactiveDays=N` | groups + counts + `daysSinceActivity` |
| POST | `/admin/solo-connect/groups/:id/extend` | reset inactivity clock |
| POST | `/admin/solo-connect/groups/:id/restore` | restore soft-deleted group within grace window |
| GET | `/admin/solo-connect/reports?status=&reason=&q=&limit=&offset=` | reports + repeat-offender counts |
| POST | `/admin/solo-connect/reports/:id/action` | `{ action: warn\|suspend\|ban\|remove\|resolve\|reject, suspendDays?, note? }`; writes audit log; notifies reporter |
| GET | `/admin/solo-connect/moderation-actions` | append-only audit feed |
| GET | `/admin/solo-connect/deleted-groups` | auto-deletion log + restorable flag |

## Scheduled jobs (`node-cron`, IST)

- `0 3 * * *` — purge all group chat messages (existing).
- `30 3 * * *` — `runSoloGroupExpiry()`: warn at (inactivity − warn) days, soft-delete + chat purge at inactivity days, hard-purge after grace.

## QA test cases

**Onboarding**
1. Valid phone → code → verify → selfie (camera only; gallery blocked) → gender → consent → submit → status `pending`; "Verification Under Review" shown.
2. Invalid/short OTP code rejected; resend works; (real Firebase) expired code rejected.
3. Duplicate phone on a second account → 409 "already linked".
4. Submit without phone verified → 400; without consent → blocked client-side and `consent:true` enforced server-side.
5. Pending user cannot list/join groups (403 "Verification required").

**Auth model (regression)**
6. Existing email/password login for admin/vendor/organizer/user is unchanged; `/auth/me` unaffected.

**Groups & counts**
7. Female user joins a `male`/`mixed` group and vice-versa (no gender gate).
8. `menCount` / `womenCount` / `memberCount` correct after approve / leave / remove.
9. Full group, locked, and closed all block joining; other-city group hidden + 403 on direct access.

**Expiry**
10. With low env thresholds: 12-day warning fires once (members notified, `expiryWarnedAt` set); 15-day soft-delete + chat purge + member notify; restore within grace re-lists the group; hard-purge after grace removes rows; any activity resets the clock.

**Reporting & moderation**
11. Non-member cannot report; self-report blocked; duplicate open report → 409.
12. Evidence upload optional; reporter notified on submit and on status change.
13. `suspend` sets a window and blocks participation until it passes; `ban` blocks permanently; `remove` drops membership; audit row written for each; repeat-offender count increments.

**Security**
14. Selfie not reachable via `/storage/public-objects`; `/solo-connect/verification/selfie/:id` rejects non-owner non-admin (403).
15. Phone-verify and report rate limiters trip under burst.
16. All `/admin/solo-connect/*` endpoints reject non-admins (403).
