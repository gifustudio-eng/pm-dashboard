// ============================================================
// lib/supabase.js
// Supabase client + semua helper fungsi database
// ============================================================

const { createClient } = require("@supabase/supabase-js");

// Client untuk backend (service key — bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Client untuk frontend (anon key — ikut RLS)
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── CLIENTS ──────────────────────────────────────────────

async function getAllClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("id");
  if (error) throw new Error("getAllClients: " + error.message);
  return data;
}

async function getClientById(id) {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error("getClientById: " + error.message);
  return data;
}

async function insertClient(client) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name:               client.name,
      industry:           client.industry,
      pic:                client.pic,
      budget:             client.budget,
      meta_ad_account_id: client.metaId || client.metaAdAccountId,
      facebook_page_id:   client.facebookPageId,
      instagram_user_id:  client.instagramUserId,
      color:              client.color || "#6366F1",
      status:             client.status || "Active",
      kpi_targets:        client.kpiTargets || {}
    })
    .select()
    .single();
  if (error) throw new Error("insertClient: " + error.message);
  return data;
}

async function updateClient(id, updates) {
  const { data, error } = await supabase
    .from("clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("updateClient: " + error.message);
  return data;
}

// ── INSIGHTS ─────────────────────────────────────────────

async function upsertInsights(clientId, yearMonth, data) {
  const { error } = await supabase
    .from("social_insights")
    .upsert({
      client_id:     clientId,
      year_month:    yearMonth,
      date_preset:   data.datePreset || "last_30d",
      social:        data.social     || {},
      ads:           data.ads        || {},
      comparison:    data.comparison || {},
      overall_score: data.overallScore || 0,
      synced_at:     new Date().toISOString()
    }, { onConflict: "client_id,year_month" });
  if (error) throw new Error("upsertInsights: " + error.message);
}

async function getInsights(clientId, yearMonth) {
  const { data, error } = await supabase
    .from("social_insights")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yearMonth)
    .single();
  if (error && error.code !== "PGRST116") throw new Error("getInsights: " + error.message);
  return data || null;
}

async function getAllInsights(yearMonth) {
  const { data, error } = await supabase
    .from("social_insights")
    .select("*")
    .eq("year_month", yearMonth);
  if (error) throw new Error("getAllInsights: " + error.message);
  return data;
}

// ── CONTENT POSTS ─────────────────────────────────────────

async function getContentPosts(clientId, yearMonth) {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const startDate = `${yearMonth}-01`;
  const endDate   = new Date(yr, mo, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("content_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("post_date", startDate)
    .lte("post_date", endDate)
    .order("post_date", { ascending: false });
  if (error) throw new Error("getContentPosts: " + error.message);
  return data;
}

async function getAllContentPosts(yearMonth) {
  const [yr, mo] = yearMonth.split("-").map(Number);
  const startDate = `${yearMonth}-01`;
  const endDate   = new Date(yr, mo, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("content_posts")
    .select("*")
    .gte("post_date", startDate)
    .lte("post_date", endDate)
    .order("post_date", { ascending: false });
  if (error) throw new Error("getAllContentPosts: " + error.message);
  return data;
}

async function insertContentPost(post) {
  const { data, error } = await supabase
    .from("content_posts")
    .insert({
      client_id:  post.clientId,
      type:       post.type,
      title:      post.title,
      post_date:  post.date,
      platform:   post.platform || "instagram",
      likes:      post.likes    || 0,
      comments:   post.comments || 0,
      reach:      post.reach    || 0,
      views:      post.views    || 0,
      note:       post.note     || ""
    })
    .select()
    .single();
  if (error) throw new Error("insertContentPost: " + error.message);
  return data;
}

async function updateContentPost(id, updates) {
  const { data, error } = await supabase
    .from("content_posts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("updateContentPost: " + error.message);
  return data;
}

async function deleteContentPost(id) {
  const { error } = await supabase
    .from("content_posts")
    .delete()
    .eq("id", id);
  if (error) throw new Error("deleteContentPost: " + error.message);
}

// ── CONTENT KPI ───────────────────────────────────────────

async function getContentKPI(clientId, yearMonth) {
  const { data, error } = await supabase
    .from("content_kpi")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yearMonth)
    .single();
  if (error && error.code !== "PGRST116") throw new Error("getContentKPI: " + error.message);
  return data || null;
}

async function getAllContentKPI(yearMonth) {
  const { data, error } = await supabase
    .from("content_kpi")
    .select("*")
    .eq("year_month", yearMonth);
  if (error) throw new Error("getAllContentKPI: " + error.message);
  return data;
}

async function upsertContentKPI(clientId, yearMonth, kpi) {
  const { error } = await supabase
    .from("content_kpi")
    .upsert({
      client_id:     clientId,
      year_month:    yearMonth,
      total_target:  kpi.total  || 0,
      feed_target:   kpi.feed   || 0,
      reel_target:   kpi.reel   || 0,
      story_target:  kpi.story  || 0,
      freq_per_week: kpi.freq   || 3,
      note:          kpi.note   || "",
      updated_at:    new Date().toISOString()
    }, { onConflict: "client_id,year_month" });
  if (error) throw new Error("upsertContentKPI: " + error.message);
}

// ── SYNC LOG ──────────────────────────────────────────────

async function insertSyncLog(log) {
  const { error } = await supabase
    .from("sync_log")
    .insert({
      clients_count: log.total    || 0,
      success_count: log.success  || 0,
      error_count:   log.errors   || 0,
      duration_sec:  log.duration || 0,
      notes:         log.notes    || ""
    });
  if (error) console.warn("insertSyncLog:", error.message);
}

module.exports = {
  supabase, supabasePublic,
  // clients
  getAllClients, getClientById, insertClient, updateClient,
  // insights
  upsertInsights, getInsights, getAllInsights,
  // content posts
  getContentPosts, getAllContentPosts, insertContentPost, updateContentPost, deleteContentPost,
  // content kpi
  getContentKPI, getAllContentKPI, upsertContentKPI,
  // logs
  insertSyncLog
};
