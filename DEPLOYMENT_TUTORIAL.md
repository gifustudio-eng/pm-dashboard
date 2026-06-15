# 🚀 Tutorial Deployment PM Dashboard
## Supabase (Database) + Vercel (Frontend & Backend)

---

## Daftar Isi

1. [Gambaran Arsitektur](#1-gambaran-arsitektur)
2. [Persiapan Awal](#2-persiapan-awal)
3. [Setup Supabase](#3-setup-supabase)
4. [Migrasi Backend ke Vercel Functions](#4-migrasi-backend-ke-vercel-functions)
5. [Deploy Frontend ke Vercel](#5-deploy-frontend-ke-vercel)
6. [Konfigurasi Environment Variables](#6-konfigurasi-environment-variables)
7. [Koneksi Frontend → Backend → Supabase](#7-koneksi-frontend--backend--supabase)
8. [Setup Cron Job Otomatis di Vercel](#8-setup-cron-job-otomatis-di-vercel)
9. [Custom Domain (Opsional)](#9-custom-domain-opsional)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Gambaran Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    ARSITEKTUR PRODUCTION                      │
├──────────────────┬──────────────────┬───────────────────────┤
│   VERCEL          │   SUPABASE        │   META GRAPH API      │
│                   │                   │                       │
│  ┌─────────────┐  │  ┌─────────────┐  │  ┌─────────────────┐ │
│  │  Frontend    │  │  │  PostgreSQL  │  │  │  Ads Insights   │ │
│  │  (Static)    │  │  │  Database    │  │  │  Page Insights  │ │
│  │  HTML/CSS/JS │  │  │             │  │  │  IG Insights    │ │
│  └──────┬───────┘  │  └──────┬──────┘  │  └────────┬────────┘ │
│         │          │         │          │           │           │
│  ┌──────▼───────┐  │         │          │           │           │
│  │  API Routes  │◄─┼─────────┘          │           │           │
│  │  (Serverless │  │                    │           │           │
│  │   Functions) │◄─┼────────────────────┼───────────┘           │
│  └─────────────┘  │                    │                       │
│                   │  ┌─────────────┐   │                       │
│  ┌─────────────┐  │  │  Auth        │   │                       │
│  │  Cron Jobs  │  │  │  Storage     │   │                       │
│  │  (Sync Meta)│  │  │  Realtime    │   │                       │
│  └─────────────┘  │  └─────────────┘   │                       │
└──────────────────┴──────────────────┴───────────────────────┘
```

**Mengapa Supabase?**
- PostgreSQL gratis untuk project kecil-menengah (500MB)
- Built-in Auth, Storage, Realtime
- Dashboard visual yang mudah digunakan
- REST API & JS Client otomatis

**Mengapa Vercel?**
- Deploy otomatis dari GitHub
- Serverless Functions untuk backend Node.js
- CDN global, SSL otomatis
- Free tier cukup untuk dashboard internal

> **Catatan:** Supabase hanya diperlukan jika Anda ingin data tersimpan permanen di cloud (bukan localStorage). Jika cukup dengan localStorage + backend lokal, langsung skip ke bagian Vercel.

---

## 2. Persiapan Awal

### Yang Dibutuhkan
- [ ] Akun GitHub (gratis): [github.com](https://github.com)
- [ ] Akun Vercel (gratis): [vercel.com](https://vercel.com)
- [ ] Akun Supabase (gratis): [supabase.com](https://supabase.com) *(jika perlu database)*
- [ ] Node.js v18+ terinstall di komputer lokal
- [ ] Git terinstall

### Struktur Folder Final yang Akan Di-deploy

```
pm-dashboard/
├── api/                        ← Vercel Serverless Functions
│   ├── health.js
│   ├── sync/
│   │   ├── all.js
│   │   └── status.js
│   ├── clients/
│   │   └── index.js
│   ├── social/
│   │   └── [clientId].js
│   ├── kpi/
│   │   └── summary.js
│   └── export/
│       ├── excel.js
│       └── pdf.js
├── public/                     ← Static files
│   └── index.html              ← Frontend dashboard (pm-dashboard-v4.html)
├── lib/                        ← Shared utilities
│   ├── supabase.js
│   ├── metaApi.js
│   ├── metaSocial.js
│   └── sync.js
├── vercel.json                 ← Konfigurasi Vercel
├── package.json
└── .env.local                  ← Environment variables (jangan di-commit!)
```

### Install Tools

```bash
# Install Vercel CLI
npm install -g vercel

# Cek versi
vercel --version

# Login ke Vercel
vercel login
```

---

## 3. Setup Supabase

> Skip bagian ini jika tidak ingin menggunakan database cloud.

### 3.1 Buat Project Supabase

1. Buka [app.supabase.com](https://app.supabase.com)
2. Klik **"New Project"**
3. Isi:
   - **Name:** `pm-dashboard`
   - **Database Password:** buat password kuat, **simpan baik-baik**
   - **Region:** pilih `Southeast Asia (Singapore)` untuk performa terbaik di Indonesia
4. Klik **"Create new project"** — tunggu ~2 menit

### 3.2 Buat Tabel Database

Setelah project siap, buka **SQL Editor** dan jalankan script ini:

```sql
-- ============================================================
-- PM Dashboard — Database Schema
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- Tabel clients
CREATE TABLE clients (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  industry    TEXT,
  pic         TEXT,
  budget      BIGINT DEFAULT 0,
  meta_ad_account_id TEXT,
  facebook_page_id   TEXT,
  instagram_user_id  TEXT,
  color       TEXT DEFAULT '#6366F1',
  status      TEXT DEFAULT 'Active',
  kpi_targets JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel social insights (data dari Meta API)
CREATE TABLE social_insights (
  id          SERIAL PRIMARY KEY,
  client_id   INT REFERENCES clients(id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,         -- Format: "2026-06"
  date_preset TEXT DEFAULT 'last_30d',
  social      JSONB DEFAULT '{}',    -- { current: {...}, previous: {...} }
  ads         JSONB DEFAULT '{}',    -- Ads summary
  comparison  JSONB DEFAULT '{}',    -- Period comparison data
  overall_score INT DEFAULT 0,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, year_month)
);

-- Tabel content posts (manual input konten)
CREATE TABLE content_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   INT REFERENCES clients(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,         -- 'feed' | 'carousel' | 'reel' | 'story'
  title       TEXT NOT NULL,
  post_date   DATE NOT NULL,
  platform    TEXT DEFAULT 'instagram',
  likes       INT DEFAULT 0,
  comments    INT DEFAULT 0,
  reach       INT DEFAULT 0,
  views       INT DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel content KPI targets
CREATE TABLE content_kpi (
  id          SERIAL PRIMARY KEY,
  client_id   INT REFERENCES clients(id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  total_target  INT DEFAULT 0,
  feed_target   INT DEFAULT 0,
  reel_target   INT DEFAULT 0,
  story_target  INT DEFAULT 0,
  freq_per_week INT DEFAULT 3,
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, year_month)
);

-- Tabel sync log
CREATE TABLE sync_log (
  id          SERIAL PRIMARY KEY,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  clients_count INT,
  success_count INT,
  error_count   INT,
  duration_sec  NUMERIC,
  notes       TEXT
);

-- Index untuk performa query
CREATE INDEX idx_social_insights_client_month ON social_insights(client_id, year_month);
CREATE INDEX idx_content_posts_client_date ON content_posts(client_id, post_date);
CREATE INDEX idx_content_kpi_client_month ON content_kpi(client_id, year_month);

-- Enable Row Level Security (RLS) — opsional untuk auth
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_kpi    ENABLE ROW LEVEL SECURITY;

-- Policy: izinkan semua akses dari service role (untuk backend)
CREATE POLICY "Service role full access" ON clients
  FOR ALL USING (true);
CREATE POLICY "Service role full access" ON social_insights
  FOR ALL USING (true);
CREATE POLICY "Service role full access" ON content_posts
  FOR ALL USING (true);
CREATE POLICY "Service role full access" ON content_kpi
  FOR ALL USING (true);
```

Klik **"Run"** — semua tabel akan terbuat.

### 3.3 Ambil Credentials Supabase

Buka **Settings → API** di dashboard Supabase:

- **Project URL:** `https://xxxxx.supabase.co` → simpan sebagai `SUPABASE_URL`
- **anon/public key:** `eyJxxx...` → simpan sebagai `SUPABASE_ANON_KEY`
- **service_role key:** `eyJxxx...` → simpan sebagai `SUPABASE_SERVICE_KEY` *(rahasia, jangan expose ke frontend)*

### 3.4 Install Supabase Client

```bash
cd pm-dashboard
npm install @supabase/supabase-js
```

### 3.5 Buat File lib/supabase.js

```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY; // gunakan service key di backend

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: upsert social insights
export async function upsertInsights(clientId, yearMonth, data) {
  const { error } = await supabase
    .from('social_insights')
    .upsert({
      client_id: clientId,
      year_month: yearMonth,
      social: data.social,
      ads: data.ads,
      comparison: data.comparison,
      overall_score: data.overallScore || 0,
      synced_at: new Date().toISOString()
    }, { onConflict: 'client_id,year_month' });
  if (error) throw error;
}

// Helper: get insights
export async function getInsights(clientId, yearMonth) {
  const { data, error } = await supabase
    .from('social_insights')
    .select('*')
    .eq('client_id', clientId)
    .eq('year_month', yearMonth)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// Helper: get all clients
export async function getAllClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('id');
  if (error) throw error;
  return data;
}

// Helper: content posts
export async function saveContentPost(post) {
  const { data, error } = await supabase
    .from('content_posts')
    .insert(post)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getContentPosts(clientId, yearMonth) {
  const startDate = `${yearMonth}-01`;
  const [yr, mo] = yearMonth.split('-').map(Number);
  const endDate = new Date(yr, mo, 0).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('content_posts')
    .select('*')
    .eq('client_id', clientId)
    .gte('post_date', startDate)
    .lte('post_date', endDate)
    .order('post_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertContentKPI(clientId, yearMonth, kpi) {
  const { error } = await supabase
    .from('content_kpi')
    .upsert({
      client_id: clientId,
      year_month: yearMonth,
      total_target: kpi.total,
      feed_target:  kpi.feed,
      reel_target:  kpi.reel,
      story_target: kpi.story,
      freq_per_week: kpi.freq,
      note: kpi.note,
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id,year_month' });
  if (error) throw error;
}

export async function getContentKPI(clientId, yearMonth) {
  const { data, error } = await supabase
    .from('content_kpi')
    .select('*')
    .eq('client_id', clientId)
    .eq('year_month', yearMonth)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
```

---

## 4. Migrasi Backend ke Vercel Functions

Vercel Functions adalah Node.js serverless — setiap file di folder `/api` menjadi endpoint otomatis.

### 4.1 Buat Struktur Folder

```bash
mkdir -p api/sync api/clients api/social api/kpi api/export
mkdir -p lib public
```

### 4.2 vercel.json

Buat file `vercel.json` di root project:

```json
{
  "version": 2,
  "framework": null,
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "functions": {
    "api/**/*.js": {
      "maxDuration": 30
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)",     "dest": "/public/index.html" }
  ],
  "crons": [
    {
      "path": "/api/sync/all",
      "schedule": "0 */6 * * *"
    }
  ],
  "env": {
    "META_API_VERSION": "v19.0",
    "META_BASE_URL": "https://graph.facebook.com"
  }
}
```

### 4.3 package.json

```json
{
  "name": "pm-dashboard",
  "version": "4.0.0",
  "private": true,
  "scripts": {
    "dev": "vercel dev",
    "build": "echo 'No build step needed'",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.0",
    "node-cache": "^5.1.2",
    "pdfkit": "^0.14.0",
    "xlsx": "^0.18.5"
  }
}
```

### 4.4 Contoh API Function: api/health.js

```javascript
// api/health.js
export default function handler(req, res) {
  res.json({
    status: 'ok',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
}
```

### 4.5 Contoh API Function: api/sync/all.js

```javascript
// api/sync/all.js
import { getAllClients } from '../../lib/supabase.js';
import { fetchAccountInsights, parseInsights } from '../../lib/metaApi.js';
import { fetchAllInsights } from '../../lib/metaSocial.js';
import { upsertInsights } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Vercel Cron akan GET method
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { datePreset = 'last_30d', days = 30 } = req.body || {};
  const yearMonth = new Date().toISOString().slice(0, 7);

  try {
    const clients = await getAllClients();
    const results = [], errors = [];

    for (const client of clients) {
      try {
        // Fetch Ads
        const raw = await fetchAccountInsights(client.meta_ad_account_id, datePreset);
        const adsData = parseInsights(raw, { kpiTargets: client.kpi_targets });

        // Fetch Social
        const socialResult = await fetchAllInsights({
          id: client.id,
          name: client.name,
          metaAdAccountId: client.meta_ad_account_id,
          facebookPageId:  client.facebook_page_id,
          instagramUserId: client.instagram_user_id,
          kpiTargets: client.kpi_targets
        }, days);

        // Save ke Supabase
        await upsertInsights(client.id, yearMonth, {
          social: socialResult.social,
          ads: adsData.summary,
          comparison: socialResult.comparison,
          overallScore: adsData.overallScore || 0
        });

        results.push({ clientId: client.id, clientName: client.name, ok: true });
      } catch (e) {
        errors.push({ clientId: client.id, error: e.message });
      }

      // Rate limit buffer
      await new Promise(r => setTimeout(r, 400));
    }

    res.json({ success: true, synced: results.length, errors: errors.length, results, errors });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
```

### 4.6 Contoh API Function: api/clients/index.js

```javascript
// api/clients/index.js
import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        social_insights (
          year_month, social, ads, comparison, overall_score, synced_at
        )
      `)
      .order('id');

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Format data untuk kompatibilitas dengan frontend
    const formatted = data.map(c => ({
      id: c.id,
      name: c.name,
      industry: c.industry,
      pic: c.pic,
      budget: c.budget,
      metaId: c.meta_ad_account_id,
      color: c.color,
      status: c.status,
      kpiTargets: c.kpi_targets,
      social: c.social_insights?.[0]?.social || null,
      ads: c.social_insights?.[0]?.ads || null,
      comparison: c.social_insights?.[0]?.comparison || null,
      overallScore: c.social_insights?.[0]?.overall_score || 0,
      syncedAt: c.social_insights?.[0]?.synced_at || null
    }));

    return res.json({ success: true, data: formatted, total: formatted.length });
  }

  if (req.method === 'POST') {
    const body = req.body;
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: body.name,
        industry: body.industry,
        pic: body.pic,
        budget: body.budget,
        meta_ad_account_id: body.metaId,
        facebook_page_id:   body.facebookPageId,
        instagram_user_id:  body.instagramUserId,
        color: body.color || '#6366F1',
        status: body.status || 'Active',
        kpi_targets: body.kpiTargets || {}
      })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
```

### 4.7 Contoh API: api/content/posts.js

```javascript
// api/content/posts.js
import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  const { clientId, yearMonth } = req.query;

  if (req.method === 'GET') {
    const startDate = `${yearMonth}-01`;
    const [yr, mo] = yearMonth.split('-').map(Number);
    const endDate = new Date(yr, mo, 0).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('content_posts')
      .select('*')
      .eq('client_id', clientId)
      .gte('post_date', startDate)
      .lte('post_date', endDate)
      .order('post_date', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'POST') {
    const body = req.body;
    const { data, error } = await supabase
      .from('content_posts')
      .insert({
        client_id: body.clientId,
        type:       body.type,
        title:      body.title,
        post_date:  body.date,
        platform:   body.platform,
        likes:      body.likes || 0,
        comments:   body.comments || 0,
        reach:      body.reach || 0,
        views:      body.views || 0,
        note:       body.note
      })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const { error } = await supabase
      .from('content_posts')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
```

---

## 5. Deploy Frontend ke Vercel

### 5.1 Siapkan File Frontend

Salin `pm-dashboard-v4.html` ke folder `public/index.html`:

```bash
cp pm-dashboard-v4.html public/index.html
```

Lalu update `API_BASE` di bagian atas script di `public/index.html`:

```javascript
// Ganti baris ini:
const API = "http://localhost:3001/api";

// Menjadi:
const API = "/api";   // Relative path — otomatis pakai domain yang sama di Vercel
```

### 5.2 Push ke GitHub

```bash
# Inisialisasi git (jika belum)
cd pm-dashboard
git init
git add .
git commit -m "Initial commit: PM Dashboard v4"

# Buat repo di GitHub.com, lalu:
git remote add origin https://github.com/USERNAME/pm-dashboard.git
git branch -M main
git push -u origin main
```

### 5.3 Connect ke Vercel

```bash
# Di folder project
vercel

# Ikuti prompt:
# ? Set up and deploy "pm-dashboard"? → Y
# ? Which scope? → pilih akun Anda
# ? Link to existing project? → N
# ? What's your project's name? → pm-dashboard
# ? In which directory is your code located? → ./
# ? Override settings? → N
```

Atau via dashboard:
1. Buka [vercel.com/new](https://vercel.com/new)
2. **"Import Git Repository"** → pilih repo `pm-dashboard`
3. Klik **"Deploy"**

---

## 6. Konfigurasi Environment Variables

### 6.1 Di Vercel Dashboard

1. Buka project di [vercel.com](https://vercel.com)
2. **Settings → Environment Variables**
3. Tambahkan satu per satu:

| Variable | Value | Environment |
|----------|-------|-------------|
| `META_ACCESS_TOKEN` | `EAAxxxx...` | Production, Preview |
| `META_APP_ID` | `1234567890` | Production, Preview |
| `META_APP_SECRET` | `abcdef...` | Production, Preview |
| `META_API_VERSION` | `v19.0` | All |
| `SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `SUPABASE_ANON_KEY` | `eyJxxx...` | All |
| `SUPABASE_SERVICE_KEY` | `eyJxxx...` | Production *(jangan di Preview/Dev)* |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/...` | Production |

4. Klik **"Save"**
5. **Redeploy** agar environment variables aktif: **Deployments → klik deployment terbaru → Redeploy**

### 6.2 Untuk Development Lokal

Buat file `.env.local` di root (sudah di-gitignore otomatis):

```env
# .env.local — JANGAN commit file ini!

META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxx
META_APP_ID=1234567890
META_APP_SECRET=abcdef123456

META_API_VERSION=v19.0
META_BASE_URL=https://graph.facebook.com

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Jalankan dev server:

```bash
vercel dev
# Server berjalan di http://localhost:3000
```

---

## 7. Koneksi Frontend → Backend → Supabase

### 7.1 Update Frontend untuk Pakai API Backend

Di `public/index.html`, fungsi `saveContent()` yang sebelumnya pakai `localStorage` perlu diupdate untuk memanggil API:

```javascript
// Ganti fungsi saveContent() di index.html:
async function saveContent() {
  const clientId = document.getElementById('fc_client').value;
  if (!clientId) { toast('Pilih client','e'); return; }
  const title   = document.getElementById('fc_title').value.trim();
  const dateVal = document.getElementById('fc_date').value;
  if (!title || !dateVal) { toast('Lengkapi form','e'); return; }

  const post = {
    clientId: +clientId,
    type:     document.getElementById('fc_type').value,
    title,
    date:     dateVal,
    platform: document.getElementById('fc_platform').value,
    likes:    +document.getElementById('fc_likes').value || 0,
    comments: +document.getElementById('fc_comments').value || 0,
    reach:    +document.getElementById('fc_reach').value || 0,
    views:    +document.getElementById('fc_views').value || 0,
    note:     document.getElementById('fc_note').value.trim()
  };

  try {
    // Coba simpan ke API (Supabase via backend)
    await apiFetch('/content/posts', {
      method: 'POST',
      body: JSON.stringify(post)
    });
    toast(`Konten "${title}" tersimpan ke database!`, 's');
  } catch {
    // Fallback ke localStorage jika API gagal
    const ym = dateVal.slice(0, 7);
    const posts = loadPosts(clientId, ym);
    posts.push({ id: genPostId(), ...post, createdAt: new Date().toISOString() });
    savePosts(clientId, ym, posts);
    toast(`Konten tersimpan lokal (offline mode)`, 'w');
  }

  closeModal('modalAddContent');
  if (S.page === 'content') render();
}
```

### 7.2 Load Content dari API + Fallback localStorage

```javascript
// Fungsi hybrid: coba API dulu, fallback ke localStorage
async function loadPostsHybrid(clientId, yearMonth) {
  if (S.online) {
    try {
      const r = await apiFetch(`/content/posts?clientId=${clientId}&yearMonth=${yearMonth}`);
      return r.data || [];
    } catch {}
  }
  return loadPosts(clientId, yearMonth); // localStorage fallback
}
```

---

## 8. Setup Cron Job Otomatis di Vercel

Cron job sudah dikonfigurasi di `vercel.json`:

```json
"crons": [
  {
    "path": "/api/sync/all",
    "schedule": "0 */6 * * *"
  }
]
```

**Catatan:** Vercel Cron tersedia di paket **Pro** ($20/bulan). Alternatif gratis:

### Alternatif Cron Gratis

**Option A: GitHub Actions (gratis)**

Buat file `.github/workflows/sync.yml`:

```yaml
name: Sync Meta Data

on:
  schedule:
    - cron: '0 */6 * * *'   # Setiap 6 jam
  workflow_dispatch:          # Bisa trigger manual

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.VERCEL_CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{"datePreset":"last_30d"}' \
            https://pm-dashboard.vercel.app/api/sync/all
```

Di GitHub repo: **Settings → Secrets → Actions → New repository secret**
- Name: `VERCEL_CRON_SECRET`
- Value: buat random string panjang

**Option B: cron-job.org (gratis)**

1. Daftar di [cron-job.org](https://cron-job.org)
2. Buat job baru:
   - URL: `https://pm-dashboard.vercel.app/api/sync/all`
   - Method: POST
   - Schedule: Every 6 hours

---

## 9. Custom Domain (Opsional)

### 9.1 Di Vercel

1. **Project → Settings → Domains**
2. Klik **"Add Domain"**
3. Masukkan domain Anda: `dashboard.namaagency.com`
4. Vercel akan memberikan DNS records

### 9.2 Konfigurasi DNS

Di provider domain Anda (Cloudflare, Niagahoster, dll), tambahkan:

| Type | Name | Value |
|------|------|-------|
| CNAME | `dashboard` | `cname.vercel-dns.com` |

Atau jika root domain:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |

SSL otomatis aktif dalam 2-5 menit setelah DNS propagasi.

---

## 10. Troubleshooting

### ❌ "Function timeout" saat sync

**Penyebab:** Meta API lambat, melebihi batas 30 detik Vercel.

**Solusi:** Sync per client, bukan semua sekaligus:

```javascript
// Di vercel.json, naikkan maxDuration:
"functions": {
  "api/sync/all.js": { "maxDuration": 60 }
}
// Catatan: maxDuration 60s butuh paket Pro
```

Atau buat endpoint per client:

```
POST /api/sync/client/1
POST /api/sync/client/2
```

---

### ❌ "Invalid OAuth token" dari Meta API

**Penyebab:** Token expired (long-lived token berlaku 60 hari).

**Solusi:** Refresh token sebelum expired:

```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=APP_ID&\
client_secret=APP_SECRET&\
fb_exchange_token=TOKEN_LAMA"
```

Update `META_ACCESS_TOKEN` di Vercel → Environment Variables → Redeploy.

**Pencegahan:** Gunakan **System User Token** di Meta Business Suite — tidak pernah expire.

---

### ❌ Supabase "row level security" error

**Penyebab:** Policy belum dibuat atau salah key.

**Solusi:** Pastikan menggunakan `SUPABASE_SERVICE_KEY` (bukan anon key) di backend. Service key bypass RLS otomatis.

---

### ❌ CORS error di browser

**Penyebab:** API dipanggil dari domain berbeda.

**Solusi:** Tambahkan CORS headers di setiap API function:

```javascript
// Di setiap api/*.js, tambahkan di awal handler:
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
if (req.method === 'OPTIONS') return res.status(200).end();
```

---

### ❌ Build gagal di Vercel

**Cek logs:** Vercel Dashboard → Deployments → klik deployment → **View Function Logs**

**Penyebab umum:**

```bash
# Error: Cannot use import statement
# Solusi: tambahkan di package.json:
"type": "module"

# Atau ubah semua import ke require():
const { createClient } = require('@supabase/supabase-js');
```

---

### ✅ Checklist Sebelum Go Live

- [ ] Semua environment variables sudah diset di Vercel
- [ ] Meta Access Token masih valid (cek expiry)
- [ ] Supabase tables sudah dibuat (jalankan SQL schema)
- [ ] Test endpoint `/api/health` → response `{"status":"ok"}`
- [ ] Test endpoint `/api/clients` → response list clients
- [ ] Test sync manual via Postman/curl ke `/api/sync/all`
- [ ] Frontend bisa load data dari `/api/clients`
- [ ] Cron job atau GitHub Actions sudah dikonfigurasi
- [ ] Custom domain sudah pointing ke Vercel (jika pakai)
- [ ] SSL certificate aktif (otomatis dari Vercel)

---

## Estimasi Biaya

| Layanan | Free Tier | Batasan |
|---------|-----------|---------|
| **Vercel** | Gratis | 100GB bandwidth, serverless functions unlimited invocations |
| **Supabase** | Gratis | 500MB database, 2GB bandwidth, 50MB file storage |
| **Meta API** | Gratis | Rate limit per app |
| **GitHub Actions** | Gratis | 2,000 menit/bulan |

**Total biaya untuk tim kecil (~5 client): Rp 0/bulan** ✅

Jika traffic besar atau butuh cron job native Vercel:
- Vercel Pro: $20/bulan
- Supabase Pro: $25/bulan

---

*Tutorial ini dibuat untuk PM Dashboard v4.0 · Juni 2026*
