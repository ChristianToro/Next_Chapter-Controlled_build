const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./helpers/loadPage");

function fillValidForm(document) {
  document.getElementById("fullName").value = "Jane Doe";
  document.getElementById("email").value = "jane@example.com";
  document.getElementById("propertyAddress").value = "123 Main St, Brooklyn, NY";
  document.getElementById("message").value = "Need help with an HPD violation.";
}

function submit(document) {
  const form = document.getElementById("consultForm");
  form.dispatchEvent(new document.defaultView.Event("submit", { bubbles: true, cancelable: true }));
}

function blur(document, fieldId) {
  const input = document.getElementById(fieldId);
  input.dispatchEvent(new document.defaultView.Event("blur", { bubbles: true }));
}

function errorText(document, fieldId) {
  return document.getElementById("err-" + fieldId).textContent;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function hasErrorClass(document, fieldId) {
  return document.getElementById(fieldId).closest(".form-row").classList.contains("has-error");
}

test("submitting a completely empty form blocks submission and flags every required field", () => {
  const dom = loadPage();
  const { document } = dom.window;
  let fetchCalled = false;
  dom.window.fetch = () => { fetchCalled = true; };

  submit(document);

  assert.equal(fetchCalled, false);
  for (const field of ["fullName", "email", "propertyAddress", "message"]) {
    assert.equal(errorText(document, field), "This field is required.");
    assert.equal(hasErrorClass(document, field), true);
  }
});

test("phone and borough are not required and are not flagged when empty", () => {
  const dom = loadPage();
  const { document } = dom.window;
  dom.window.fetch = () => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) });

  fillValidForm(document);
  submit(document);

  assert.equal(errorText(document, "phone"), "");
  assert.equal(hasErrorClass(document, "phone"), false);
});

test("an invalid email format is rejected client-side without a network call", () => {
  const dom = loadPage();
  const { document } = dom.window;
  let fetchCalled = false;
  dom.window.fetch = () => { fetchCalled = true; };

  fillValidForm(document);
  document.getElementById("email").value = "not-an-email";
  submit(document);

  assert.equal(fetchCalled, false);
  assert.equal(errorText(document, "email"), "Please enter a valid email address.");
});

test("blurring an empty required field shows an inline error without submitting", () => {
  const dom = loadPage();
  const { document } = dom.window;

  blur(document, "fullName");

  assert.equal(errorText(document, "fullName"), "This field is required.");
  assert.equal(hasErrorClass(document, "fullName"), true);
});

test("blurring a field after fixing it clears its error", () => {
  const dom = loadPage();
  const { document } = dom.window;

  blur(document, "email");
  assert.equal(errorText(document, "email"), "This field is required.");

  document.getElementById("email").value = "jane@example.com";
  blur(document, "email");

  assert.equal(errorText(document, "email"), "");
  assert.equal(hasErrorClass(document, "email"), false);
});

test("a valid submission posts the expected payload, including an empty honeypot field", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  let request = null;
  dom.window.fetch = (url, opts) => {
    request = { url, opts };
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 1, createdAt: "now" }) });
  };

  fillValidForm(document);
  document.getElementById("borough").value = "brooklyn";
  submit(document);
  await flush(); // flush the fetch().then() microtask chain

  assert.equal(request.url, "/api/consultation-requests");
  assert.equal(request.opts.method, "POST");
  assert.equal(request.opts.headers["Content-Type"], "application/json");

  const body = JSON.parse(request.opts.body);
  assert.equal(body.fullName, "Jane Doe");
  assert.equal(body.email, "jane@example.com");
  assert.equal(body.borough, "brooklyn");
  assert.equal(body.website, "");
});

test("the submit button is disabled while the request is in flight and re-enabled after", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  let resolveFetch;
  dom.window.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

  fillValidForm(document);
  submit(document);

  const submitBtn = document.querySelector("#consultForm button[type=submit]");
  assert.equal(submitBtn.disabled, true);

  resolveFetch({ ok: true, status: 201, json: () => Promise.resolve({}) });
  await flush();

  assert.equal(submitBtn.disabled, false);
});

test("on success, shows the success message and resets the form fields", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  dom.window.fetch = () => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 1, createdAt: "now" }) });

  fillValidForm(document);
  submit(document);
  await flush();

  assert.equal(document.getElementById("formSuccess").hidden, false);
  assert.equal(document.getElementById("fullName").value, "");
  assert.equal(document.getElementById("message").value, "");
});

test("a 400 response feeds the server's per-field errors into the same error spans as client validation", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  dom.window.fetch = () => Promise.resolve({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ errors: { email: "Please enter a valid email address." } })
  });

  fillValidForm(document);
  submit(document);
  await flush();

  assert.equal(errorText(document, "email"), "Please enter a valid email address.");
  assert.equal(document.getElementById("formSuccess").hidden, true);
});

test("a non-ok, non-400 response (e.g. a wrong-origin 501/500) shows the generic failure message", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  dom.window.fetch = () => Promise.resolve({ ok: false, status: 501, json: () => Promise.resolve({}) });

  fillValidForm(document);
  submit(document);
  await flush();

  assert.equal(
    errorText(document, "message"),
    "Something went wrong submitting your request. Please try again or call directly."
  );
});

test("a rejected fetch (network failure) shows the generic failure message and re-enables the button", async () => {
  const dom = loadPage();
  const { document } = dom.window;
  dom.window.fetch = () => Promise.reject(new Error("network down"));

  fillValidForm(document);
  submit(document);
  await flush();

  assert.equal(
    errorText(document, "message"),
    "Something went wrong submitting your request. Please try again or call directly."
  );
  const submitBtn = document.querySelector("#consultForm button[type=submit]");
  assert.equal(submitBtn.disabled, false);
});
