# ⚡ InstaRate — Rate Akun Instagram Pake AI

Rate + roasting akun Instagram dengan **screenshot nyata** via Puppeteer + analisis Google Gemini AI.
Dibuat oleh [@rafiansya__](https://instagram.com/rafiansya__).

## 🔄 Flow Sistem

```
User input username
       ↓
Validasi username (client + server)
       ↓
Rate limit check (per IP, server-side)
       ↓
Puppeteer buka instagram.com/username
       ↓
   Akun ada?
   ├── TIDAK  → return "akun tidak ditemukan"
   ├── PRIVATE → screenshot halaman private → kirim ke Gemini
   └── PUBLIK  → screenshot embed/profil   → kirim ke Gemini
       ↓
Gemini analisis gambar → JSON (score + roast + saran)
       ↓
Tampil hasil ke user + bisa share sebagai gambar
```

## 🏗️ Struktur File

```
instarate/
├── lib/
│   ├── screenshot.js   # Puppeteer — ambil screenshot IG
│   ├── gemini.js       # Wrapper Gemini API (server-only, support image)
│   ├── rateLimit.js    # IP-based rate limiter
│   └── validate.js     # Validasi username
├── pages/
│   ├── api/
│   │   ├── rate.js     # POST /api/rate — main endpoint
│   │   └── health.js   # GET /api/health
│   ├── _app.js
│   ├── _document.js
│   └── index.js        # UI
├── styles/globals.css
├── Dockerfile          # Include Chrome deps untuk Puppeteer
├── railway.json        # Railway deploy config
├── render.yaml         # Render deploy config
├── .env.local          # API key (JANGAN di-commit!)
└── .env.example
```

## 🚀 Setup Local

```bash
npm install

# Puppeteer akan auto-download Chromium (~170MB) saat npm install
# Pastikan koneksi internet stabil

cp .env.example .env.local
# Edit .env.local, isi GEMINI_API_KEY

npm run dev
# Buka http://localhost:3000
```

## ☁️ Deploy ke Railway (Rekomendasi)

1. Push project ke GitHub
2. Buka [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Pilih repo → Railway auto-detect `railway.json` + `Dockerfile`
4. Di tab **Variables**, tambah:
   - `GEMINI_API_KEY` = API key lo
   - `RATE_LIMIT_PER_HOUR` = `5`
5. Deploy! Railway akan build Docker image dengan Chrome

## ☁️ Deploy ke Render

1. Push ke GitHub
2. Buka [render.com](https://render.com) → New Web Service
3. Connect repo → Render auto-detect `render.yaml`
4. Isi `GEMINI_API_KEY` di Environment
5. Deploy

## ⚙️ Environment Variables

| Variable | Wajib | Default | Keterangan |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | - | Google AI Studio API key |
| `RATE_LIMIT_PER_HOUR` | ❌ | `5` | Max request per IP per jam |
| `PUPPETEER_EXECUTABLE_PATH` | ❌ | auto | Path Chromium (di-set otomatis di Docker) |

## 📊 Estimasi Kapasitas

- Setiap request butuh ~5-15 detik (Puppeteer + Gemini)
- Gemini 2.0 Flash free: ~1500 req/hari
- Rate limit 5/IP/jam → aman untuk 200-300 user unik/hari
- Railway Starter: $5/bulan, cukup untuk traffic ini
