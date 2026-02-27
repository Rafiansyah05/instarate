# ⚡ InstaRate — Rate Akun Instagram Pake AI

Rate + roasting akun Instagram dengan **screenshot nyata** via Puppeteer + analisis Google Gemini AI.
Dibuat oleh [@rafiansya\_\_](https://instagram.com/rafiansya__).

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
