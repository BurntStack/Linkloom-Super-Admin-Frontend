# Super Admin console: what it needs from the backend

The console already calls the `/v1/admin/...` endpoints. What's missing is mostly **fields in the responses**.
Where a field is missing, the screen shows "—" or "Not sent by the API" instead of the designed content.
Field names below are the ones the console reads first (`src/lib/model.js`); other common spellings are also accepted.
Money is always integer paise (or `{ amount, currency }`). Dates are ISO 8601.

**Rule for every admin write:** accept `reason` (and optional `note`) in the body and write it to the audit log.

---

## 1. Must fix (blocks core work)

| # | Area | Problem today | What's needed |
|---|---|---|---|
| 1 | Campaigns | New briefs go straight to `moderationStatus: "live"`, so nothing ever waits for admin approval | New briefs start as `moderationStatus: "pending_review"` and stay out of `GET /v1/campaigns/` until `POST /v1/admin/campaigns/<id>/approve/`. Admin campaign records must include `moderationStatus` (the public API has it, the admin one doesn't seem to) |
| 2 | Campaigns | Briefs like "nude video" / "Blue film" went live unreviewed | Same as #1; also return them with `filter=pending` |
| 3 | Accounts | Account actions need the **user id**, which records often don't include | Every creator/brand record (list and detail) includes `userId` |
| 4 | Accounts | The console can't always tell whether an account is suspended | `status: "active" \| "suspended"` on creator/brand records, plus `suspension: { at, by, reason }` |
| 5 | Password reset | No reason is stored; the admin can't see where the link went | `POST /v1/admin/users/<user_id>/password-reset/` accepts `{ reason, note }`, logs it, and returns `{ sentTo: "ma•••@domain.in", expiresAt }` |

---

## 2. Command (home) — `GET /v1/admin/system/dashboard/`

```json
{
  "creators": { "active": 0, "suspended": 0 },
  "brands": { "active": 0, "suspended": 0, "unverified": 0 },
  "liveOrders": 0,
  "ordersByPhase": { "funded": 0, "in_progress": 0, "submitted": 0, "revision": 0, "approved": 0, "disputed": 0 },
  "escrowHeld": 0,
  "commissionPct": 0,
  "gatewayPct": 2
}
```
The home screen also reads pending verifications, open abuse reports, open disputes, open bid alerts and the last 5 audit entries (shapes below).

## 3. Notifications (the bell)
Each item: `id, title, body, kind (verify|report|dispute|bids|payment|campaign|audit), createdAt, read, targetType, targetId`.

## 4. Verification desk — `/v1/admin/verifications/`
- List filters: `status=pending|decided`, `kind=creator|brand`; `meta.counts: { all, creator, brand }` (pending).
- Every record, list **and** detail:
  - `kind, name, submittedAt, slaDueAt (optional), note, account (profile id), userId, decidedAt, decidedBy { name }, rejectionReason`
  - Creator: `id_doc { type, masked, name, dob, match: ok|mismatch|under18 }`, `pan { masked, name, match }`,
    `bank { kind: UPI|Bank, masked, holder, ifsc, match }`, `selfie { liveness: passed|failed, faceMatch: 0-100 }`,
    `socials [{ platform, handle, followers, linked, accountAge }]`
  - Brand: `business { legal, gstin, gstinStatus, pan, panFromGstin, cin }`, `person { name, designation, mail, mailVerified }`, `billing { address, email }`
  - `documents [{ id, label, url (signed), expiresAt }]`, `checks [{ key, label, status, blocking, message }]`
- Writes: approve `{ note }` · reject `{ reason, note }` · request-info `{ items, message }` where items are
  `id|pan|bank|selfie|soc` (creator) or `gst|pan|cin|per|mail|bill` (brand). Tell the applicant by SMS and email.

## 5. Accounts — `/v1/admin/users/...`
- **Creator** (list + detail): `id, userId, name, handle, email, city, status, kycStatus (verified|under_review|action_needed|rejected|not_started), joinedAt, lastActiveAt, followers, engagementRate, rating, completedJobs, totalEarned, badges [names], tags [category names], featured, reportCount, suspension`
  - Detail also: `orders [{ id, title, amount, phase, brand { id, name } }]`, `abuseReports [report]`
  - List filters: `q, status, kyc=not_verified, badge, featured=true, hasReports=true`; `meta.total`
- **Brand** (list + detail): `id, userId, name, contact, email, emailVerified, legalName, gstin, gstinVerified, pan, cin, city, status, verificationStatus, joinedAt, postsLast30, postsMonthlyAvg, totalSpent, openCampaigns, reportCount, suspension`
  - Detail also: `campaigns [campaign]`, `postingDaily [{ date, count }]` (last 30 days), `abuseReports`
  - List filters: `q, status, verified=true|false, postingSpike=true, hasReports=true`
- `PATCH creators/<id>/` accepts `{ badges }`, `{ tags }` or `{ featured }` on their own, plus `reason`.
- Sessions: items `id, userAgent, ip, city, createdAt, current`; `sessions/revoke/` accepts `{ reason }` (all) or `{ sessionId, reason }` (one device).
- Suspend `{ reason, note }`, reactivate `{ reason, note }`.
- Audit log filter `targetId=<id>` for the account's "Admin history".

## 6. Marketplace / moderation
- Campaign: `id, title, brand { id, name }, platform, budgetMin, budgetMax, bidCount, createdAt, closesAt, status (lifecycle), moderationStatus (pending_review|live|flagged|hidden|rejected|removed), flagCount, ruleBroken`.
- Bid alert: `id, pattern, detail, risk (0-100), accounts, createdAt, status`.
- Abuse report: `id, type (profile|message|content|review|campaign), severity (high|medium|low), count, excerpt, target (label), targetId, reporter { name }, reason, createdAt, status`.
- Review: `id, brand { name }, creator { id, name }, rating, text, createdAt, orderId, status`.
- Categories: `id, name, creatorCount`; rename via `PATCH { name }`; merge body `{ targetId }`.

## 7. Orders, disputes, finance
- Order: `id, title, amount, phase, brand { id, name }, creator { id, name }, fundedAt, dueAt, releasedAt, refundedAt, disputeId, breakdown { price, commission, gateway, creatorGets, linkloomNet }, timeline [{ at, phase, text, by }]`.
- Dispute: `id, order { id, title, amount, brand, creator }, openedAt, openedBy (creator|brand), claim, evidence [labels], response, status, outcome, slaDueAt, kind ("payment" for payout complaints)`.
- Payout: `id, creator { id, name }, amount, orderId, paidAt, method, utr, status`.

## 8. Audit log
- Entries: `id, createdAt, actor { name }, action (e.g. account.suspend), targetType, targetId, target (label), reason, prevHash, hash`.
- `audit-log/verify/` returns `{ valid, count, brokenAt }`.
