import { checkRateLimit, getClientIp } from '../../lib/rateLimit';
import { buildPrompt, callGemini, parseGeminiResponse } from '../../lib/gemini';
import { validateUsername } from '../../lib/validate';
import { getInstagramScreenshot } from '../../lib/screenshot';

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username: rawUsername } = req.body || {};
  const validation = validateUsername(rawUsername);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.message });
  }
  const username = validation.username;

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);

  if (!rl.allowed) {
    res.setHeader('Retry-After', rl.resetInSeconds);
    return res.status(429).json({
      error: `Slow down! Coba lagi dalam ${Math.ceil(rl.resetInSeconds / 60)} menit ya.`,
      retryAfter: rl.resetInSeconds,
    });
  }

  try {
    console.log(`[rate] Screenshotting @${username}...`);
    const shot = await getInstagramScreenshot(username);
    console.log(`[rate] @${username} → exists=${shot.exists}, private=${shot.isPrivate}, method=${shot.method}`);

    if (!shot.exists) {
      return res.status(200).json({ ok: true, username, valid: false, reason: 'Akun tidak ditemukan' });
    }

    const prompt = buildPrompt({
      username,
      isPrivate: shot.isPrivate,
      hasScreenshot: !!shot.screenshotBase64,
      loginWall: !!shot.loginWall,
    });

    const raw = await callGemini(prompt, shot.screenshotBase64 || null);
    const result = parseGeminiResponse(raw);

    return res.status(200).json({
      ok: true,
      username,
      ...result,
      isPrivate: shot.isPrivate,
      screenshotMethod: shot.method,
    });
  } catch (err) {
    console.error(`[/api/rate] Error for "${username}":`, err.message);
    const msg = err.message || '';
    if (msg === 'QUOTA_EXCEEDED') return res.status(503).json({ error: 'API overload / quota habis. Coba lagi!' });
    if (msg === 'API_KEY_INVALID') return res.status(500).json({ error: 'Server configuration error.' });
    if (msg === 'SAFETY_BLOCKED') return res.status(422).json({ error: 'AI nge-block konten ini. Coba username lain.' });
    if (msg.includes('timeout') || msg.includes('terhubung')) return res.status(504).json({ error: 'Timeout. Coba lagi!' });
    return res.status(500).json({ error: 'Terjadi kesalahan server. Coba lagi!' });
  }
}
