// ============================================================
// src/server.js
// Main server — Express + Cron Scheduler
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");
const logger = require("./middleware/logger");
const apiRoutes = require("./routes/api");
const syncService = require("./services/syncService");
const notifyService = require("./services/notifyService");

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5500"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Serve exported files
app.use("/exports", express.static(path.join(__dirname, "../exports")));

// ============================================================
// ROUTES
// ============================================================

app.use("/api", apiRoutes);

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ============================================================
// CRON SCHEDULER — Auto sync Meta data
// ============================================================

const SYNC_SCHEDULE = process.env.SYNC_SCHEDULE || "0 */6 * * *";

cron.schedule(SYNC_SCHEDULE, async () => {
  logger.info(`⏰ Cron triggered: ${new Date().toLocaleString("id-ID")} — ${SYNC_SCHEDULE}`);

  try {
    const result = await syncService.syncAllClients("last_30d");
    logger.info(`Cron sync selesai: ${result.success} berhasil, ${result.errors} gagal`);

    // Kirim daily summary ke Slack (jam 8 pagi)
    const hour = new Date().getHours();
    if (hour === 8) {
      await notifyService.sendDailySummary(result);
    }
  } catch (err) {
    logger.error(`Cron sync gagal: ${err.message}`);
  }
}, {
  timezone: "Asia/Jakarta"
});

logger.info(`✅ Cron scheduler aktif: "${SYNC_SCHEDULE}" (WIB)`);

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, async () => {
  logger.info(`
╔══════════════════════════════════════════════════╗
║         PM Dashboard — Backend Server            ║
║──────────────────────────────────────────────────║
║  URL    : http://localhost:${PORT}                ║
║  Env    : ${(process.env.NODE_ENV || "development").padEnd(38)}║
║  Cron   : ${SYNC_SCHEDULE.padEnd(38)}║
╚══════════════════════════════════════════════════╝
  `);

  // Jalankan sync pertama saat server start (jika ada token)
  if (process.env.META_ACCESS_TOKEN && process.env.META_ACCESS_TOKEN !== "your_long_lived_token_here") {
    logger.info("Menjalankan initial sync...");
    try {
      await syncService.syncAllClients("last_30d");
      logger.info("Initial sync selesai!");
    } catch (err) {
      logger.warn(`Initial sync gagal (mungkin token belum diset): ${err.message}`);
    }
  } else {
    logger.warn("META_ACCESS_TOKEN belum dikonfigurasi. Set di file .env untuk enable auto-sync.");
  }
});

module.exports = app;
