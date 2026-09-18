# BACKEND.md

A plan for wiring the consultation-request form up to a real database. This is a planning document, not yet implemented — nothing described here exists in the repo yet. It's written against the repo as of the `consultForm` in [index.html](index.html) and the mock `submit` handler in [app.js](app.js), which [CLAUDE.md](CLAUDE.md) already flags as the spot to replace:

> If you add one, replace the `setTimeout` mock in the `submit` handler with an actual fetch/POST.

## 1. Current state

- **Form fields** (`consultForm` in `index.html`): `fullName` (required), `email` (required, regex-validated), `phone` (optional), `propertyAddress` (required), `borough` (optional `<select>`, one of `manhattan` / `brooklyn` / `queens` / `bronx` / `staten-island` / `nassau` / `suffolk` / `westchester` / `rockland` / `other`), `message` (required).
- **Validation** happens entirely client-side in `app.js`: `requiredFields`, `emailPattern`, `validateForm()`, and `setFieldError(fieldId, message)` which writes into the paired `#err-<fieldId>` span.
- **Submission** is mocked: the `submit` handler calls `validateForm()`, then just reveals `#formSuccess`, resets the form, and closes the modal after a timeout. Nothing is sent anywhere.
- The rest of the site (`styles.css`, the coverage/bio sections) is unrelated to this change and untouched by this plan.

## 2. Constraints this plan respects

- `index.html` / `styles.css` / `app.js` stay a build-free, dependency-free static frontend, per CLAUDE.md. This plan doesn't introduce a bundler, framework, or npm dependency into those three files.
- The backend is a **separate deployable unit** — a new `server/` directory with its own `package.json` — not something the static frontend needs installed to keep working. Opening `index.html` directly still works for everything except the form actually saving anywhere.
- Any dependencies live in `server/`'s own `package.json`, isolated from the frontend.

## 3. Architecture options considered

| Option | Pros | Cons |
|---|---|---|
| **A. Small Express server + SQLite** (recommended for MVP) | Zero external services, one process, trivial local dev (`npm start`), easy to inspect the DB file directly, cheapest to run (a $5 VPS or even the same box serving the static files) | Needs a long-running process somewhere; SQLite doesn't horizontally scale across multiple server instances |
| **B. Serverless function (Vercel/Netlify Function) + hosted Postgres (Neon/Supabase)** | No server to keep alive/patch; pairs naturally if the frontend ends up hosted on Vercel/Netlify; scales automatically | Adds a hosted DB dependency/cost from day one; a build/deploy step for the function even though the frontend has none; more moving parts for what's currently ~1 form on a single-page site |
| **C. Third-party form backend (Formspree, Basin, etc.)** | Fastest to wire up, no backend code at all | You don't own the data/schema, harder to query "all requests for Nassau County" later, ongoing per-submission cost, another vendor dependency |

**Recommendation: Option A.** This site is a single consultant's lead-capture form, not a high-traffic app — a single small Express process with a SQLite file is the least infrastructure that does the job, keeps the data in your own repo/server rather than a third party, and has a clean upgrade path (swap SQLite for Postgres later; the query layer below is written so that swap only touches `server/db.js`).

This needs one input from you before build: **where will this be hosted?** If it's a VPS/box you control, Option A works as-is. If the frontend ends up on a static host with no server support (GitHub Pages, plain Netlify static hosting), you'd need Option B's serverless variant instead — same schema and validation logic, different `server/index.js` entry point. The plan below assumes you have *somewhere* to run a persistent Node process; flag it if that's not the case.

## 4. Data model

```sql
-- server/schema.sql
CREATE TABLE IF NOT EXISTS consultation_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  property_address  TEXT NOT NULL,
  borough           TEXT,                          -- one of the <select> values, or NULL
  message           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'new',    -- 'new' | 'contacted' | 'closed'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  source_ip         TEXT,
  user_agent        TEXT
);

CREATE INDEX IF NOT EXISTS idx_consultation_requests_created_at
  ON consultation_requests (created_at);
```

Rationale:
- `status` gives you a lightweight way to track follow-up without a separate CRM — defaults to `'new'`, you update it to `'contacted'`/`'closed'` as you work leads (via direct DB access or a future admin endpoint — see §9).
- `source_ip` / `user_agent` are for spam triage only, not analytics — worth capturing since this is a public, unauthenticated form.
- Field names mirror the form's `name` attributes (`fullName` → `full_name`, etc.) via `snake_case` conversion at the query layer, so there's no ambiguity mapping one to the other.

## 5. API contract

**`POST /api/consultation-requests`**

Request body (`application/json`), matching the form field names exactly so the client doesn't need to remap anything:

```json
{
  "fullName": "Jane Smith",
  "email": "jane@example.com",
  "phone": "555-123-4567",
  "propertyAddress": "123 Main St, Brooklyn, NY",
  "borough": "brooklyn",
  "message": "Open DOB violation, need help resolving it."
}
```

Responses:

