(function () {
  "use strict";

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Coverage map ---------- */

  var coverageData = {
    manhattan: {
      name: "Manhattan",
      response: "Same-day to 1 business day",
      services: "Violation remediation, facade (FISP/LL11) filings, permit filings"
    },
    brooklyn: {
      name: "Brooklyn",
      response: "1 business day",
      services: "Violation remediation, compliance audits, HPD registrations"
    },
    queens: {
      name: "Queens",
      response: "1 business day",
      services: "Violation remediation, permit filings, inspection prep"
    },
    bronx: {
      name: "Bronx",
      response: "1 business day",
      services: "Violation remediation, HPD registrations, compliance audits"
    },
    "staten-island": {
      name: "Staten Island",
      response: "1-2 business days",
      services: "Compliance audits, permit filings, inspection prep"
    },
    nassau: {
      name: "Nassau County",
      response: "1-2 business days",
      services: "Compliance audits, inspection prep, local permit filings"
    },
    suffolk: {
      name: "Suffolk County",
      response: "2-3 business days",
      services: "Compliance audits, inspection prep"
    },
    westchester: {
      name: "Westchester County",
      response: "1-2 business days",
      services: "Compliance audits, permit filings, inspection prep"
    },
    rockland: {
      name: "Rockland County",
      response: "1-2 business days",
      services: "Compliance audits, inspection prep"
    }
  };

  var regions = document.querySelectorAll(".region");
  var panelTitle = document.getElementById("mapPanelTitle");
  var panelBody = document.getElementById("mapPanelBody");
  var selectedRegion = null;

  function showRegion(el) {
    var key = el.getAttribute("data-region");
    var data = coverageData[key];
    if (!data) return;

    if (selectedRegion) {
      selectedRegion.classList.remove("is-selected");
    }
    el.classList.add("is-selected");
    selectedRegion = el;

    panelTitle.textContent = data.name;
    panelBody.innerHTML =
      '<span class="panel-meta">Typical response: ' + data.response + "</span><br><br>" +
      data.services;
  }

  regions.forEach(function (region) {
    region.setAttribute("tabindex", "0");
    region.setAttribute("role", "button");

    region.addEventListener("click", function () {
      showRegion(region);
    });

    region.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showRegion(region);
      }
    });

    region.addEventListener("mouseenter", function () {
      var key = region.getAttribute("data-region");
      var data = coverageData[key];
      if (data) {
        panelTitle.textContent = data.name;
        panelBody.innerHTML =
          '<span class="panel-meta">Typical response: ' + data.response + "</span><br><br>" +
          data.services;
      }
    });

    region.addEventListener("mouseleave", function () {
      if (selectedRegion) {
        showRegion(selectedRegion);
      } else {
        panelTitle.textContent = "Select a region";
        panelBody.textContent =
          "Hover or tap any highlighted area on the map to view coverage details, typical response time, and services offered in that county or borough.";
      }
    });
  });

  /* ---------- Modal ---------- */

  var overlay = document.getElementById("modalOverlay");
  var openTriggers = document.querySelectorAll("[data-open-modal]");
  var closeBtn = document.getElementById("modalClose");
  var form = document.getElementById("consultForm");
  var successMsg = document.getElementById("formSuccess");
  var lastFocusedEl = null;

  function openModal() {
    lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    var firstField = document.getElementById("fullName");
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

  var requiredFields = ["fullName", "email", "propertyAddress", "message"];
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldError(fieldId, message) {
    var input = document.getElementById(fieldId);
    var errorEl = document.getElementById("err-" + fieldId);
    var row = input.closest(".form-row");

    if (message) {
      row.classList.add("has-error");
      errorEl.textContent = message;
    } else {
      row.classList.remove("has-error");
      errorEl.textContent = "";
    }
  }

  function validateForm() {
    var isValid = true;

    requiredFields.forEach(function (fieldId) {
      var input = document.getElementById(fieldId);
      var value = input.value.trim();

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
    var input = document.getElementById(fieldId);
    input.addEventListener("blur", function () {
      var value = input.value.trim();
      if (!value) {
        setFieldError(fieldId, "This field is required.");
      } else if (fieldId === "email" && !emailPattern.test(value)) {
        setFieldError(fieldId, "Please enter a valid email address.");
      } else {
        setFieldError(fieldId, "");
      }
    });
  });

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

})();
