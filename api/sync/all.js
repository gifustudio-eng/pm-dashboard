// api/sync/all.js
// Dipanggil oleh: POST /api/sync/all (manual)
// Juga dipanggil oleh Vercel Cron setiap 6 jam (GET)
// Dan oleh GitHub Actions (POST dengan Authorization header)

const { cors }  = require("../../lib/cors");
const db         = require("../../lib/supabase");
const { fetchAccountInsights, parseInsights } = require("../../lib/metaApi");

// In-memory sync status (per cold start — Vercel functions stateless)
let lastSync = null;
let isRunning = false;

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check untuk cron via GitHub Actions
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    // Vercel Cron mengirim header khusus — izinkan jika dari Vercel
    const isVercelCron = req.headers["x-vercel-cron"] === "1";
    if (!isVercelCron && req.method === "GET") {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (isRunning) {
    return res.json({ success: true, message: "Sync already running", lastSync });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const days = body.days || 30;
  const datePreset = body.datePreset || `last_${days}d`;
  const yearMonth  = new Date().toISOString().slice(0, 7);

  // Respond immediately — Vercel Functions timeout 30s
  res.json({
    success: true,
    message: "Sync started",
    datePreset,
    startedAt: new Date().toISOString()
  });

  // Run sync async (fire-and-forget setelah response dikirim)
  isRunning = true;
  const startTime = Date.now();
  const results = [], errors = [];

  try {
    const clients = await db.getAllClients();

    for (const client of clients) {
      try {
        // Meta Ads Insights
        const raw = await fetchAccountInsights(client.meta_ad_account_id, datePreset);
        const adsData = parseInsights(raw, { kpiTargets: client.kpi_targets });

        // Social Insights (jika ada Page/IG ID)
        let socialData = { social: {}, comparison: {} };
        if (client.facebook_page_id || client.instagram_user_id) {
          try {
            const { fetchAllInsights } = require("../../lib/metaSocial");
            const result = await fetchAllInsights({
              id: client.id, name: client.name,
              metaAdAccountId: client.meta_ad_account_id,
              facebookPageId:  client.facebook_page_id,
              instagramUserId: client.instagram_user_id,
              kpiTargets: client.kpi_targets
            }, days);
            socialData = result;
          } catch (se) {
            console.warn(`Social insights skip ${client.name}:`, se.message);
          }
        }

        // Simpan ke Supabase
        await db.upsertInsights(client.id, yearMonth, {
          social:       socialData.social,
          ads:          adsData.summary,
          comparison:   socialData.comparison,
          overallScore: adsData.overallScore,
          datePreset
        });

        results.push({ clientId: client.id, name: client.name, ok: true, score: adsData.overallScore });

        // KPI alert via Slack jika score rendah
        if (adsData.overallScore < 60 && process.env.SLACK_WEBHOOK_URL) {
          sendSlackAlert(client.name, adsData.overallScore).catch(() => {});
        }

      } catch (e) {
        console.error(`Sync error ${client.name}:`, e.message);
        errors.push({ clientId: client.id, name: client.name, error: e.message });
      }

      // Rate limit buffer
      await new Promise(r => setTimeout(r, 400));
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    await db.insertSyncLog({ total: clients.length, success: results.length, errors: errors.length, duration, notes: `datePreset: ${datePreset}` });

    lastSync = new Date().toISOString();
    console.log(`Sync done: ${results.length} ok, ${errors.length} fail, ${duration}s`);

  } catch (e) {
    console.error("Sync fatal error:", e.message);
  } finally {
    isRunning = false;
  }
};

async function sendSlackAlert(clientName, score) {
  const axios = require("axios");
  await axios.post(process.env.SLACK_WEBHOOK_URL, {
    text: `⚠️ *KPI Alert*: ${clientName} — Score hanya *${score}%* dari target. Perlu perhatian segera!`
  });
}
