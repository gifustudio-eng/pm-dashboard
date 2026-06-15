// api/content/kpi.js
// GET  /api/content/kpi?clientId=1&yearMonth=2026-06
// POST /api/content/kpi  (upsert target KPI konten)

const { cors } = require("../../lib/cors");
const db = require("../../lib/supabase");

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET — ambil KPI target
  if (req.method === "GET") {
    const { clientId, yearMonth } = req.query;
    if (!clientId || !yearMonth) {
      return res.status(400).json({ success: false, error: "clientId and yearMonth required" });
    }
    try {
      const data = await db.getContentKPI(+clientId, yearMonth);
      if (!data) return res.json({ success: true, data: null, message: "No KPI set for this period" });
      return res.json({
        success: true,
        data: {
          clientId:  data.client_id,
          yearMonth: data.year_month,
          total:  data.total_target,
          feed:   data.feed_target,
          reel:   data.reel_target,
          story:  data.story_target,
          freq:   data.freq_per_week,
          note:   data.note,
          updatedAt: data.updated_at
        }
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // GET all clients for one month
  if (req.method === "GET" && req.query.yearMonth && !req.query.clientId) {
    try {
      const data = await db.getAllContentKPI(req.query.yearMonth);
      return res.json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // POST — upsert KPI target
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { clientId, yearMonth } = body;
    if (!clientId || !yearMonth) {
      return res.status(400).json({ success: false, error: "clientId and yearMonth required" });
    }
    try {
      await db.upsertContentKPI(+clientId, yearMonth, body);
      return res.json({ success: true, message: `KPI untuk ${yearMonth} berhasil disimpan` });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