| Status | Body | When |
|---|---|---|
| `201` | `{ "id": 42, "createdAt": "2026-09-18T01:20:00.000Z" }` | Stored successfully |
| `400` | `{ "errors": { "email": "Please enter a valid email address." } }` | Server-side validation failed — **keys match the existing `#err-<fieldId>` span IDs**, so the frontend can feed this straight into `setFieldError()` with no translation layer |
| `429` | `{ "error": "Too many requests. Please try again later." }` | Rate limit hit |
| `500` | `{ "error": "Something went wrong. Please try again or call directly." }` | Unexpected server/DB error |

Server-side validation **must** duplicate the client-side rules, not just trust them — a form's client JS is trivially bypassable with a raw `curl` POST.

## 6. Server implementation

New top-level directory, entirely separate from the frontend:

```
server/
  index.js
  db.js
  validate.js
  routes/
    consultations.js
  schema.sql
  data/                 (gitignored — the SQLite file lives here)
  package.json
  .env.example
```

**`server/package.json`**
```json
{
  "name": "northline-compliance-api",
  "private": true,
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  }
}
```
`better-sqlite3` over an async driver because it's synchronous — no callback/promise plumbing needed for what's a handful of writes a day, and it applies the schema and inserts in a couple of lines.

**`server/db.js`**
```js
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "consultations.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

module.exports = db;
```

**`server/validate.js`** — deliberately mirrors `app.js`'s `requiredFields`/`emailPattern` so the two never silently drift apart:
```js
const REQUIRED_FIELDS = ["fullName", "email", "propertyAddress", "message"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_BOROUGHS = [
  "manhattan", "brooklyn", "queens", "bronx", "staten-island",
  "nassau", "suffolk", "westchester", "rockland", "other"
];

function validateConsultationRequest(body) {
  const errors = {};

  REQUIRED_FIELDS.forEach(function (field) {
    const value = (body[field] || "").trim();
    if (!value) {
      errors[field] = "This field is required.";
    } else if (field === "email" && !EMAIL_PATTERN.test(value)) {
      errors[field] = "Please enter a valid email address.";
    }
  });

  if (body.borough && !VALID_BOROUGHS.includes(body.borough)) {
    errors.borough = "Please choose a valid borough or county.";
  }

  return errors;
}

module.exports = { validateConsultationRequest };
```

**`server/routes/consultations.js`**
```js
const express = require("express");
const db = require("../db");
const { validateConsultationRequest } = require("../validate");

const router = express.Router();

const insertStmt = db.prepare(`
  INSERT INTO consultation_requests
    (full_name, email, phone, property_address, borough, message, source_ip, user_agent)
  VALUES (@fullName, @email, @phone, @propertyAddress, @borough, @message, @sourceIp, @userAgent)
`);

router.post("/consultation-requests", function (req, res) {
  const body = req.body || {};

  // Honeypot — see index.html/§8. Bots fill every field; real visitors
  // never see this one, so a non-empty value means it's spam. Return a
  // fake success instead of a 4xx so scripted senders don't learn to
  // adapt.
  if (body.website) {
    return res.status(204).end();
  }

  const errors = validateConsultationRequest(body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors: errors });
  }

  const result = insertStmt.run({
    fullName: body.fullName.trim(),
    email: body.email.trim(),
    phone: (body.phone || "").trim() || null,
    propertyAddress: body.propertyAddress.trim(),
    borough: body.borough || null,
    message: body.message.trim(),
    sourceIp: req.ip,
    userAgent: req.get("user-agent") || null
  });

  res.status(201).json({
    id: result.lastInsertRowid,
    createdAt: new Date().toISOString()
  });
});

module.exports = router;
```

**`server/index.js`**
```js
require("dotenv").config();
const express = require("express");
const consultationsRouter = require("./routes/consultations");
const { rateLimit } = require("./rateLimit");

const app = express();
app.use(express.json({ limit: "10kb" }));

if (process.env.ALLOWED_ORIGIN) {
  app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

app.use("/api", rateLimit, consultationsRouter);

const port = process.env.PORT || 3001;
app.listen(port, function () {
  console.log("API listening on port " + port);
});
```

**`server/rateLimit.js`** — hand-rolled instead of pulling in `express-rate-limit`, since the whole point of Option A is minimal moving parts:
```js
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 5;

function rateLimit(req, res, next) {
  const now = Date.now();
  const entry = hits.get(req.ip) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  hits.set(req.ip, entry);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  next();
}

module.exports = { rateLimit };
```
Caveat: this is in-memory, so it resets on process restart and doesn't share state across multiple instances. Fine for a single always-on Node process (Option A); would need a shared store (e.g. Redis) if this ever moves to serverless/multi-instance (Option B).

**`server/.env.example`**
```
PORT=3001
DATABASE_PATH=./data/consultations.db
ALLOWED_ORIGIN=https://northlinecompliance.com
```
Copy to `server/.env` locally (gitignored — see §9) and fill in real values.

## 7. Frontend change

Only `app.js`'s `submit` handler changes — everything else in the form (`validateForm`, `setFieldError`, field markup) is reused as-is, including for server-side errors, since the error-response shape in §5 was chosen to match `setFieldError(fieldId, message)` exactly.

