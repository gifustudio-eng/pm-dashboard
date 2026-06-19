// ============================================================
// src/services/metaApiService.js
// Core service untuk komunikasi dengan Meta Graph API
// ============================================================

const axios = require("axios");
// Logger sederhana (file middleware/logger.js sebelumnya tidak ada di repo,
// menyebabkan crash 500 di semua endpoint yang require file ini)
const logger = {
  info:  (...args) => console.log("[INFO]", ...args),
  warn:  (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args)
};

const BASE_URL = process.env.META_BASE_URL || "https://graph.facebook.com";
const API_VERSION = process.env.META_API_VERSION || "v19.0";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

// Kolom insights yang akan di-fetch dari Meta
const INSIGHTS_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpm",
  "cpc",
  "reach",
  "frequency",
  "actions",          // termasuk leads, purchases, dll
  "action_values",    // nilai konversi (untuk ROAS)
  "cost_per_action_type",
  "purchase_roas",
  "website_ctr",
  "unique_clicks",
  "unique_ctr"
].join(",");

/**
 * Request ke Meta Graph API dengan error handling
 */
async function metaRequest(endpoint, params = {}) {
  const url = `${BASE_URL}/${API_VERSION}/${endpoint}`;
  const requestParams = {
    access_token: ACCESS_TOKEN,
    ...params
  };

  try {
    const response = await axios.get(url, {
      params: requestParams,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    const errCode = error.response?.data?.error?.code || "UNKNOWN";
    logger.error(`Meta API Error [${errCode}] on ${endpoint}: ${errMsg}`);
    throw new Error(`Meta API: ${errMsg} (code: ${errCode})`);
  }
}

/**
 * Fetch insights untuk satu Ad Account dalam date range tertentu
 * @param {string} adAccountId - format: act_XXXXXXXXX
 * @param {string} datePreset  - "last_30d", "last_7d", "this_month", dll
 * @param {object} customDates - { since: "YYYY-MM-DD", until: "YYYY-MM-DD" }
 */
async function fetchAccountInsights(adAccountId, datePreset = "last_30d", customDates = null) {
  logger.info(`Fetching insights for ${adAccountId} — ${customDates ? JSON.stringify(customDates) : datePreset}`);

  const params = {
    fields: INSIGHTS_FIELDS,
    level: "account",
    time_increment: 1  // data per hari
  };

  if (customDates) {
    params.time_range = JSON.stringify({ since: customDates.since, until: customDates.until });
  } else {
    params.date_preset = datePreset;
  }

  const data = await metaRequest(`${adAccountId}/insights`, params);
  return data.data || [];
}

/**
 * Fetch semua campaigns dari satu Ad Account
 */
async function fetchCampaigns(adAccountId) {
  logger.info(`Fetching campaigns for ${adAccountId}`);

  const fields = [
    "id", "name", "status", "objective",
    "daily_budget", "lifetime_budget",
    "start_time", "stop_time",
    "insights{spend,impressions,clicks,ctr,actions,purchase_roas}"
  ].join(",");

  const data = await metaRequest(`${adAccountId}/campaigns`, {
    fields,
    filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
    limit: 50
  });

  return data.data || [];
}

/**
 * Fetch Ad Sets dari satu Ad Account
 */
async function fetchAdSets(adAccountId) {
  logger.info(`Fetching ad sets for ${adAccountId}`);

  const fields = [
    "id", "name", "status", "targeting",
    "daily_budget", "optimization_goal",
    "insights{spend,impressions,clicks,ctr,actions,reach,frequency}"
  ].join(",");

  const data = await metaRequest(`${adAccountId}/adsets`, {
    fields,
    limit: 50
  });

  return data.data || [];
}

/**
 * Fetch informasi akun (nama, currency, timezone)
 */
async function fetchAccountInfo(adAccountId) {
  const fields = "name,currency,timezone_name,business_name,account_status";
  const data = await metaRequest(adAccountId, { fields });
  return data;
}

/**
 * Parse raw Meta insights menjadi format dashboard
 */
function parseInsights(rawInsights, clientConfig) {
  if (!rawInsights || rawInsights.length === 0) {
    return getEmptyInsights(clientConfig);
  }

  // Aggregate semua hari
  const totals = rawInsights.reduce((acc, day) => {
    acc.spend += parseFloat(day.spend || 0);
    acc.impressions += parseInt(day.impressions || 0);
    acc.clicks += parseInt(day.clicks || 0);
    acc.reach += parseInt(day.reach || 0);

    // Hitung leads dari actions
    const leads = (day.actions || []).find(a =>
      ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(a.action_type)
    );
    acc.leads += parseInt(leads?.value || 0);

    // Hitung purchase value untuk ROAS
    const purchaseValue = (day.action_values || []).find(a => a.action_type === "purchase");
    acc.purchaseValue += parseFloat(purchaseValue?.value || 0);

    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchaseValue: 0 });

  // Kalkulasi metrics turunan
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const roas = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;
  const frequency = totals.reach > 0 ? totals.impressions / totals.reach : 0;

  // Hitung KPI achievement
  const targets = clientConfig.kpiTargets;
  const kpiAchievement = {
    roas: { actual: +roas.toFixed(2), target: targets.roas, achieved: roas >= targets.roas },
    cpl: { actual: Math.round(cpl), target: targets.cpl, achieved: cpl <= targets.cpl || cpl === 0 },
    ctr: { actual: +ctr.toFixed(2), target: targets.ctr, achieved: ctr >= targets.ctr },
    leads: { actual: totals.leads, target: targets.leadsPerMonth, achieved: totals.leads >= targets.leadsPerMonth },
    frequency: { actual: +frequency.toFixed(2), target: targets.frequency, achieved: frequency <= targets.frequency }
  };

  // Hitung overall score
  const achievedCount = Object.values(kpiAchievement).filter(k => k.achieved).length;
  const overallScore = Math.round((achievedCount / Object.keys(kpiAchievement).length) * 100);

  // Trend harian untuk chart
  const dailyTrend = rawInsights.map(day => {
    const dayLeads = (day.actions || []).find(a =>
      ["lead", "offsite_conversion.fb_pixel_lead"].includes(a.action_type)
    );
    return {
      date: day.date_start,
      spend: parseFloat(day.spend || 0),
      impressions: parseInt(day.impressions || 0),
      clicks: parseInt(day.clicks || 0),
      leads: parseInt(dayLeads?.value || 0),
      ctr: parseFloat(day.ctr || 0),
      cpm: parseFloat(day.cpm || 0)
    };
  });

  return {
    summary: {
      spend: Math.round(totals.spend),
      impressions: totals.impressions,
      clicks: totals.clicks,
      reach: totals.reach,
      leads: totals.leads,
      purchaseValue: Math.round(totals.purchaseValue),
      ctr: +ctr.toFixed(2),
      cpm: +cpm.toFixed(0),
      cpc: +cpc.toFixed(0),
      cpl: +cpl.toFixed(0),
      roas: +roas.toFixed(2),
      frequency: +frequency.toFixed(2)
    },
    kpiAchievement,
    overallScore,
    dailyTrend,
    dataPoints: rawInsights.length
  };
}

function getEmptyInsights(clientConfig) {
  const targets = clientConfig.kpiTargets;
  const emptyKpi = (target) => ({ actual: 0, target, achieved: false });
  return {
    summary: { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchaseValue: 0, ctr: 0, cpm: 0, cpc: 0, cpl: 0, roas: 0, frequency: 0 },
    kpiAchievement: {
      roas: emptyKpi(targets.roas), cpl: emptyKpi(targets.cpl),
      ctr: emptyKpi(targets.ctr), leads: emptyKpi(targets.leadsPerMonth), frequency: emptyKpi(targets.frequency)
    },
    overallScore: 0,
    dailyTrend: [],
    dataPoints: 0
  };
}

module.exports = {
  fetchAccountInsights,
  fetchCampaigns,
  fetchAdSets,
  fetchAccountInfo,
  parseInsights
};
