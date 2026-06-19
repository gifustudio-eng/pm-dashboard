// api/kpi/summary.js
// GET /api/kpi/summary — ringkasan KPI achievement per client bulan ini

const { cors } = require("../../lib/cors");
const db = require("../../lib/supabase");

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const yearMonth = new Date().toISOString().slice(0, 7);
    const [clients, insights] = await Promise.all([
      db.getAllClients(),
      db.getAllInsights(yearMonth)
    ]);

    const insightMap = {};
    insights.forEach(i => { insightMap[i.client_id] = i; });

    const data = clients.map(c => {
      const insight = insightMap[c.id] || null;
      return {
        clientId: c.id,
        name: c.name,
        overallScore: insight?.overall_score || 0,
        ads: insight?.ads || null,
        status: !insight ? "No Data"
          : insight.overall_score >= 80 ? "On Track"
          : insight.overall_score >= 60 ? "At Risk"
          : "Critical"
      };
    });

    return res.json({ success: true, data, yearMonth });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