Replace:
```js
form.addEventListener("submit", function (e) {
  e.preventDefault();

  if (!validateForm()) {
    return;
  }

  // No backend configured yet — simulate a successful submission.
  successMsg.hidden = false;
  form.reset();

  setTimeout(function () {
    closeModal();
    successMsg.hidden = true;
  }, 2200);
});
```

With:
```js
const API_BASE = ""; // same-origin; point this at the API's URL if it's hosted separately

form.addEventListener("submit", function (e) {
  e.preventDefault();

  if (!validateForm()) {
    return;
  }

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  const payload = {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    propertyAddress: form.propertyAddress.value.trim(),
    borough: form.borough.value,
    message: form.message.value.trim(),
    website: form.website.value // honeypot — always empty for real visitors
  };

  fetch(API_BASE + "/api/consultation-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(function (res) {
      if (res.status === 400) {
        return res.json().then(function (data) {
          Object.keys(data.errors || {}).forEach(function (fieldId) {
            setFieldError(fieldId, data.errors[fieldId]);
          });
          throw new Error("validation");
        });
      }
      if (!res.ok) {
        throw new Error("server");
      }
      return res.json();
    })
    .then(function () {
      successMsg.hidden = false;
      form.reset();
      setTimeout(function () {
        closeModal();
        successMsg.hidden = true;
      }, 2200);
    })
    .catch(function (err) {
      if (err.message !== "validation") {
        setFieldError("message", "Something went wrong submitting your request. Please try again or call directly.");
      }
    })
    .finally(function () {
      submitBtn.disabled = false;
    });
});
```

This stays vanilla JS (just `fetch`/`Promise`, both native) — no new frontend dependency, consistent with CLAUDE.md.

## 8. Honeypot field

Add one hidden field to the form in `index.html`, positioned off-screen rather than `display:none` (some bots skip fields hidden that obviously):

```html
<div class="form-row" aria-hidden="true" style="position: absolute; left: -9999px;">
  <label for="website">Leave this field blank</label>
  <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
</div>
```

This alone stops the large majority of unsophisticated form-spam bots without adding a CAPTCHA dependency or third-party script — appropriate for a low-traffic consultant site where a CAPTCHA's friction cost likely isn't worth it yet.

## 9. Environment, secrets, and `.gitignore`

The repo currently has no `.gitignore`. Adding the backend means adding one:

```
server/node_modules/
server/.env
server/data/
```

`server/.env` holds `DATABASE_PATH`/`ALLOWED_ORIGIN` (nothing more sensitive at this stage since SQLite needs no connection secret); `server/data/` is where the actual SQLite file lands, which is real customer PII and should never be committed.

## 10. Security & data-handling notes

- **Server-side validation is mandatory**, not optional — §6's `validate.js` duplicates the client rules specifically because a `curl -X POST` bypasses `app.js` entirely.
- **Parameterized queries only** — `better-sqlite3`'s `.run({...})` with named params (as written above) avoids string-concatenation SQL injection; never build the INSERT by concatenating field values into a query string.
- **CORS**: locked to `ALLOWED_ORIGIN` (the site's own domain) once that's known, so the endpoint can't be casually called from other sites.
- **PII retention**: `full_name`, `email`, `phone`, and `property_address` are personal data. Worth deciding a retention/deletion policy (e.g., purge `status = 'closed'` rows after N months) before this goes live — not implemented in this plan, flagged as a decision for you.
- **Logging**: don't log full request bodies in production (they contain the same PII) — log request outcome/status only.

## 11. Local dev / rollout checklist

1. `cd server && npm install`
2. `cp .env.example .env` and fill in `DATABASE_PATH` (a relative path is fine for local dev) — leave `ALLOWED_ORIGIN` unset locally to skip CORS restriction
3. `npm start` — first run creates `server/data/consultations.db` and applies `schema.sql` automatically
4. Smoke test without touching the UI: `curl -X POST http://localhost:3001/api/consultation-requests -H "Content-Type: application/json" -d '{"fullName":"Test","email":"test@example.com","propertyAddress":"1 Test St","message":"hi","website":""}'`
5. Wire in the `app.js`/`index.html` changes from §7–8, point `API_BASE` at `http://localhost:3001` for local testing against a separately-served frontend
6. Decide hosting (§3) and set real `ALLOWED_ORIGIN`/`DATABASE_PATH` for production
7. Update CLAUDE.md's form-validation architecture note — it currently says "there is no backend endpoint wired up," which becomes stale once this ships

## 12. Explicitly out of scope for this plan

These are natural next questions but weren't asked for here, so they're called out rather than assumed:

- **Notifying you of new leads** (email/SMS on submission) — currently you'd have to query the DB to see new rows. A transactional email step (e.g. via a provider's HTTP API) could hang off the same route handler in §6 as a follow-up.
- **An admin view** to list/update `status` on requests — right now that's direct DB access (`sqlite3 server/data/consultations.db`) or a manual query.
- **Migrating off SQLite to Postgres** — only worth doing if/when volume or multi-instance hosting demands it; the schema and query layer here are simple enough that the migration is mostly copy-paste, not a rewrite.
