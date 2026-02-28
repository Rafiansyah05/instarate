const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function buildPrompt({ username, isPrivate, hasScreenshot, loginWall }) {
  const base = `Kamu adalah seorang psikolog sosial digital yang ahli membaca kepribadian seseorang dari akun Instagram mereka.
Tugas kamu: analisis akun Instagram @${username} dan tebak karakter pemiliknya secara detail dan akurat.

KARAKTERISTIK BAHASA:
- Bahasa Indonesia santai, tidak baku, tidak formal
- JANGAN pakai "lo", "gue" — pakai "kamu", "dia", "mereka"
- Nada: hangat, intriguing, kayak lagi ngomongin gosip tapi berbobot
- Bikin pembaca ngerasa "ih iya bener juga" atau "waduh ketahuan"

INSTRUKSI OUTPUT SANGAT PENTING:
- Kembalikan HANYA JSON valid, tidak ada teks apapun sebelum atau sesudah JSON
- Langsung mulai dengan karakter { dan akhiri dengan }
- Di dalam field "roast", gunakan \\n\\n untuk jarak antar bagian
- Untuk judul bagian gunakan format ##JUDUL## (pakai ## di awal dan akhir)
- Tiap bagian maksimal 3 kalimat, padat dan langsung
- JANGAN potong di tengah kalimat

Format JSON yang harus dikembalikan:
{"score":<angka 0.0-10.0>,"roast":"##KEPRIBADIAN UTAMA##\\n\\n<3 kalimat>\\n\\n##GAYA HIDUP & KEBIASAAN##\\n\\n<3 kalimat>\\n\\n##CARA BERSOSIALISASI##\\n\\n<3 kalimat>\\n\\n##YANG DIA INSECURE##\\n\\n<3 kalimat>\\n\\n##COCOK SAMA SIAPA##\\n\\n<3 kalimat tentang tipe pasangan yang cocok dan red flag-nya>"}`;

  if (hasScreenshot && !isPrivate) {
    return `${base}

Kamu diberikan SCREENSHOT profil Instagram @${username}. Ini akun PUBLIK.
Analisis semua detail yang terlihat:
- Foto profil: ekspresi, setting, filter — ungkapkan tentang kepribadiannya
- Bio: pilihan kata, emoji, apa yang ditulis dan tidak ditulis
- Grid feed: tema warna, jenis konten, konsistensi, effort
- Angka followers vs following: selektif atau butuh validasi?
- Frekuensi posting: konsisten atau posting kalau mood aja?
Semua analisis harus SPESIFIK dari gambar.`;
  }

  if (hasScreenshot && isPrivate) {
    return `${base}

Kamu diberikan SCREENSHOT profil Instagram @${username}. Ini akun PRIVATE.
Feed tidak kelihatan, analisis dari yang tersisa:
- Foto profil: apa yang dipilih sebagai wajah publik?
- Bio: apa yang ditulis padahal akunnya private?
- Angka followers vs following: circle-nya kecil dan selektif?
- Keputusan untuk private: ungkapkan apa tentang kepribadiannya?`;
  }

  if (loginWall) {
    return `${base}

Akun Instagram @${username} tidak bisa diakses.
Analisis kepribadian dari nama username-nya saja — pilihan nama username mengungkapkan banyak hal tentang seseorang.`;
  }

  if (isPrivate) {
    return `${base}

Akun @${username} private dan tidak bisa dilihat.
Analisis dari nama username + pola kepribadian orang yang memilih untuk private akun.`;
  }

  return `${base}

Analisis kepribadian @${username} dari nama username-nya saja.
Pilihan username mencerminkan cara dia ingin dikenal, nilai yang dia pegang, dan cara dia melihat dirinya sendiri.`;
}

async function callModel(modelName, prompt, screenshotBase64) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `${BASE_URL}/${modelName}:generateContent?key=${apiKey}`;

  const parts = [];
  if (screenshotBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshotBase64 } });
  }
  parts.push({ text: prompt });

  // Matiin thinking mode untuk model 2.5 (biar langsung output JSON)
  const isThinkingModel = modelName.includes('2.5');
  const generationConfig = {
    temperature: 0.85,
    maxOutputTokens: 2048,
    topP: 0.9,
    ...(isThinkingModel && { thinkingConfig: { thinkingBudget: 0 } }),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(30000),
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

  // Ambil semua parts text (model thinking kadang split jadi beberapa parts)
  const allParts = data?.candidates?.[0]?.content?.parts || [];
  const text = allParts
    .filter((p) => p.text && !p.thought) // skip thought/thinking parts
    .map((p) => p.text)
    .join('');

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
      if (err.status === 403) throw new Error('API_KEY_INVALID');
      if (err.status === 422) throw new Error('SAFETY_BLOCKED');
      continue;
    }
  }

  const status = lastError?.status;
  if (status === 429) throw new Error('QUOTA_EXCEEDED');
  throw new Error(`ALL_MODELS_FAILED: ${lastError?.message}`);
}

export function parseGeminiResponse(raw) {
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Cari JSON — ambil yang paling lengkap (dari { pertama sampai } terakhir)
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    console.warn('[gemini] No JSON found, using raw text');
    return {
      valid: true,
      score: 5.0,
      roast: cleaned.slice(0, 3000) || 'Analisis tidak tersedia, coba lagi.',
    };
  }

  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    const score = Math.min(10, Math.max(0, parseFloat(parsed.score) || 5));
    return {
      valid: true,
      score: Math.round(score * 10) / 10,
      roast: (parsed.roast || parsed.analisis || parsed.result || cleaned).slice(0, 3000),
    };
  } catch (e) {
    // JSON malformed karena terpotong — coba extract roast manual
    console.warn('[gemini] JSON malformed, extracting manually:', e.message);

    // Coba ambil value dari field "roast" secara manual
    const roastMatch = jsonStr.match(/"roast"\s*:\s*"([\s\S]*?)"\s*[,}]/);
    if (roastMatch) {
      const scoreMatch = jsonStr.match(/"score"\s*:\s*([\d.]+)/);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 5.0;
      return {
        valid: true,
        score: Math.min(10, Math.max(0, score)),
        roast: roastMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 3000),
      };
    }

    // Last resort — pakai raw text
    return {
      valid: true,
      score: 5.0,
      roast: cleaned.slice(0, 3000),
    };
  }
}
