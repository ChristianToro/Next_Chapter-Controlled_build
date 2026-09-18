const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_JS = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

// index.html loads app.js via a <script src="app.js"> tag, but JSDOM does not
// fetch external scripts by default. Load the markup without executing that
// tag, then eval app.js's own source directly into the window so it runs
// exactly as it does in a real browser, against real DOM elements.
// jsdom does not implement the browser's standard `form.fieldName` named
// -property access for form controls (only `form.elements.namedItem(name)`).
// app.js relies on the real, standard behavior, so shim it onto every <form>
// before app.js runs. Test-only — does not touch app.js or index.html.
function patchFormNamedAccess(document) {
  document.querySelectorAll("form").forEach(function (form) {
    Array.from(form.elements).forEach(function (el) {
      const name = el.name;
      if (!name || name in form) return;
      Object.defineProperty(form, name, {
        get: function () { return form.elements.namedItem(name); },
        configurable: true
      });
    });
  });
}

function loadPage() {
  const dom = new JSDOM(HTML, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });

  patchFormNamedAccess(dom.window.document);
  dom.window.eval(APP_JS);

  return dom;
}

module.exports = { loadPage };
