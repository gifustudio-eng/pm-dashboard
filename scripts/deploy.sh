#!/bin/bash
# ============================================================
# scripts/deploy.sh
# One-command deployment ke Vercel + Supabase
# Jalankan: chmod +x scripts/deploy.sh && ./scripts/deploy.sh
# ============================================================

set -e  # Exit on any error

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      PM Dashboard — Deploy ke Vercel             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Warna
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# ── 1. Cek Prerequisites ────────────────────────────────
echo "📋 Mengecek prerequisites..."

command -v node   >/dev/null 2>&1 || err "Node.js tidak ditemukan. Install dari nodejs.org"
command -v npm    >/dev/null 2>&1 || err "npm tidak ditemukan"
command -v git    >/dev/null 2>&1 || err "Git tidak ditemukan"
command -v vercel >/dev/null 2>&1 || { warn "Vercel CLI belum terinstall. Installing..."; npm install -g vercel; }

ok "Node.js $(node -v)"
ok "npm $(npm -v)"
ok "Vercel CLI $(vercel --version 2>/dev/null | head -1)"

# ── 2. Cek .env.local ──────────────────────────────────
echo ""
echo "🔑 Mengecek konfigurasi..."

if [ ! -f ".env.local" ]; then
  warn ".env.local tidak ditemukan!"
  echo "   Menyalin dari .env.example..."
  cp .env.example .env.local
  err "Isi dulu .env.local dengan credentials Anda, lalu jalankan script ini lagi"
fi

# Cek variabel wajib
check_env() {
  local key=$1
  local val=$(grep "^${key}=" .env.local | cut -d'=' -f2-)
  if [ -z "$val" ] || echo "$val" | grep -q "your_"; then
    err "${key} belum dikonfigurasi di .env.local"
  fi
  ok "${key} ✓"
}

check_env "SUPABASE_URL"
check_env "SUPABASE_SERVICE_KEY"
check_env "META_ACCESS_TOKEN"

# ── 3. Install Dependencies ────────────────────────────
echo ""
echo "📦 Menginstall dependencies..."
npm install --silent
ok "Dependencies terinstall"

# ── 4. Setup Database Supabase ─────────────────────────
echo ""
echo "🗄️  Setup database Supabase..."
echo "   Jalankan schema SQL di Supabase? (y/n)"
read -r SETUP_DB
if [ "$SETUP_DB" = "y" ] || [ "$SETUP_DB" = "Y" ]; then
  node scripts/db-setup.js
  ok "Database siap"
else
  warn "Skip setup DB — pastikan tabel sudah dibuat manual"
fi

# ── 5. Copy Frontend ───────────────────────────────────
echo ""
echo "🎨 Menyiapkan frontend..."

if [ ! -f "public/index.html" ]; then
  if ls pm-dashboard-v*.html >/dev/null 2>&1; then
    LATEST=$(ls -v pm-dashboard-v*.html | tail -1)
    cp "$LATEST" public/index.html
    ok "Frontend disalin dari $LATEST"
  else
    err "File pm-dashboard-v4.html tidak ditemukan di folder ini"
  fi
else
  ok "public/index.html sudah ada"
fi

# Update API_BASE di frontend
if grep -q "localhost:3001" public/index.html; then
  sed -i.bak 's|http://localhost:3001/api|/api|g' public/index.html
  rm -f public/index.html.bak
  ok "API_BASE diupdate ke /api (relative path)"
fi

# ── 6. Git ─────────────────────────────────────────────
echo ""
echo "📁 Git setup..."

if [ ! -d ".git" ]; then
  git init
  ok "Git repository diinisialisasi"
fi

git add -A
git diff --staged --quiet || {
  git commit -m "🚀 Deploy PM Dashboard v4.0 — $(date '+%Y-%m-%d %H:%M')"
  ok "Changes committed"
}

# Push ke remote jika ada
if git remote get-url origin >/dev/null 2>&1; then
  info "Pushing ke GitHub..."
  git push origin main 2>/dev/null || git push origin master 2>/dev/null || warn "Push gagal — cek remote URL"
else
  warn "Belum ada GitHub remote. Tambahkan dengan:"
  echo "   git remote add origin https://github.com/USERNAME/pm-dashboard.git"
  echo "   git push -u origin main"
fi

# ── 7. Deploy ke Vercel ────────────────────────────────
echo ""
echo "🚀 Deploying ke Vercel..."
echo ""

# Set env vars ke Vercel
info "Setting environment variables di Vercel..."
while IFS= read -r line; do
  # Skip comments dan baris kosong
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue

  KEY=$(echo "$line" | cut -d'=' -f1)
  VAL=$(echo "$line" | cut -d'=' -f2-)

  if [ -n "$KEY" ] && [ -n "$VAL" ]; then
    echo "$VAL" | vercel env add "$KEY" production --force 2>/dev/null || true
  fi
done < .env.local

ok "Environment variables diset"

# Deploy!
echo ""
echo "🚀 Deploying to production..."
vercel --prod --yes

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           ✅ DEPLOY BERHASIL!                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "🔗 Dashboard URL: $(vercel ls --prod 2>/dev/null | grep https | head -1 | awk '{print $2}')"
echo ""
echo "📌 Langkah selanjutnya:"
echo "   1. Cek https://dashboard-url.vercel.app/api/health"
echo "   2. Test sync: POST https://dashboard-url.vercel.app/api/sync/all"
echo "   3. Setup GitHub Actions secrets:"
echo "      - DASHBOARD_URL = URL Vercel Anda"
echo "      - VERCEL_CRON_SECRET = nilai CRON_SECRET dari .env.local"
echo ""
