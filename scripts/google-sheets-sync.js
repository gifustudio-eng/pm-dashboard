// ============================================================
// scripts/google-sheets-sync.js
// Sync data dashboard ke Google Sheets secara otomatis
// Jalankan: node scripts/google-sheets-sync.js
// ============================================================
// Setup:
//   1. Buka https://console.cloud.google.com
//   2. Buat project baru → Enable "Google Sheets API" & "Google Drive API"
//   3. Credentials → Service Account → Download JSON key
//   4. Simpan key sebagai "google-credentials.json" di folder root
//   5. Buka Google Sheet → Share ke email service account (Editor)
//   6. Copy Spreadsheet ID dari URL sheet ke .env
// ============================================================

require("dotenv").config();
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

// Tambahkan ke .env:
// GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
// GOOGLE_CREDENTIALS_PATH=./google-credentials.json

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CREDS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || "./google-credentials.json";

async function getGoogleAuth() {
  const credentials = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive"
    ]
  });
  return auth;
}

async function getOrCreateSheets(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.map(s => s.properties.title);

  const required = ["Overview", "KPI Detail", "Trend Harian", "Campaigns", "Log Sync"];
  const toCreate = required.filter(name => !existing.includes(name));

  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map(title => ({
          addSheet: { properties: { title } }
        }))
      }
    });
    console.log(`Sheet dibuat: ${toCreate.join(", ")}`);
  }

  return required;
}

function fmtRp(n) {
  return `Rp ${parseInt(n || 0).toLocaleString("id-ID")}`;
}

