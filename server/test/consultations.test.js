const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Point the DB at a throwaway file before anything requires ../db, since
// db.js resolves DATABASE_PATH once at module load time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "consultation-db-"));
process.env.DATABASE_PATH = path.join(tmpDir, "consultations.db");

const db = require("../db");
const app = require("../index");
const { resetRateLimit } = require("../rateLimit");

function validPayload(overrides) {
  return Object.assign(
    {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      propertyAddress: "123 Main St, Brooklyn, NY",
      borough: "brooklyn",
      message: "Need help with an HPD violation.",
      website: "" // honeypot, always empty for real visitors
    },
    overrides
  );
}

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  db.exec("DELETE FROM consultation_requests");
  resetRateLimit();
});

function post(body) {
  return fetch(`${baseUrl}/api/consultation-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function countRows() {
  return db.prepare("SELECT COUNT(*) AS n FROM consultation_requests").get().n;
}

test("a valid submission is persisted and returns 201 with an id", async () => {
  const res = await post(validPayload());
  assert.equal(res.status, 201);

  const data = await res.json();
  assert.equal(typeof data.id, "number");
  assert.equal(typeof data.createdAt, "string");

  assert.equal(countRows(), 1);
  const row = db.prepare("SELECT * FROM consultation_requests WHERE id = ?").get(data.id);
  assert.equal(row.full_name, "Jane Doe");
  assert.equal(row.email, "jane@example.com");
  assert.equal(row.borough, "brooklyn");
  assert.equal(row.status, "new");
});

test("fields are trimmed before being stored", async () => {
  const res = await post(validPayload({ fullName: "  Jane Doe  ", message: "  hello  " }));
  assert.equal(res.status, 201);
  const data = await res.json();
  const row = db.prepare("SELECT * FROM consultation_requests WHERE id = ?").get(data.id);
  assert.equal(row.full_name, "Jane Doe");
  assert.equal(row.message, "hello");
});

test("an empty optional phone/borough is stored as null, not an empty string", async () => {
  const res = await post(validPayload({ phone: "", borough: "" }));
  const data = await res.json();
  const row = db.prepare("SELECT * FROM consultation_requests WHERE id = ?").get(data.id);
  assert.equal(row.phone, null);
  assert.equal(row.borough, null);
});

test("rejects a submission missing required fields with 400 and a per-field errors object", async () => {
  const res = await post(validPayload({ fullName: "", email: "" }));
  assert.equal(res.status, 400);

  const data = await res.json();
  assert.equal(data.errors.fullName, "This field is required.");
  assert.equal(data.errors.email, "This field is required.");
  assert.equal(countRows(), 0);
});

test("rejects a malformed email with 400", async () => {
  const res = await post(validPayload({ email: "not-an-email" }));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.errors.email, "Please enter a valid email address.");
  assert.equal(countRows(), 0);
});

test("rejects an unrecognized borough value with 400", async () => {
  const res = await post(validPayload({ borough: "atlantis" }));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.errors.borough, "Please choose a valid borough or county.");
  assert.equal(countRows(), 0);
});

test("a filled-in honeypot field silently no-ops with 204 and writes nothing", async () => {
  const res = await post(validPayload({ website: "http://spam.example" }));
  assert.equal(res.status, 204);
  assert.equal(countRows(), 0);
});

test("the honeypot short-circuit skips validation entirely, even with other fields missing", async () => {
  const res = await post({ website: "spam", fullName: "", email: "" });
  assert.equal(res.status, 204);
  assert.equal(countRows(), 0);
});

test("the 6th request from the same client within the window is rate-limited", async () => {
  for (let i = 0; i < 5; i++) {
    const res = await post(validPayload());
    assert.equal(res.status, 201, `request ${i + 1} should succeed`);
  }
  const limited = await post(validPayload());
  assert.equal(limited.status, 429);
  const data = await limited.json();
  assert.match(data.error, /too many requests/i);
});
