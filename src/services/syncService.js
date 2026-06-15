// ============================================================
// src/services/syncService.js
// Orkestrasi sync data dari Meta untuk semua client
// ============================================================

const NodeCache = require("node-cache");
const logger = require("../middleware/logger");
const metaApi = require("./metaApiService");
const clients = require("../../config/clients");
const notifyService = require("./notifyService");

const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 3600 });

// Track status sync
let syncStatus = {
  lastSync: null,
  nextSync: null,
  isRunning: false,
  lastError: null,
  totalSyncs: 0,
  successCount: 0,
  errorCount: 0
};

/**
 * Sync semua client sekaligus
 */
async function syncAllClients(datePreset = "last_30d", customDates = null) {
  if (syncStatus.isRunning) {
    logger.warn("Sync sudah berjalan, skip request baru");
    return { skipped: true, reason: "Sync already running" };
  }

  syncStatus.isRunning = true;
  syncStatus.totalSyncs++;
  const startTime = Date.now();

  logger.info(`=== MULAI SYNC — ${clients.length} client, preset: ${datePreset} ===`);

  const results = [];
  const errors = [];

  for (const client of clients) {
    try {
      const result = await syncSingleClient(client, datePreset, customDates);
      results.push(result);
      syncStatus.successCount++;

      // Cek KPI alert
      await checkAndNotifyKPI(client, result);

    } catch (error) {
      logger.error(`Sync gagal untuk ${client.name}: ${error.message}`);
      errors.push({ clientId: client.id, clientName: client.name, error: error.message });
      syncStatus.errorCount++;
    }

    // Delay antar request agar tidak kena rate limit Meta
    await sleep(500);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  syncStatus.isRunning = false;
  syncStatus.lastSync = new Date().toISOString();
  syncStatus.lastError = errors.length > 0 ? errors[0].error : null;

  logger.info(`=== SYNC SELESAI — ${results.length} berhasil, ${errors.length} gagal, ${duration}s ===`);

  return {
    success: results.length,
    errors: errors.length,
    duration: `${duration}s`,
    timestamp: syncStatus.lastSync,
    clients: results,
    errorDetails: errors
  };
}

/**
 * Sync satu client spesifik
 */
async function syncSingleClient(client, datePreset = "last_30d", customDates = null) {
  logger.info(`Sync client: ${client.name} (${client.metaAdAccountId})`);

  // Fetch semua data paralel
  const [rawInsights, campaigns, accountInfo] = await Promise.all([
    metaApi.fetchAccountInsights(client.metaAdAccountId, datePreset, customDates),
    metaApi.fetchCampaigns(client.metaAdAccountId),
    metaApi.fetchAccountInfo(client.metaAdAccountId)
  ]);

  // Parse dan kalkulasi KPI
  const insights = metaApi.parseInsights(rawInsights, client);

  const clientData = {
    clientId: client.id,
    clientName: client.name,
    industry: client.industry,
    pic: client.pic,
    budgetPerMonth: client.budgetPerMonth,
    metaAdAccountId: client.metaAdAccountId,
    status: client.status,
    kpiTargets: client.kpiTargets,
    accountInfo,
    insights,
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget,
      lifetimeBudget: c.lifetime_budget,
      startTime: c.start_time,
      stopTime: c.stop_time,
      insights: c.insights?.data?.[0] || {}
    })),
    syncedAt: new Date().toISOString(),
    datePreset: customDates ? "custom" : datePreset
  };

  // Simpan ke cache
  const cacheKey = `client_${client.id}`;
  cache.set(cacheKey, clientData);

  // Simpan ke cache agregat
  updateAggregateCache(client.id, clientData);

  return {
    clientId: client.id,
    clientName: client.name,
    overallScore: insights.overallScore,
    syncedAt: clientData.syncedAt
  };
}

/**
 * Update cache agregat semua client (untuk dashboard overview)
 */
function updateAggregateCache(clientId, newData) {
  let aggregate = cache.get("all_clients") || {};
  aggregate[clientId] = newData;
  cache.set("all_clients", aggregate);
}

/**
 * Cek KPI dan kirim notifikasi jika ada yang di bawah target
 */
async function checkAndNotifyKPI(client, syncResult) {
  if (syncResult.overallScore < 60) {
    logger.warn(`⚠ KPI Alert: ${client.name} score ${syncResult.overallScore}% — di bawah threshold`);
    try {
      await notifyService.sendAlert({
        type: "kpi_warning",
        clientName: client.name,
        score: syncResult.overallScore,
        message: `KPI ${client.name} hanya ${syncResult.overallScore}% dari target. Perlu perhatian segera.`
      });
    } catch (e) {
      logger.warn(`Notifikasi gagal: ${e.message}`);
    }
  }
}

// ---- Cache Getters ----

function getClientData(clientId) {
  return cache.get(`client_${clientId}`) || null;
}

function getAllClientsData() {
  return cache.get("all_clients") || {};
}

function getSyncStatus() {
  return { ...syncStatus };
}

function setCacheManual(key, data) {
  cache.set(key, data);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  syncAllClients,
  syncSingleClient,
  getClientData,
  getAllClientsData,
  getSyncStatus,
  setCacheManual
};
