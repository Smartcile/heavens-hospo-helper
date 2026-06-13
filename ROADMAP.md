# HOSPO OPS — ROADMAP

---

## PHASE 1 — CORE (CURRENT)
✅ Multi-venue + multi-department support
✅ Staff profiles with PIN auth (bcrypt-hashed, 2–4 digits)
✅ Task creation with scheduling (DAILY / WEEKLY / CUSTOM cron)
✅ QR code generation and worker login flow
✅ Worker mobile task view with completion types (TICK / TICK+NOTE / TICK+PHOTO)
✅ Admin dashboard with today's completion stats
✅ Admin reporting with audit log and CSV export
✅ Docker Compose deployment with Nginx reverse proxy
✅ Soft deletes everywhere — no data is ever destroyed
✅ DOS-MODERN design system — monochrome, sharp corners, monospace typography

---

## PHASE 2 — INTELLIGENCE
✅ **Per-venue timezone** — daily reset, worker view, dashboard, and overdue all use each venue's local day
✅ **Proper admin email auth** — real email + password login for ADMIN/MANAGER (bcrypt); floor staff keep QR + PIN; legacy `swiftPosId`-as-login backfilled automatically
☐ **Unified staff sync (COMING SOON)** — one profile linked across SwiftPOS / MyHR / LoadedReports via per-system ID fields (editable now); planned: CSV import then API sync, matching on email + system IDs
✅ **Calendar — roster + time off (v1)** — month overview with shift roster (times), time-off request→approve workflow, and a duty-days overlay (from task schedules); managers manage it in admin, staff see their own shifts + request time off on their phone
☐ **Calendar — events + guest numbers** — manual venue events + expected covers per day on the same calendar (next round)
☐ **Calendar sync (external)** — pull venue events/bookings from Microsoft Graph / Outlook alongside the native calendar
✅ **Recurring + overdue engine** — cron-aware scheduling (CUSTOM cron now actually evaluated, fixing daily/weekly/cron due-dates) plus missed-task tracking surfaced on the dashboard ("MISSED — LAST 7 DAYS") via `/api/admin/overdue`
☐ **Push notifications** — web push or email alerts for overdue/incomplete tasks at end of shift
✅ **Task templates library** — pre-built hospo SOP task sets (bar open, kitchen close, etc.) + custom templates, one-click apply to a department, and "save department as template" snapshot
☐ **S3 file uploads** — replace local disk uploads with S3-compatible object storage

---

## PHASE 3 — TRAINING
✅ **Training modules / guides** — authored in admin, with step-by-step content, **photos** (upload) and **video links**
✅ **Assignment** — onboarding (all staff), by department (auto), individually assigned (upskill / area to work on), and **task-linked** guides
✅ **Per-module sign-off model** — each module is either staff-self-complete or requires a manager sign-off
✅ **Worker access** — staff see "MY TRAINING" on their phone, work through guides, self-complete where allowed; linked guides surface on the task itself
✅ **Completion tracking** — who completed what, self vs signed-off (and by whom), shown per person on the Staff page
✅ **Manager end-of-day review** — per-shift view of each person's completed work + manager notes (area to work on / praise / incident); an "area to work on" can assign a follow-up training module in one click
☐ **MyHR onboarding export** — generate onboarding document from training modules
☐ **Reordering / required-for-role gating** — drag-order modules, block shifts until mandatory training done

---

## PHASE 4 — FINANCE
✅ **Monthly budget splitter** — set a month total, EVEN SPLIT across working days, mark days closed, with a live allocated-vs-budget balance check (`/admin/budget`)
✅ **Daily budget allocations** — editable per-day amounts + notes + working-day toggle
☐ **Labour cost visibility** — hours × pay rate per department/day from the roster (needs a pay-rate field on staff)
☐ **Loaded Reports integration** — export format compatible with Loaded accounting software
☐ **Basic labour cost visibility** — estimated hours × rate per department per day

---

## PHASE 5 — INTEGRATIONS
☐ **Microsoft Graph API** — read emails and calendar events (no LLM, read-only)
☐ **Microsoft Teams notifications** — send task overdue alerts to Teams channels
☐ **Outlook calendar sync** — overlay venue events on task schedule view
☐ **SwiftPOS deep sync** — roster data → automatic task assignment by shift and staff member

---

## PHASE 6 — SCALE
☐ **Multi-tenant SaaS mode** — white-label per business, isolated data per tenant
☐ **Role-based permission system** — granular permissions beyond ADMIN/MANAGER/STAFF
☐ **Public API** — REST API for third-party integrations
☐ **Mobile app wrapper** — Capacitor or React Native shell around the worker view
☐ **Offline support** — service worker caching for unreliable wifi environments

---

## TECHNICAL DEBT / KNOWN ISSUES
- Admin login uses `swiftPosId` field as login email identifier — to be replaced in Phase 2
- No cron engine in Phase 1 — task scheduling is filtered on read, not generated in advance
- File uploads are local disk only — not suitable for multi-server deployments
- No rate limiting on PIN login endpoint — to be added before public exposure
