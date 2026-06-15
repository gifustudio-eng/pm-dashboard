// api/health.js
// GET /api/health — cek status server

const { cors } = require("../lib/cors");

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  res.json({
    status: "ok",
    version: "4.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "production",
    supabase: !!process.env.SUPABASE_URL,
    meta: !!process.env.META_ACCESS_TOKEN
  });
};
