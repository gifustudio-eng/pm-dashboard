# PM Dashboard v4.0

Dashboard monitoring performa Meta Ads & Social Media untuk multiple client.

## Stack
- **Frontend:** Static HTML/CSS/JS (di `public/index.html`)
- **Backend:** Vercel Serverless Functions (`api/`)
- **Database:** Supabase (PostgreSQL)
- **Meta API:** Graph API v19.0

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Salin dan isi environment variables
cp .env.example .env.local
# Edit .env.local dengan kredensial Anda

# 3. Setup database Supabase
# Jalankan schema.sql di Supabase SQL Editor

# 4. Jalankan lokal
vercel dev

# 5. Deploy ke production
./scripts/deploy.sh
```

## Struktur Folder
```
pm-dashboard/
├── api/               ← Vercel Serverless Functions
│   ├── health.js
│   ├── clients/
│   ├── sync/
│   ├── dashboard/
│   └── content/
├── lib/               ← Shared utilities
│   ├── supabase.js
│   ├── metaApi.js
│   └── cors.js
├── public/            ← Frontend static files
│   └── index.html
├── config/            ← Konfigurasi client (fallback)
├── scripts/           ← Helper scripts
├── .github/workflows/ ← GitHub Actions cron
├── schema.sql         ← Database schema Supabase
├── vercel.json        ← Konfigurasi Vercel
└── .env.example       ← Template environment variables
```

## Environment Variables
Lihat `.env.example` untuk daftar lengkap variabel yang dibutuhkan.

## Tutorial Deployment
Lihat `DEPLOYMENT_TUTORIAL.md` untuk panduan lengkap.
