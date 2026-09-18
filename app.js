(function () {
  "use strict";

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Coverage regions ---------- */

  const coverageData = {
    nyc: {
      name: "NYC",
      title: "Five boroughs, one clear plan.",
      detail: "Local guidance for owners and managers navigating filings, inspections, notices, and the city's moving compliance calendar.",
      services: "Annual property filings, Housing maintenance standards, DHCR and HPD notices, same day response"
    },
    westchester: {
      name: "Westchester",
      title: "The close-in suburbs.",
      detail: "Practical oversight for rental homes, co-ops, and multi-family properties in Westchester County.",
      services: "Rental property readiness, Municipal requirements, Vendor coordination, same day response"
    },
    "long-island": {
      name: "Long Island",
      title: "From the North Shore to the forks.",
      detail: "A second set of eyes on the requirements that follow a property beyond city limits.",
      services: "Town and village filings, Pre-sale preparation, Property record review, 1-2 day response"
    }
  };

  const regionButtons = document.querySelectorAll(".region-button");
  const regionDetailCard = document.getElementById("mapPanel");
  const regionShort = document.getElementById("region-short");
  const regionTitle = document.getElementById("region-title");
  const regionDetailText = document.getElementById("region-detail");
  const regionPoints = document.getElementById("region-points");

  function renderRegion(data) {
    regionShort.textContent = data.name;
    regionTitle.textContent = data.title;
    regionDetailText.textContent = data.detail;
    regionPoints.innerHTML = data.services
      .split(", ")
      .map(function (point) { return "<span>✓ " + point + "</span>"; })
      .join("");
  }

  function selectRegion(regionId) {
    regionButtons.forEach(function (button) {
      const isSelected = button.getAttribute("data-region") === regionId;
      button.classList.toggle("is-active", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });

    regionDetailCard.classList.toggle("detail-top-left", regionId === "long-island");
  }

  function updateRegion(regionId) {
    const data = coverageData[regionId];
    if (!data) return;

    regionDetailCard.classList.add("is-changing");
    selectRegion(regionId);

    setTimeout(function () {
      renderRegion(data);
      regionDetailCard.classList.remove("is-changing");
    }, 160);
  }

  regionButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      updateRegion(button.getAttribute("data-region"));
    });
  });

  renderRegion(coverageData.nyc);
  selectRegion("nyc");

  /* ---------- Modal ---------- */

  const overlay = document.getElementById("modalOverlay");
  const openTriggers = document.querySelectorAll("[data-open-modal]");
  const closeBtn = document.getElementById("modalClose");
  const form = document.getElementById("consultForm");
  const successMsg = document.getElementById("formSuccess");
  let lastFocusedEl = null;

  function openModal() {
    lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    const firstField = document.getElementById("fullName");
    if (firstField) firstField.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKeydown);
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      closeModal();
    }
  }

  openTriggers.forEach(function (btn) {
    btn.addEventListener("click", openModal);
  });

  closeBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      closeModal();
    }
  });

  /* ---------- Form validation ---------- */

  const requiredFields = ["fullName", "email", "propertyAddress", "message"];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById("err-" + fieldId);
    const row = input.closest(".form-row");

    if (message) {
      row.classList.add("has-error");
      errorEl.textContent = message;
    } else {
      row.classList.remove("has-error");
      errorEl.textContent = "";
    }
  }

  function validateForm() {
    let isValid = true;

    requiredFields.forEach(function (fieldId) {
      const input = document.getElementById(fieldId);
      const value = input.value.trim();

      if (!value) {
        setFieldError(fieldId, "This field is required.");
        isValid = false;
      } else if (fieldId === "email" && !emailPattern.test(value)) {
        setFieldError(fieldId, "Please enter a valid email address.");
        isValid = false;
      } else {
        setFieldError(fieldId, "");
      }
    });

    return isValid;
  }

  ["fullName", "email", "propertyAddress", "message"].forEach(function (fieldId) {
    const input = document.getElementById(fieldId);
    input.addEventListener("blur", function () {
      const value = input.value.trim();
      if (!value) {
        setFieldError(fieldId, "This field is required.");
      } else if (fieldId === "email" && !emailPattern.test(value)) {
        setFieldError(fieldId, "Please enter a valid email address.");
      } else {
        setFieldError(fieldId, "");
      }
    });
  });

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

})();
