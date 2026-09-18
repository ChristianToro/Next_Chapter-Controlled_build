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
