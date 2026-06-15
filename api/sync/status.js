// api/sync/status.js
// GET /api/sync/status

const { cors } = require("../../lib/cors");
const db = require("../../lib/supabase");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { data: logs } = await db.supabase
      .from("sync_log")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(5);

    res.json({
      success: true,
      lastSync: logs?.[0]?.synced_at || null,
      recentLogs: logs || []
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
