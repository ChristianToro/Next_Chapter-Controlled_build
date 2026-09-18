const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConsultationRequest } = require("../validate");

function validBody(overrides) {
  return Object.assign(
    {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      propertyAddress: "123 Main St, Brooklyn, NY",
      borough: "brooklyn",
      message: "Need help with an HPD violation."
    },
    overrides
  );
}

test("returns no errors for a fully valid submission", () => {
  const errors = validateConsultationRequest(validBody());
  assert.deepEqual(errors, {});
});

test("returns no errors when optional fields are omitted", () => {
  const errors = validateConsultationRequest(
    validBody({ phone: undefined, borough: undefined })
  );
  assert.deepEqual(errors, {});
});

for (const field of ["fullName", "email", "propertyAddress", "message"]) {
  test(`flags a missing required field: ${field}`, () => {
    const errors = validateConsultationRequest(validBody({ [field]: "" }));
    assert.equal(errors[field], "This field is required.");
  });

  test(`flags a whitespace-only required field: ${field}`, () => {
    const errors = validateConsultationRequest(validBody({ [field]: "   " }));
    assert.equal(errors[field], "This field is required.");
  });
}

test("does not flag optional fields (phone, borough) as required", () => {
  const errors = validateConsultationRequest(validBody({ phone: "" }));
  assert.equal(errors.phone, undefined);
});

test("flags a malformed email address", () => {
  const errors = validateConsultationRequest(validBody({ email: "not-an-email" }));
  assert.equal(errors.email, "Please enter a valid email address.");
});

test("accepts a well-formed email address", () => {
  const errors = validateConsultationRequest(validBody({ email: "a.b+c@sub.example.co" }));
  assert.equal(errors.email, undefined);
});

test("an empty email is reported as required, not as malformed", () => {
  const errors = validateConsultationRequest(validBody({ email: "" }));
  assert.equal(errors.email, "This field is required.");
});

test("flags a borough value outside the known list", () => {
  const errors = validateConsultationRequest(validBody({ borough: "manhattan-ish" }));
  assert.equal(errors.borough, "Please choose a valid borough or county.");
});

test("accepts every borough value the <select> in index.html offers", () => {
  const boroughs = [
    "manhattan", "brooklyn", "queens", "bronx", "staten-island",
    "nassau", "suffolk", "westchester", "rockland", "other"
  ];
  for (const borough of boroughs) {
    const errors = validateConsultationRequest(validBody({ borough }));
    assert.equal(errors.borough, undefined, `expected "${borough}" to be accepted`);
  }
});

test("an empty borough is accepted (it is optional)", () => {
  const errors = validateConsultationRequest(validBody({ borough: "" }));
  assert.equal(errors.borough, undefined);
});

test("reports every missing required field at once", () => {
  const errors = validateConsultationRequest({});
  assert.deepEqual(Object.keys(errors).sort(), ["email", "fullName", "message", "propertyAddress"]);
});
