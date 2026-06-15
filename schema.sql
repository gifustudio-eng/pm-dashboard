-- ============================================================
-- PM Dashboard — Supabase SQL Schema v4.0
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── CLIENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  industry            TEXT,
  pic                 TEXT,
  budget              BIGINT DEFAULT 0,
  meta_ad_account_id  TEXT,
  facebook_page_id    TEXT,
  instagram_user_id   TEXT,
  color               TEXT DEFAULT '#6366F1',
  status              TEXT DEFAULT 'Active',
  kpi_targets         JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── SOCIAL INSIGHTS (dari Meta API sync otomatis) ────────────
CREATE TABLE IF NOT EXISTS social_insights (
  id            SERIAL PRIMARY KEY,
  client_id     INT REFERENCES clients(id) ON DELETE CASCADE,
  year_month    TEXT NOT NULL,        -- "2026-06"
  date_preset   TEXT DEFAULT 'last_30d',
  social        JSONB DEFAULT '{}',   -- { current: {...}, previous: {...} }
  ads           JSONB DEFAULT '{}',   -- { spend, leads, roas, ctr, cpl, ... }
  comparison    JSONB DEFAULT '{}',   -- Period comparison deltas
  overall_score INT DEFAULT 0,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, year_month)
);

-- ── CONTENT POSTS (input manual) ─────────────────────────────
CREATE TABLE IF NOT EXISTS content_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   INT REFERENCES clients(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('feed', 'carousel', 'reel', 'story')),
  title       TEXT NOT NULL,
  post_date   DATE NOT NULL,
  platform    TEXT DEFAULT 'instagram' CHECK (platform IN ('instagram', 'facebook', 'both')),
  likes       INT DEFAULT 0,
  comments    INT DEFAULT 0,
  reach       INT DEFAULT 0,
  views       INT DEFAULT 0,   -- Untuk Reels/Video
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTENT KPI TARGETS (target jumlah posting per bulan) ────
CREATE TABLE IF NOT EXISTS content_kpi (
  id            SERIAL PRIMARY KEY,
  client_id     INT REFERENCES clients(id) ON DELETE CASCADE,
  year_month    TEXT NOT NULL,        -- "2026-06"
  total_target  INT DEFAULT 0,        -- Total semua konten
  feed_target   INT DEFAULT 0,        -- Feed + Carousel
  reel_target   INT DEFAULT 0,        -- Reels / Video
  story_target  INT DEFAULT 0,        -- Story
  freq_per_week INT DEFAULT 3,        -- Frekuensi per minggu
  note          TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, year_month)
);

-- ── SYNC LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id            SERIAL PRIMARY KEY,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  clients_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  error_count   INT DEFAULT 0,
  duration_sec  NUMERIC DEFAULT 0,
  notes         TEXT
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_insights_client_month    ON social_insights(client_id, year_month);
CREATE INDEX IF NOT EXISTS idx_insights_synced_at       ON social_insights(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_posts_client     ON content_posts(client_id, post_date DESC);
CREATE INDEX IF NOT EXISTS idx_content_posts_type       ON content_posts(client_id, type);
CREATE INDEX IF NOT EXISTS idx_content_kpi_client_month ON content_kpi(client_id, year_month);
CREATE INDEX IF NOT EXISTS idx_sync_log_date            ON sync_log(synced_at DESC);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_kpi     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log        ENABLE ROW LEVEL SECURITY;

-- Policy: service_role bisa akses semua (untuk backend/API)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access' AND tablename = 'clients') THEN
    CREATE POLICY "Service role full access" ON clients         FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "Service role full access" ON social_insights FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "Service role full access" ON content_posts   FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "Service role full access" ON content_kpi     FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "Service role full access" ON sync_log        FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── SEED DATA (client awal) ───────────────────────────────────
-- Hapus baris INSERT ini jika sudah punya data sendiri

INSERT INTO clients (name, industry, pic, budget, meta_ad_account_id, color, status, kpi_targets)
VALUES
  ('PT Sejahtera Digital', 'E-Commerce', 'Budi Santoso', 15000000, 'act_112233445', '#6366F1', 'Active',
   '{"roas":4.0,"cpl":25000,"ctr":2.5,"leadsPerMonth":200,"followers":50000,"growthPerMonth":2000,"engRate":3.5,"reach":600000}'),
  ('WarungKita F&B',       'F&B',       'Siti Rahma',  8000000,  'act_223344556', '#10B981', 'Active',
   '{"roas":3.5,"cpl":30000,"ctr":2.0,"leadsPerMonth":150,"followers":25000,"growthPerMonth":1000,"engRate":3.0,"reach":350000}'),
  ('ModaStyle Fashion',    'Fashion',   'Dewi Kusuma', 12000000, 'act_334455667', '#F59E0B', 'Active',
   '{"roas":5.0,"cpl":20000,"ctr":3.0,"leadsPerMonth":300,"followers":90000,"growthPerMonth":5000,"engRate":5.0,"reach":1200000}'),
  ('SehatSelalu Clinic',   'Healthcare','Dr. Ahmad',   6000000,  'act_445566778', '#38BDF8', 'Active',
   '{"roas":3.0,"cpl":40000,"ctr":1.5,"leadsPerMonth":80,"followers":18000,"growthPerMonth":500,"engRate":4.0,"reach":250000}'),
  ('PropNusantara',        'Properti',  'Hendra W.',   20000000, 'act_556677889', '#F43F5E', 'Active',
   '{"roas":6.0,"cpl":50000,"ctr":2.0,"leadsPerMonth":50,"followers":12000,"growthPerMonth":400,"engRate":2.0,"reach":300000}')
ON CONFLICT DO NOTHING;

-- Verifikasi
SELECT 'clients' AS tabel, COUNT(*) AS jumlah FROM clients
UNION ALL
SELECT 'social_insights', COUNT(*) FROM social_insights
UNION ALL
SELECT 'content_posts', COUNT(*) FROM content_posts
UNION ALL
SELECT 'content_kpi', COUNT(*) FROM content_kpi;
