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
