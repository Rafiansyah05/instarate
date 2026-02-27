const store = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_HOUR || '5', 10);

if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      const cutoff = Date.now() - WINDOW_MS;
      for (const [ip, timestamps] of store.entries()) {
        const fresh = timestamps.filter((t) => t > cutoff);
        if (fresh.length === 0) store.delete(ip);
        else store.set(ip, fresh);
      }
    },
    10 * 60 * 1000,
  );
}

export function checkRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const raw = store.get(ip) || [];
  const timestamps = raw.filter((t) => t > cutoff);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = Math.min(...timestamps);
    const resetInSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  timestamps.push(now);
  store.set(ip, timestamps);
  return { allowed: true, remaining: MAX_REQUESTS - timestamps.length, resetInSeconds: 0 };
}

export function getClientIp(req) {
  return req.headers['x-real-ip'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}
