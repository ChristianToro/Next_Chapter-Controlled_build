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
