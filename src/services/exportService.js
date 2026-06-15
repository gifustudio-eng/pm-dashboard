// ============================================================
// src/services/exportService.js
// Generate laporan Excel dan PDF dari data dashboard
// ============================================================

const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const logger = require("../middleware/logger");

const EXPORT_DIR = process.env.EXPORT_DIR || "./exports";

// Pastikan folder exports ada
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

function fmtRp(num) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(num);
}

function fmtPct(num) {
  return `${num.toFixed(2)}%`;
}

// ============================================================
// EXPORT EXCEL
// ============================================================

function exportToExcel(allClientsData, datePreset = "last_30d") {
  const wb = XLSX.utils.book_new();
  const clients = Object.values(allClientsData);
  const timestamp = new Date().toISOString().slice(0, 10);

  // ── Sheet 1: Overview Summary ──
  const overviewRows = [
    ["PM Dashboard — Export Laporan Meta Ads"],
    [`Tanggal Export: ${new Date().toLocaleString("id-ID")} | Periode: ${datePreset}`],
    [],
    ["#", "Client", "Industri", "Budget/Bulan", "KPI Score", "Status",
     "Spend", "Impressions", "Clicks", "CTR", "Leads", "CPL", "ROAS", "Frequency"]
  ];

  clients.forEach((c, i) => {
    const s = c.insights?.summary || {};
    overviewRows.push([
      i + 1,
      c.clientName,
      c.industry,
      c.budgetPerMonth,
      `${c.insights?.overallScore || 0}%`,
      c.status,
      s.spend || 0,
      s.impressions || 0,
      s.clicks || 0,
      s.ctr ? `${s.ctr}%` : "0%",
      s.leads || 0,
      s.cpl || 0,
      s.roas || 0,
      s.frequency || 0
    ]);
  });

  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview["!cols"] = [
    {wch:4},{wch:25},{wch:12},{wch:16},{wch:10},{wch:10},
    {wch:14},{wch:14},{wch:10},{wch:8},{wch:8},{wch:12},{wch:8},{wch:10}
  ];
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

  // ── Sheet 2: KPI Achievement Detail ──
  const kpiRows = [
    ["KPI Achievement Detail"],
    [],
    ["Client", "KPI", "Target", "Actual", "Satuan", "Tercapai?", "Gap", "% dari Target"]
  ];

  clients.forEach(c => {
    const kpi = c.insights?.kpiAchievement || {};
    const kpiMap = [
      { name: "ROAS", key: "roas", unit: "x" },
      { name: "Cost per Lead", key: "cpl", unit: "Rp" },
      { name: "CTR", key: "ctr", unit: "%" },
      { name: "Leads", key: "leads", unit: "leads" },
      { name: "Frequency", key: "frequency", unit: "x" }
    ];

    kpiMap.forEach(k => {
      const kpiData = kpi[k.key] || {};
      const gap = k.key === "cpl" || k.key === "frequency"
        ? kpiData.target - kpiData.actual
        : kpiData.actual - kpiData.target;
      const pctTarget = kpiData.target > 0 ? ((kpiData.actual / kpiData.target) * 100).toFixed(1) : 0;

      kpiRows.push([
        c.clientName,
        k.name,
        kpiData.target || 0,
        kpiData.actual || 0,
        k.unit,
        kpiData.achieved ? "✓ Ya" : "✗ Belum",
        gap.toFixed(2),
        `${pctTarget}%`
      ]);
    });
    kpiRows.push([]); // spacer
  });

  const wsKPI = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKPI["!cols"] = [{wch:25},{wch:15},{wch:10},{wch:10},{wch:8},{wch:10},{wch:8},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsKPI, "KPI Achievement");

  // ── Sheet 3: Daily Trend per Client ──
  clients.forEach(c => {
    const trend = c.insights?.dailyTrend || [];
    if (trend.length === 0) return;

    const trendRows = [
      [`Daily Trend — ${c.clientName}`],
      [],
      ["Tanggal", "Spend (Rp)", "Impressions", "Clicks", "Leads", "CTR (%)", "CPM (Rp)"]
    ];

    trend.forEach(d => {
      trendRows.push([d.date, d.spend, d.impressions, d.clicks, d.leads, d.ctr, d.cpm]);
    });

    // Totals row
    trendRows.push([
      "TOTAL",
      trend.reduce((s, d) => s + d.spend, 0),
      trend.reduce((s, d) => s + d.impressions, 0),
      trend.reduce((s, d) => s + d.clicks, 0),
      trend.reduce((s, d) => s + d.leads, 0),
      (trend.reduce((s, d) => s + d.ctr, 0) / trend.length).toFixed(2),
      (trend.reduce((s, d) => s + d.cpm, 0) / trend.length).toFixed(0)
    ]);

    const sheetName = c.clientName.slice(0, 28).replace(/[:/\\?*[\]]/g, "");
    const wsTrend = XLSX.utils.aoa_to_sheet(trendRows);
    XLSX.utils.book_append_sheet(wb, wsTrend, sheetName);
  });

  // ── Sheet 4: Campaign Detail ──
  const campRows = [
    ["Campaign Detail — Semua Client"],
    [],
    ["Client", "Campaign ID", "Campaign Name", "Status", "Objective", "Daily Budget"]
  ];

  clients.forEach(c => {
    (c.campaigns || []).forEach(camp => {
      campRows.push([
        c.clientName,
        camp.id,
        camp.name,
        camp.status,
        camp.objective,
        camp.dailyBudget || 0
      ]);
    });
  });

  const wsCamp = XLSX.utils.aoa_to_sheet(campRows);
  XLSX.utils.book_append_sheet(wb, wsCamp, "Campaigns");

  // Simpan file
  const filename = `PM_Dashboard_${datePreset}_${timestamp}.xlsx`;
  const filepath = path.join(EXPORT_DIR, filename);
  XLSX.writeFile(wb, filepath);

  logger.info(`Excel exported: ${filepath}`);
  return filepath;
}

