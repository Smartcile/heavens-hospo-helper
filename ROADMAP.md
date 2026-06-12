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
☐ **SwiftPOS staff sync** — import staff + PINs from SwiftPOS API using `swiftPosId` stub
☐ **Calendar sync** — view venue events/bookings alongside task list
✅ **Recurring + overdue engine** — cron-aware scheduling (CUSTOM cron now actually evaluated, fixing daily/weekly/cron due-dates) plus missed-task tracking surfaced on the dashboard ("MISSED — LAST 7 DAYS") via `/api/admin/overdue`
☐ **Push notifications** — web push or email alerts for overdue/incomplete tasks at end of shift
✅ **Task templates library** — pre-built hospo SOP task sets (bar open, kitchen close, etc.) + custom templates, one-click apply to a department, and "save department as template" snapshot
☐ **S3 file uploads** — replace local disk uploads with S3-compatible object storage
☐ **Proper admin email auth** — replace `swiftPosId` login hack with proper email + password

---

## PHASE 3 — TRAINING
☐ **Training modules** — SOPs linked to task categories (`TrainingModule` model already exists)
☐ **Step-by-step process guides** — photo/video support per step (`TrainingStep` model already exists)
☐ **Cross-link training to tasks** — `TrainingStep.linkedTaskId` already stubbed
☐ **MyHR onboarding export** — generate onboarding document from training modules
☐ **Staff training completion tracking** — who has completed which modules

---

## PHASE 4 — FINANCE
☐ **Monthly budget splitter** — split a monthly labour budget across working days (`BudgetPeriod` model already exists)
☐ **Daily budget allocations** — set custom amounts per day with notes (`BudgetDayAllocation` model already exists)
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