async function writeSheet(sheets, spreadsheetId, sheetName, data) {
  // Clear dulu
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A:Z`
  });

  // Tulis data baru
  if (data.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: data }
    });
  }
  console.log(`  ✓ Sheet "${sheetName}" diupdate (${data.length} baris)`);
}

async function styleHeaderRow(sheets, spreadsheetId, sheetName, sheetId) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.388, green: 0.4, blue: 0.945 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
                horizontalAlignment: "CENTER"
              }
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
          }
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount"
          }
        }
      ]
    }
  });
}

async function syncToGoogleSheets(allClientsData) {
  if (!SHEET_ID) {
    console.error("GOOGLE_SHEET_ID belum dikonfigurasi di .env");
    return;
  }

  if (!fs.existsSync(CREDS_PATH)) {
    console.error(`Google credentials tidak ditemukan: ${CREDS_PATH}`);
    console.log("Download service account key dari Google Cloud Console dan simpan sebagai google-credentials.json");
    return;
  }

  console.log("\n📊 Sync ke Google Sheets dimulai...");
  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await getOrCreateSheets(sheets, SHEET_ID);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetIds = {};
  meta.data.sheets.forEach(s => { sheetIds[s.properties.title] = s.properties.sheetId; });

  const clients = Object.values(allClientsData);
  const now = new Date().toLocaleString("id-ID");

  // ──────────────────────────────────────────────
  // Sheet 1: Overview
  // ──────────────────────────────────────────────
  const overviewData = [
    [`PM Dashboard — Laporan Overview`, "", "", "", "", "", "", "", `Update: ${now}`],
    [],
    ["#", "Nama Client", "Industri", "PIC", "Budget/Bulan", "Spend Aktual",
     "KPI Score", "Status", "ROAS", "CTR", "Leads", "CPL", "ROAS Target", "CPL Target", "Synced At"]
  ];

  clients.forEach((c, i) => {
    const s = c.insights?.summary || {};
    const score = c.insights?.overallScore || 0;
    const status = score >= 70 ? "✅ On Track" : score >= 50 ? "⚠️ At Risk" : "🔴 Critical";
    overviewData.push([
      i + 1,
      c.clientName,
      c.industry,
      c.pic,
      c.budgetPerMonth,
      s.spend || 0,
      `${score}%`,
      status,
      s.roas || 0,
      `${s.ctr || 0}%`,
      s.leads || 0,
      s.cpl || 0,
      c.kpiTargets?.roas || 0,
      c.kpiTargets?.cpl || 0,
      c.syncedAt ? new Date(c.syncedAt).toLocaleString("id-ID") : "-"
    ]);
  });

  // Tambah totals
  overviewData.push([]);
  overviewData.push([
    "TOTAL", "", "", "",
    clients.reduce((s, c) => s + (c.budgetPerMonth || 0), 0),
    clients.reduce((s, c) => s + (c.insights?.summary?.spend || 0), 0),
    `${Math.round(clients.reduce((s, c) => s + (c.insights?.overallScore || 0), 0) / Math.max(clients.length, 1))}%`,
    "",
    (clients.reduce((s, c) => s + (c.insights?.summary?.roas || 0), 0) / Math.max(clients.length, 1)).toFixed(2),
    "",
    clients.reduce((s, c) => s + (c.insights?.summary?.leads || 0), 0)
  ]);

  await writeSheet(sheets, SHEET_ID, "Overview", overviewData);
  await styleHeaderRow(sheets, SHEET_ID, "Overview", sheetIds["Overview"]);

  // ──────────────────────────────────────────────
  // Sheet 2: KPI Detail
  // ──────────────────────────────────────────────
  const kpiData = [
    ["Client", "Industri", "KPI", "Target", "Actual", "Satuan", "Achieved?", "Gap", "% Tercapai", "Update"]
  ];

  const kpiDefs = [
    { name: "ROAS", key: "roas", unit: "x" },
    { name: "Cost per Lead", key: "cpl", unit: "Rp" },
    { name: "CTR", key: "ctr", unit: "%" },
    { name: "Total Leads", key: "leads", unit: "leads" },
    { name: "Frequency", key: "frequency", unit: "x" }
  ];

  clients.forEach(c => {
    const kpi = c.insights?.kpiAchievement || {};
    kpiDefs.forEach(k => {
      const kd = kpi[k.key] || {};
      const gap = (k.key === "cpl" || k.key === "frequency")
        ? (kd.target || 0) - (kd.actual || 0)
        : (kd.actual || 0) - (kd.target || 0);
      const pct = kd.target ? ((kd.actual / kd.target) * 100).toFixed(1) : 0;
      kpiData.push([
        c.clientName, c.industry, k.name,
        kd.target || 0, kd.actual || 0, k.unit,
        kd.achieved ? "✅ Ya" : "❌ Belum",
        gap.toFixed(2), `${pct}%`,
        now
      ]);
    });
  });

  await writeSheet(sheets, SHEET_ID, "KPI Detail", kpiData);
  await styleHeaderRow(sheets, SHEET_ID, "KPI Detail", sheetIds["KPI Detail"]);

  // ──────────────────────────────────────────────
  // Sheet 3: Trend Harian
  // ──────────────────────────────────────────────
  const trendData = [
    ["Client", "Industri", "Tanggal", "Spend (Rp)", "Impressions", "Clicks", "Leads", "CTR (%)", "CPM (Rp)"]
  ];

  clients.forEach(c => {
    const trend = c.insights?.dailyTrend || [];
    trend.forEach(d => {
      trendData.push([
        c.clientName, c.industry,
        d.date, d.spend, d.impressions, d.clicks, d.leads, d.ctr, d.cpm
      ]);
    });
  });

  await writeSheet(sheets, SHEET_ID, "Trend Harian", trendData);
  await styleHeaderRow(sheets, SHEET_ID, "Trend Harian", sheetIds["Trend Harian"]);

  // ──────────────────────────────────────────────
  // Sheet 4: Campaigns
  // ──────────────────────────────────────────────
  const campData = [
    ["Client", "Campaign ID", "Nama Campaign", "Status", "Objective", "Daily Budget", "Start", "Stop"]
  ];

  clients.forEach(c => {
    (c.campaigns || []).forEach(camp => {
      campData.push([
        c.clientName, camp.id, camp.name, camp.status,
        camp.objective, camp.dailyBudget || 0,
        camp.startTime || "", camp.stopTime || ""
      ]);
    });
  });

  await writeSheet(sheets, SHEET_ID, "Campaigns", campData);
  await styleHeaderRow(sheets, SHEET_ID, "Campaigns", sheetIds["Campaigns"]);

  // ──────────────────────────────────────────────
  // Sheet 5: Log Sync
  // ──────────────────────────────────────────────
  // Append ke log (tidak clear)
  const logRange = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Log Sync!A:A"
  }).catch(() => ({ data: { values: [] } }));

  const nextRow = (logRange.data.values?.length || 0) + 1;

  if (nextRow === 1) {
    // Header pertama kali
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: "Log Sync!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Timestamp", "Total Client", "Berhasil", "Gagal", "Avg KPI Score", "Total Spend"]] }
    });
    await styleHeaderRow(sheets, SHEET_ID, "Log Sync", sheetIds["Log Sync"]);
  }

  const avgScore = Math.round(clients.reduce((s, c) => s + (c.insights?.overallScore || 0), 0) / Math.max(clients.length, 1));
  const totalSpend = clients.reduce((s, c) => s + (c.insights?.summary?.spend || 0), 0);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Log Sync!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[now, clients.length, clients.length, 0, `${avgScore}%`, totalSpend]]
    }
  });

  console.log("  ✓ Log sync ditambahkan");
  console.log(`\n✅ Google Sheets sync selesai!`);
  console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  // Ambil data dari backend API atau langsung dari sync service
  let allClientsData = {};

  // Coba ambil dari API backend yang sedang berjalan
  try {
    const resp = await fetch("http://localhost:3001/api/clients");
    const json = await resp.json();
    if (json.success && json.data) {
      json.data.forEach(c => { allClientsData[c.id] = c; });
      console.log(`Data diambil dari API: ${json.data.length} client`);
    }
  } catch (e) {
    // Backend tidak running, load dari syncService langsung
    console.log("Backend API tidak aktif, load data lokal...");
    try {
      const syncService = require("../src/services/syncService");
      allClientsData = syncService.getAllClientsData();
    } catch (e2) {
      console.error("Tidak bisa load data:", e2.message);
      process.exit(1);
    }
  }

  if (Object.keys(allClientsData).length === 0) {
    console.log("Tidak ada data. Jalankan sync terlebih dahulu: npm run sync");
    process.exit(1);
  }

  await syncToGoogleSheets(allClientsData);
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});

module.exports = { syncToGoogleSheets };
