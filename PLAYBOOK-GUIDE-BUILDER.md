# PLAYBOOK GUIDE BUILDER — LLM PROMPT KIT

> Paste this whole file into an LLM, then either **describe the guide you want in plain
> English** and ask it to output the filled template below, or paste the template and ask
> it to complete every field. It knows the app's Playbook contract, so what it produces
> maps 1:1 onto the guide editor at `Admin → Training → Playbook`.

---

## 1. HOW TO USE THIS FILE

1. Paste this file into the LLM.
2. Say something like:
   - *"Write a new guide for the coffee machine clean. Use the template."*
   - *"Here are my rough notes: ... Turn them into a filled guide."*
   - *"Redo Guide 3's steps in plain English a new manager could follow."*
3. Copy each returned field into the matching box in the guide editor.

**Golden rule the LLM must respect:** a published guide only reaches someone if it has an
**audience** (Applies to) or an **individual assignment**. No audience = nobody sees it.

---

## 2. THE GUIDE CONTRACT (every field)

| Field | Required | Type / allowed values | Notes |
|---|---|---|---|
| **Title** | ✅ | text | Stored **UPPERCASE**. Keep it short and literal. |
| **Description** | – | text | One or two sentences. Shows on the card + worker list. |
| **Type** | – | `HOW_TO` `SOP` `FAQ` `TRAINING` `POLICY` `OTHER` `PRODUCT_REFERENCE` | Displayed as HOW TO / SOP / FAQ / TRAINING / POLICY / OTHER / PRODUCT REFERENCE. Use `PRODUCT_REFERENCE` **only** for a table (price lists, wine lists, product specs) — it renders a table, not steps. |
| **Folder** | – | an existing Guide folder | Groups cards on the Playbook page. Drag cards between folders. |
| **Category** | – | text | Free-text tag, stored UPPERCASE (e.g. `TIPS`, `FOOD SAFETY`, `BAR`). |
| **Auto-assign to department** | – | a Department | Legacy single-department targeting. Prefer **Applies to** for anything but a single-dept guide. |
| **Applies to** (audiences) | – | list of `DEPARTMENT` / `SECTION` / `POSITION` + a target | How the guide reaches staff. A person inherits a guide when their department, section, or job position matches. **Empty = nobody (unless individually assigned).** |
| **Track completion** (`isTracked`) | – | checkbox | **ON** = appears in the worker's "My Guides", tracks completions, supports sign-off. **OFF** = reference-only doc (SOP/FAQ/policy) shown in the worker's BIBLE, read-anytime, no ticking. |
| **Requires sign-off** (`requiresSignOff`) | – | checkbox | **ON** = a manager must sign off (via Staff → GUIDES) instead of the worker self-completing. Only meaningful when Track completion is ON. |
| **Onboarding** (`isOnboarding`) | – | checkbox | **ON** = applies to **every** staff member regardless of department (part of induction). Use sparingly. |
| **Linked tasks (how-to guide for)** | – | a list of Tasks | This guide is the *reference* for those tasks. |
| **Required competency (must complete before task)** | – | a list of Tasks | Completing this guide is a **requirement before the task can be performed**. |
| **Steps** | ✅ (unless PRODUCT_REFERENCE) | ordered list | Each step: **heading** (optional), **content** (required), optional **photos**, optional **video**, optional **links**. |

**Audience precedence** (the badge a worker sees): `ASSIGNED > ONBOARDING > SECTION > POSITION > DEPARTMENT`.

**Step link kinds** (the `+ LINK` control on a step): `ITEM` (a tool/stock item), `TASK`,
`CHECKLIST`, `GUIDE`, `SECTION`, `RECIPE`. A link can carry a **qty** ("2 × T20 TORX") and a
**note** ("TOP SHELF, ABOVE THE GRINDER").

---

## 3. AUTHORING RULES

- **UPPERCASE** for: Title, Category, Task titles, Department/Venue names.
- **One idea per step.** A step is a heading + short paragraph a busy worker reads in 5 seconds.
- **Tracked vs reference** — choose deliberately:
  - Must be acknowledged / completed / signed off → **Track ON**.
  - Just knowledge to look up anytime → **Track OFF** (Bible).
- **Confidential processes** — do **not** target a POSITION (every holder inherits it). Publish it,
  then assign it **individually** (Staff → (person) → GUIDES → ASSIGN). Never put a confidential
  process in a shared task or checklist — those are floor-wide by design and would leak it.
- **Photos** — add real screenshots/photos to a step via the step's image picker. Leave a clear
  `[SCREENSHOT: ...]` marker in the content so a human knows one is expected.
- **Videos** — upload to the step (auto-transcoded to a small silent phone clip) or paste a link.
- **Don't encourage** anything a policy forbids (e.g. tips) — write the exact words/phrases staff should use.

---

## 4. WORKING CONTENT — THE "TIPS" FOLDER (already decided)

Folder: **TIPS**. Three guides. Their finalized fields and steps are below — the LLM must stay
consistent with these when asked to extend or rewrite them.

### Guide 1 — TIPS — HOW THEY WORK

| Field | Value |
|---|---|
| Type | `POLICY` |
| Folder | `TIPS` |
| Category | `TIPS` |
| Description | How the tip pool is shared across the team, and how to handle a customer who insists on tipping. Read before your first shift on the floor. |
| Applies to | every DEPARTMENT (BAR, KITCHEN, FOH, …) |
| Track completion | ON |
| Requires sign-off | OFF |
| Onboarding | OFF |