// ============================================================
// EXPORT PDF (Executive Summary)
// ============================================================

async function exportToPDF(allClientsData, datePreset = "last_30d") {
  const clients = Object.values(allClientsData);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `PM_Dashboard_Report_${timestamp}.pdf`;
  const filepath = path.join(EXPORT_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const colors = { primary: "#6366F1", dark: "#1E293B", muted: "#64748B", success: "#10B981", danger: "#F43F5E", warning: "#F59E0B" };

    // ── Cover Page ──
    doc.rect(0, 0, doc.page.width, 200).fill(colors.primary);
    doc.fillColor("#FFFFFF").fontSize(28).font("Helvetica-Bold")
      .text("PM Dashboard", 50, 60);
    doc.fontSize(14).font("Helvetica")
      .text("Laporan Performa Meta Ads", 50, 100);
    doc.fontSize(11)
      .text(`Periode: ${datePreset} | Export: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`, 50, 125);

    // Summary box
    doc.roundedRect(50, 160, doc.page.width - 100, 60, 8).fill("#FFFFFF").fillOpacity(0.15);
    const totalSpend = clients.reduce((s, c) => s + (c.insights?.summary?.spend || 0), 0);
    const totalLeads = clients.reduce((s, c) => s + (c.insights?.summary?.leads || 0), 0);
    const avgScore = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + (c.insights?.overallScore || 0), 0) / clients.length) : 0;
    doc.fillColor("#FFFFFF").fontSize(11)
      .text(`${clients.length} Client Aktif`, 70, 175)
      .text(`Total Spend: ${fmtRp(totalSpend)}`, 200, 175)
      .text(`Total Leads: ${totalLeads}`, 380, 175)
      .text(`Avg KPI Score: ${avgScore}%`, 490, 175);

    doc.fillColor(colors.dark).fillOpacity(1);
    doc.moveDown(8);

    // ── Per Client Section ──
    clients.forEach((c, idx) => {
      if (idx > 0) doc.addPage();
      else { doc.y = 240; }

      const s = c.insights?.summary || {};
      const kpi = c.insights?.kpiAchievement || {};
      const score = c.insights?.overallScore || 0;

      // Client header
      doc.rect(50, doc.y, doc.page.width - 100, 40).fill(score >= 70 ? colors.success : score >= 50 ? colors.warning : colors.danger);
      doc.fillColor("#FFFFFF").fontSize(14).font("Helvetica-Bold")
        .text(`${c.clientName}`, 65, doc.y - 30);
      doc.fontSize(10).font("Helvetica")
        .text(`${c.industry} | KPI Score: ${score}% | ${c.status}`, 65, doc.y - 13);

      doc.fillColor(colors.dark).moveDown(1);
      doc.y += 15;

      // Summary metrics
      doc.fontSize(11).font("Helvetica-Bold").fillColor(colors.primary).text("Ringkasan Performa", 50);
      doc.moveDown(0.3);

      const metrics = [
        ["Total Spend", fmtRp(s.spend || 0)],
        ["Impressions", (s.impressions || 0).toLocaleString("id-ID")],
        ["Clicks", (s.clicks || 0).toLocaleString("id-ID")],
        ["CTR", fmtPct(s.ctr || 0)],
        ["Total Leads", s.leads || 0],
        ["ROAS", `${s.roas || 0}x`],
        ["CPL", fmtRp(s.cpl || 0)],
        ["Frequency", s.frequency || 0]
      ];

      const colW = (doc.page.width - 100) / 4;
      metrics.forEach((m, i) => {
        const col = i % 4;
        const x = 50 + col * colW;
        if (col === 0 && i > 0) doc.y += 45;
        const y = doc.y;
        doc.rect(x, y, colW - 8, 38).fill("#F8FAFC").stroke("#E2E8F0");
        doc.fillColor(colors.muted).fontSize(9).font("Helvetica").text(m[0], x + 8, y + 7);
        doc.fillColor(colors.dark).fontSize(12).font("Helvetica-Bold").text(String(m[1]), x + 8, y + 19);
      });

      doc.y += 55;

      // KPI Achievement table
      doc.fontSize(11).font("Helvetica-Bold").fillColor(colors.primary).text("KPI Achievement", 50);
      doc.moveDown(0.3);

      doc.rect(50, doc.y, doc.page.width - 100, 18).fill("#F1F5F9");
      doc.fillColor(colors.muted).fontSize(9).font("Helvetica")
        .text("KPI", 55, doc.y + 4)
        .text("Target", 200, doc.y + 4)
        .text("Actual", 290, doc.y + 4)
        .text("Gap", 380, doc.y + 4)
        .text("Status", 460, doc.y + 4);
      doc.y += 22;

      const kpiList = [
        { name: "ROAS", key: "roas", unit: "x" },
        { name: "Cost per Lead", key: "cpl", unit: "Rp", fmt: fmtRp },
        { name: "CTR", key: "ctr", unit: "%" },
        { name: "Total Leads", key: "leads", unit: "" },
        { name: "Frequency", key: "frequency", unit: "x" }
      ];

      kpiList.forEach((k, i) => {
        const kd = kpi[k.key] || {};
        const statusColor = kd.achieved ? colors.success : colors.danger;
        if (i % 2 === 0) doc.rect(50, doc.y, doc.page.width - 100, 18).fill("#FAFAFA");
        doc.fillColor(colors.dark).fontSize(9).font("Helvetica")
          .text(k.name, 55, doc.y + 4)
          .text(k.fmt ? k.fmt(kd.target) : `${kd.target}${k.unit}`, 200, doc.y + 4)
          .text(k.fmt ? k.fmt(kd.actual) : `${kd.actual}${k.unit}`, 290, doc.y + 4);
        doc.fillColor(statusColor).text(kd.achieved ? "✓ Tercapai" : "✗ Belum", 460, doc.y + 4);
        doc.y += 20;
      });

      // Campaigns
      if (c.campaigns && c.campaigns.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(colors.primary).text("Active Campaigns");
        doc.moveDown(0.3);
        c.campaigns.slice(0, 5).forEach(camp => {
          doc.fillColor(colors.dark).fontSize(9).font("Helvetica")
            .text(`• ${camp.name} — ${camp.status} | Objective: ${camp.objective}`, 55, doc.y);
          doc.y += 14;
        });
      }
    });

    // Footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fillColor(colors.muted).fontSize(8).font("Helvetica")
        .text(`PM Dashboard | Generated ${new Date().toLocaleString("id-ID")} | Halaman ${i + 1} dari ${pages.count}`,
          50, doc.page.height - 30, { align: "center", width: doc.page.width - 100 });
    }

    doc.end();

    stream.on("finish", () => {
      logger.info(`PDF exported: ${filepath}`);
      resolve(filepath);
    });

    stream.on("error", reject);
  });
}

module.exports = { exportToExcel, exportToPDF };
