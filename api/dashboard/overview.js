// api/dashboard/overview.js
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

    const sum  = (arr, path) => arr.reduce((s, o) => s + (path.split(".").reduce((x,k) => x?.[k], o) || 0), 0);
    const avg2 = (arr, path) => arr.length ? sum(arr, path) / arr.length : 0;

    const totalBudget    = clients.reduce((s, c) => s + (c.budget || 0), 0);
    const totalSpend     = sum(insights, "ads.spend");
    const totalLeads     = sum(insights, "ads.leads");
    const totalFollowers = sum(insights, "social.current.followers");
    const totalReach     = sum(insights, "social.current.reach");
    const totalViews     = sum(insights, "social.current.views");
    const totalLinkTaps  = sum(insights, "social.current.extLinkTaps");
    const avgEngRate     = +avg2(insights, "social.current.engRate").toFixed(2);
    const avgScore       = Math.round(avg2(insights, "overall_score"));
    const atRisk         = insights.filter(i => (i.overall_score || 0) < 60).length;

    // Content summary bulan ini
    const contentPosts = await db.getAllContentPosts(yearMonth).catch(() => []);
    const contentByType = { feed:0, carousel:0, reel:0, story:0 };
    contentPosts.forEach(p => { contentByType[p.type] = (contentByType[p.type]||0)+1; });

    res.json({
      success: true,
      data: {
        yearMonth,
        totalClients:    clients.length,
        activeClients:   clients.filter(c => c.status === "Active").length,
        totalBudget,
        totalSpend:      Math.round(totalSpend),
        totalLeads,
        totalFollowers,
        totalReach,
        totalViews,
        totalLinkTaps,
        avgEngRate,
        avgScore,
        atRisk,
        content: {
          total:    contentPosts.length,
          feeds:    contentByType.feed + contentByType.carousel,
          reels:    contentByType.reel,
          stories:  contentByType.story,
          byType:   contentByType
        },
        lastSync: insights[0]?.synced_at || null
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
