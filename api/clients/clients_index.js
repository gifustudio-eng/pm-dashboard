// api/clients/index.js
// GET  /api/clients        — list semua client
// POST /api/clients        — tambah client baru
// PUT  /api/clients?id=N   — update client
// GET  /api/clients?id=N   — satu client

const { cors } = require("../../lib/cors");
const db = require("../../lib/supabase");

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  // GET one client
  if (req.method === "GET" && req.query.id) {
    try {
      const client = await db.getClientById(+req.query.id);
      const yearMonth = new Date().toISOString().slice(0, 7);
      const insights = await db.getInsights(client.id, yearMonth);
      return res.json({ success: true, data: { ...client, insights } });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // GET all clients
  if (req.method === "GET") {
    try {
      const yearMonth = new Date().toISOString().slice(0, 7);
      const [clients, allInsights] = await Promise.all([
        db.getAllClients(),
        db.getAllInsights(yearMonth)
      ]);
      const insightMap = {};
      allInsights.forEach(i => { insightMap[i.client_id] = i; });

      const data = clients.map(c => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        pic: c.pic,
        budget: c.budget,
        metaId: c.meta_ad_account_id,
        facebookPageId: c.facebook_page_id,
        instagramUserId: c.instagram_user_id,
        color: c.color,
        status: c.status,
        kpiTargets: c.kpi_targets,
        insights: insightMap[c.id] || null,
        syncedAt: insightMap[c.id]?.synced_at || null
      }));
      return res.json({ success: true, data, total: data.length });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // POST — tambah client baru
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    try {
      const client = await db.insertClient(body);
      return res.status(201).json({ success: true, data: client });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // PUT — update client
  if (req.method === "PUT" && req.query.id) {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    try {
      const client = await db.updateClient(+req.query.id, body);
      return res.json({ success: true, data: client });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // DELETE — hapus client
  if (req.method === "DELETE" && req.query.id) {
    try {
      await db.deleteClient(+req.query.id);
      return res.json({ success: true, message: "Client berhasil dihapus" });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