**Steps**
1. **ONE POOL, SHARED BY EVERYONE** — All tips, cash and EFTPOS, go into one shared pool, no matter who was tipped. The pool is split across the team for the period.
2. **IF A CUSTOMER INSISTS ON TIPPING** — Politely decline once: "We appreciate it but we'd prefer you to come back again." If they insist again, thank them and accept it — tell them you'll add it to the tip jar / put it through, and do that when they leave.
3. **DON'T ENCOURAGE TIPS** — Never ask for or encourage a tip. Step 2 is the whole script.
4. **HOW THE SPLIT WORKS** — Kitchen staff get a fixed share (main kitchen 0.2, small kitchen 0.1). FOH shares the rest, weighted by the hours each person worked across the period. Payouts are calculated in the app under Performance → Tips.

### Guide 2 — TIPS — TAKING TIPS ON THE TILL

| Field | Value |
|---|---|
| Type | `SOP` |
| Folder | `TIPS` |
| Category | `TIPS` |
| Description | Where a cash tip goes and how to put a card tip through the SwiftPOS till using the TIP button. |
| Applies to | BAR + FOH (add KITCHEN if they ring sales) |
| Track completion | OFF |

**Steps**
1. **CASH TIPS → TIP JAR** — Any cash tip goes straight into the tip jar. It's counted and entered later.
2. **CARD / EFTPOS TIPS → THE TIP BUTTON** — On the SwiftPOS till, press the TIP button, enter the tip amount, then take payment as normal. `[SCREENSHOT: SwiftPOS TIP button]` — link: `ITEM → TIP JAR`.
3. **LEAVE IT FOR THE POOL** — Don't hold back a tip for yourself; everything goes into the pool. Link: `GUIDE → TIPS — HOW THEY WORK`.
4. **NOT SURE? ASK A MANAGER** — If the till or any doubt gets in the way, call a manager rather than guessing.

### Guide 3 — TIPS — END-OF-PERIOD PROCESS  (CONFIDENTIAL)

| Field | Value |
|---|---|
| Type | `SOP` |
| Folder | `TIPS` |
| Category | `TIPS` |
| Description | The end-of-period runbook: count the tip jar, add the EFTPOS holding, pull hours, set share tiers and pay out. |
| Applies to | LEAVE EMPTY |
| Assignment | individually: Outlet Manager + F&B Manager only (Staff → person → GUIDES → ASSIGN) |
| Track completion | ON |
| Requires sign-off | OFF |

**Steps**
1. **PICK THE PERIOD — two standard periods only** — SUMMER TEAM: 1 Nov – 28/29 Feb. NORMAL TEAM: 1 Mar – 31 Oct. Process the period that has just closed. This captures the summer crew separately from the year-round team so each group's tips are split evenly across the stretch of trade they actually worked.
2. **COUNT THE CASH** — Open Performance → Tips. Count the tip jar by denomination into the Cash Calculator (100 down to 0.1). Link: `GUIDE → TIPS — TAKING TIPS ON THE TILL`.
3. **GET THE EFTPOS HOLDING** — Request the EFTPOS/POS holding figure from the finance team.
4. **ENTER IT** — Put that figure in the EFTPOS / POS holding field. Cash + POS = total accrued tips.
5. **SET THE PERIOD DATES** — Enter the From / To dates for the period chosen in step 1. These are for the books only; they don't change the split.
6. **PULL THE HOURS** — For each staff member, read their hours for the period from LoadedReports and add a row (name + hours).
7. **SET THE SHARES** — Kitchen: MAIN KITCHEN (0.2) or SMALL KITCHEN (0.1). FOH: FULL / 3-4 / HALF / 1-4 based on the hours worked.
8. **CHECK IT RECONCILES** — The Difference line must read $0.00. If not, a share or the total is wrong.
9. **PAY OUT & FILE** — Record the payout and save the period.

**Related items (create once, link from the guides):**
- Inventory item **TIP JAR** → linked on Guide 2 step 2 (`ITEM`).
- Task **COUNT THE TIP JAR** (department task, floor-safe) → linked to **Guide 2** as a how-to.
- Do **not** create a "process the tips" task/checklist — it would be floor-wide and expose Guide 3.

---

## 5. TEMPLATE — COPY THIS AND ASK THE LLM TO FILL IT

```
GUIDE
Title:
Description:
Type:                 (HOW_TO | SOP | FAQ | TRAINING | POLICY | OTHER | PRODUCT_REFERENCE)
Folder:
Category:
Applies to:           (list DEPARTMENT / SECTION / POSITION targets, or "NONE — ASSIGN INDIVIDUALLY")
Track completion:     (ON/OFF)
Requires sign-off:    (ON/OFF)
Onboarding:           (ON/OFF)
Linked tasks:         (how-to references)
Required competency:  (tasks gated behind this guide)

STEP 1
Heading:
Content:
Photos:               (or [SCREENSHOT: ...])
Video:                (path or URL, or none)
Links:                (KIND → target; qty/note)

STEP 2
Heading:
Content:
Photos:
Video:
Links:

STEP n
...
```

### Instructions to give the LLM alongside the template
- Match the tone and length of the TIPS guides above (short heading + 1–3 sentences).
- Return the **whole** filled template, field by field, nothing omitted.
- Decide Track / sign-off / onboarding deliberately and say why in one line under the guide.
- If the guide is confidential, set `Applies to: NONE` and note who it should be assigned to.
- Leave `[SCREENSHOT: ...]` markers where a real photo/screenshot is needed.
