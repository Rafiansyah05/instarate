const MODELS = [
  'gemini-2.5-flash-lite', // paling hemat quota
  'gemini-2.0-flash-lite', // fallback
  'gemini-2.0-flash', // fallback
  'gemini-2.5-flash', // fallback terakhir
];

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function buildPrompt({ username, isPrivate, hasScreenshot, loginWall }) {
  const base = `Kamu adalah roaster Instagram dari Kota Medan, Sumatera Utara. Gaya bicara kamu khas Medan asli.

KARAKTERISTIK BAHASA YANG WAJIB DIPAKAI:
- Nada bicara tegas, blak-blakan, langsung ke intinya — khas Medan
- Partikel wajib: "lah" (penegasan), "kali" (sangat/banget), "pun" (juga), "lho" (penekanan), "bah" (ekspresi khas Medan)
- Kata khas Medan: "goblok kali", "mana ada", "ya udah lah", "kau ini", "godang" (besar), "horas", "terkenal kali kau ya"
- Struktur kalimat pendek, tegas, tidak bertele-tele: "Kau ini kenapa lah?", "Mana ada yang lihat bah.", "Bagus kali kau pikir ya."
- Sering pakai "kau" untuk kata ganti orang kedua (bukan "lo" atau "kamu")
- Intonasi naik di akhir kalimat saat menegaskan, kayak setengah nanya setengah nyindir
- Ekspresi khas: "Ya Allah bah", "Aduh lah kau ini", "Mau apa kau sebenarnya?"
- JANGAN pakai bahasa Jawa, Papua, atau slang Jakarta
- JANGAN formal dan kaku

ATURAN ROASTING:
- Jokes SPESIFIK dan PERSONAL ke akun ini, bukan generik
- Gaya Medan itu blak-blakan tapi tetap lucu — bukan kasar
- Tiap kalimat harus ada punchline yang langsung nohok
- Boleh dark humor tipis-tipis tapi AMAN (no SARA, no vulgar, no bully personal)
- Panjang: 3-4 kalimat padat
- Skor berdasarkan estetika dan isi akun, jujur dan bervariasi (jangan selalu 5-7)

CONTOH GAYA KALIMAT YANG BENAR:
- "Followers kau segitu ji, mana ada yang peduli bah."
- "Feed kau bagus kali ya, sayang yang lihat cuma kau sendiri lah."
- "Bio kau panjang kali, tapi kosong isinya bah — kayak hidup kau."
- "Kau posting tiap hari tapi engagement-nya nol kali, ya Allah bah."
- "Private pula akunnya, terkenal kali kau pikir ya?"

KEMBALIKAN HANYA JSON ini, tidak ada teks lain:
{
  "score": <angka 0.0-10.0>,
  "roast": "<3-4 kalimat roasting khas Medan, tiap kalimat ada punchline>"
}`;

  if (hasScreenshot && !isPrivate) {
    return `${base}

Kamu diberikan SCREENSHOT profil Instagram @${username}.
Roast SPESIFIK dari apa yang kamu lihat: foto profil, bio, grid feed, angka followers/following.
Kalau following lebih banyak dari followers — hajar. Kalau bio-nya lebay — hajar. Kalau feed-nya kosong atau berantakan — hajar. Semua pakai gaya Medan yang blak-blakan dan langsung.`;
  }

  if (hasScreenshot && isPrivate) {
    return `${base}

Screenshot profil @${username} ada tapi akunnya PRIVATE.
Roast dari apa yang masih kelihatan (foto profil, nama, bio, angka followers/following).
Sisipkan jokes "kenapa private lah kau? ada apa di dalamnya bah?" dengan gaya Medan yang tegas dan langsung nohok.`;
  }

  if (loginWall) {
    return `${base}

Instagram susah di-screenshot, macam akun @${username} ini artis kali ya sampe dijaga ketat bah.
Roast dari nama username-nya + jokes gaya Medan soal betapa lebaynya akun ini ngerasa penting lah.`;
  }

  if (isPrivate) {
    return `${base}

Akun @${username} private, tidak bisa di-screenshot sama sekali.
Roast dari nama username-nya + jokes gaya Medan: "private pula, terkenal kali kau pikir ya bah?"`;
  }

  return `${base}

Roast akun @${username} dari nama username-nya saja.
Analisis karakter orangnya dari nama itu, lalu hajar dengan gaya Medan yang blak-blakan dan langsung nohok.`;
}

async function callModel(modelName, prompt, screenshotBase64) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `${BASE_URL}/${modelName}:generateContent?key=${apiKey}`;

  const parts = [];
  if (screenshotBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } });
  }
  parts.push({ text: prompt });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 700, topP: 0.9 },
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = '';
    try {
      detail = JSON.parse(body)?.error?.message || '';
    } catch (_) {}
    const err = new Error(`${res.status}: ${detail || body.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason === 'SAFETY') throw Object.assign(new Error('SAFETY_BLOCKED'), { status: 422 });

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`EMPTY_RESPONSE: finishReason=${finishReason}`);
  return text;
}

export async function callGemini(prompt, screenshotBase64 = null) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log(`[gemini] Trying model: ${model}`);
      const text = await callModel(model, prompt, screenshotBase64);
      console.log(`[gemini] ✅ Success with: ${model}`);
      return text;
    } catch (err) {
      console.warn(`[gemini] ❌ ${model} failed: ${err.message}`);
      lastError = err;

      // Kalau safety block atau auth error, jangan coba model lain
      if (err.status === 403) throw new Error('API_KEY_INVALID');
      if (err.status === 422) throw new Error('SAFETY_BLOCKED');

      // Kalau 429 (quota) atau 404 (model tidak ada), coba model berikutnya
      // Kalau error lain, tetap coba model berikutnya
      continue;
    }
  }

  // Semua model gagal
  const status = lastError?.status;
  if (status === 429) throw new Error('QUOTA_EXCEEDED');
  throw new Error(`ALL_MODELS_FAILED: ${lastError?.message}`);
}

export function parseGeminiResponse(raw) {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  const parsed = JSON.parse(match[0]);
  const score = Math.min(10, Math.max(0, parseFloat(parsed.score) || 5));
  return {
    valid: true,
    score: Math.round(score * 10) / 10,
    roast: (parsed.roast || '').slice(0, 600),
    saran: Array.isArray(parsed.saran) ? parsed.saran.slice(0, 5).map((s) => String(s).slice(0, 200)) : [],
  };
}
