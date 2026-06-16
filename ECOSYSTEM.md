# HOSPO OPS — How everything links (the ecosystem)

This is the map of how the pieces of HOSPO OPS fit together — what links to
what, why, and where it's all heading. It doubles as a "how to use the software"
guide: once you understand the spine (venue → department → section → work +
knowledge → completion → follow-up), every screen makes sense.

> **See it live:** the admin panel has a **Structure** page (`/admin/structure`)
> that renders this tree from your real data — venues, departments, staff, tasks
> and training, with counts. Use it as a visual review while we build the rest out.

---

## 1 · The spine (what links to what)

Everything is **venue-scoped**. The venue is the tenant root; nothing exists
outside a venue.

```
VENUE ── the business / site (timezone drives the daily reset)
│
├─ DEPARTMENT ── a broad area, e.g. "Front of house", "Kitchen"
│   │             staff belong to a department
│   │
│   ├─ STAFF ───────────── people (each works one or many sections — planned)
│   │
│   └─ SECTION  ◄══ PLANNED LAYER ── the stations within a department
│       ├─ Bar
│       ├─ Cabinet
│       ├─ Coffee
│       └─ Floor (inside)
│             │
│             └─ SECTION BUNDLE ── the linked "ecosystem" for that station
│                  ├─ ACTION shelf ....... tasks · checklists / task-lists
│                  └─ KNOWLEDGE shelf .... SOPs · training · FAQs · how-tos
│                       ↕ everything cross-links
│                         (a task → its SOP → its training → its FAQ)
│
├─ CALENDAR ── shifts (roster) · time-off · imported events (Google / iCal)
├─ NOTICE BOARD ── posts (priority · pin · must-acknowledge)
└─ BUDGET ── month total split across working days
```

**Scoping is flexible.** A task or a knowledge resource can attach at any level:

| Level | Example | Who sees it |
|---|---|---|
| Venue-wide | "Lock up" | everyone in the venue |
| Department | "FOH pre-service brief" | everyone in that department |
| Section *(planned)* | "Dial in the grinder" (Coffee) | everyone on that station |
| One person | "Cellar check → Sam" | that staff member only |

### How a person links to the work

There is **no direct staff↔task foreign key**. The link *is the completion*:

```
STAFF ──performs──► TASK ──creates──► TASK COMPLETION
                                      (tick · note · photo · the date)
                                      └─► dashboard stats + overdue engine
```

One completion row per task per day (`scheduledDate`), which is what makes the
daily reset and the "missed / overdue" tracking honest per venue.

---

## 2 · The section bundle (the ecosystem idea)

A **section** isn't just a label — it's a container that bundles the *work* for a
station together with the *knowledge* that backs it, all cross-linked so staff and
managers move between them in one place.

```
┌──────────────────────────────────────────────────────────┐
│  SECTION: Coffee     (department: Front of house)         │
├──────────────────────────────────────────────────────────┤
│  ACTION shelf                     KNOWLEDGE shelf         │
│  ┌────────────────┐    backed-by   ┌───────────────────┐  │
│  │ Task list:     │ ─────────────► │ SOP: Dial in the  │  │
│  │ "Open coffee"  │ ◄───explains── │ grinder           │  │
│  │  • grind       │                └─────────┬─────────┘  │
│  │  • dial in     │                          │ teaches    │
│  │  • milk prep   │                          ▼            │
│  └───────┬────────┘                ┌───────────────────┐  │
│          │ requires-competency     │ Training:         │  │
│          └──────────────────────►  │ Espresso 101      │  │
│                                     └─────────┬─────────┘  │
│                                     ┌─────────▼─────────┐  │
│                                     │ FAQ / How-to:     │  │
│                                     │ "Milk temps"      │  │
│                                     └───────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

SOPs, FAQs, how-tos and training are **one kind of thing** (a "resource" with a
type), not four separate silos — that's what lets them group and cross-reference
freely.

---

## 3 · Competency & the follow-up triggers (where it pays off)

The whole ecosystem exists to power **automatic follow-up**. The hinge is one
link: a task can declare the **training it requires** (a competency). A staff
member "holds" a competency when they have a completion for that training.

```
STAFF "Joy"  ──works in──►  Coffee, Floor          (many sections)
     │
     └─ has completed ──►  Training: "Espresso 101"  =  a COMPETENCY

When Joy ticks "Open coffee":
        does she hold the competency the task requires?
                 │
          ┌──────┴───────┐
         YES             NO
          │               │
       all good      ►  flag manager: trained gap
```

Two trigger loops fall straight out of this:

```
(1) TASK MISSED or DONE WRONG
    overdue engine, OR manager marks "not done correctly"
        ├─► auto-assign the task's linked TRAINING
        └─► notify  staff ("work through this guide")
                  + manager ("follow up with Joy")

(2) TASK DONE by an UNTRAINED person
    completion saved, but no matching training completion for that staff
        ├─► notify manager ("upskill + sign off Joy on Espresso 101")
        └─► optionally queue a sign-off task
```

---

## 4 · Integration plan (how we build it)

The ecosystem slots onto the existing schema as **one new level + one
generalisation + one new link** — not a rebuild. Phased so each step is usable on
its own:

**Phase A — Section layer**
- New `Section` model (`departmentId` FK). Venue → Department → Section.
- `Task.sectionId?` (optional; tasks can still be dept- or venue-level).
- `Staff ⇄ Section` **many-to-many** (a server works Coffee *and* Floor).
- Surface sections in the admin (CRUD) and on the **Structure** page (replace the
  "Sections — planned" placeholder with real data).

**Phase B — Unify knowledge as "resources"**
- Generalise `TrainingModule` with a `kind` field: `TRAINING | SOP | FAQ | HOWTO`.
  One table, one viewer, all attachable at venue / department / section.
- `ResourceLink` join so resources cross-reference each other (task → SOP →
  training → FAQ).
- Knowledge sharable across sections (many-to-many, or a level field) so one
  health-&-safety SOP serves many stations.

**Phase C — Competency link**
- `Task ⇄ Training` "requires" relation (today the link only goes the other way,
  as a how-to). This is the competency gate.
- Competency = existing `TrainingCompletion`.

**Phase D — Trigger engine + notifications**
- Rule 1: missed / failed task → auto-assign linked training + notify.
- Rule 2: completed-but-untrained → prompt manager to upskill / sign off.
- Delivery: in-app first (dashboard + a follow-ups list), then push / WhatsApp.

> Until Phase A ships, the **Structure** page shows the live venue → department →
> staff / tasks / training tree, with the Section layer marked as planned so the
> shape is visible as we go.

---

## 5 · Using it day to day

- **Managers** set up the structure (departments → sections → tasks + the
  knowledge that backs them), roster shifts, and post notices. They review
  end-of-day notes and, once triggers land, work a follow-up list.
- **Floor staff** scan a QR code for their area, enter a PIN, and see only the
  tasks due for that area today — with the how-to / SOP one tap away. They tick
  tasks off (with a note or photo where required) and acknowledge notices.
- **The system** ties it together: completions feed the dashboard and the overdue
  engine; gaps (missed, wrong, or untrained) become follow-ups that route the
  right training to the right person and tell a manager to check in.
