require("dotenv").config();
const express = require("express");
const path = require("path");
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

// Serve the static site from the same origin as the API, so the form's
// same-origin fetch to /api/... works without CORS. Only the site's own files
// are exposed — never server/, its SQLite data, or repo docs.
const siteRoot = path.join(__dirname, "..");
app.get("/", function (req, res) {
  res.sendFile(path.join(siteRoot, "index.html"));
});
["index.html", "app.js", "styles.css"].forEach(function (file) {
  app.get("/" + file, function (req, res) {
    res.sendFile(path.join(siteRoot, file));
  });
});
app.use("/assets", express.static(path.join(siteRoot, "assets")));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3001;
  app.listen(port, function () {
    console.log("API listening on port " + port);
  });
}
