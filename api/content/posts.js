// api/content/posts.js
// GET    /api/content/posts?clientId=1&yearMonth=2026-06
// POST   /api/content/posts                     (body: post object)
// PUT    /api/content/posts?id=uuid             (body: updates)
// DELETE /api/content/posts?id=uuid

const { cors } = require("../../lib/cors");
const db = require("../../lib/supabase");

module.exports = async (req, res) => {
  if (cors(req, res)) return;

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  // GET — ambil posts per client per bulan
  if (req.method === "GET") {
    const { clientId, yearMonth } = req.query;
    if (!clientId || !yearMonth) {
      return res.status(400).json({ success: false, error: "clientId and yearMonth required" });
    }
    try {
      const data = await db.getContentPosts(+clientId, yearMonth);
      // Format untuk kompatibilitas dengan frontend
      const formatted = data.map(p => ({
        id:       p.id,
        clientId: p.client_id,
        type:     p.type,
        title:    p.title,
        date:     p.post_date,
        platform: p.platform,
        likes:    p.likes,
        comments: p.comments,
        reach:    p.reach,
        views:    p.views,
        note:     p.note,
        createdAt: p.created_at
      }));
      return res.json({ success: true, data: formatted, total: formatted.length });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // GET all — /api/content/posts?yearMonth=2026-06 (tanpa clientId)
  if (req.method === "GET" && req.query.yearMonth && !req.query.clientId) {
    try {
      const data = await db.getAllContentPosts(req.query.yearMonth);
      return res.json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // POST — tambah post baru
  if (req.method === "POST") {
    const { clientId, type, title, date } = body;
    if (!clientId || !type || !title || !date) {
      return res.status(400).json({ success: false, error: "clientId, type, title, date are required" });
    }
    try {
      const post = await db.insertContentPost(body);
      return res.status(201).json({
        success: true,
        data: {
          id: post.id, clientId: post.client_id, type: post.type,
          title: post.title, date: post.post_date, platform: post.platform,
          likes: post.likes, comments: post.comments, reach: post.reach,
          views: post.views, note: post.note, createdAt: post.created_at
        }
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // PUT — update post
  if (req.method === "PUT") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "id required" });
    try {
      const updates = {};
      if (body.type)     updates.type     = body.type;
      if (body.title)    updates.title    = body.title;
      if (body.date)     updates.post_date = body.date;
      if (body.platform) updates.platform = body.platform;
      if (body.likes    !== undefined) updates.likes    = body.likes;
      if (body.comments !== undefined) updates.comments = body.comments;
      if (body.reach    !== undefined) updates.reach    = body.reach;
      if (body.views    !== undefined) updates.views    = body.views;
      if (body.note     !== undefined) updates.note     = body.note;
      const post = await db.updateContentPost(id, updates);
      return res.json({ success: true, data: post });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // DELETE — hapus post
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "id required" });
    try {
      await db.deleteContentPost(id);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
