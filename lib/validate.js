const IG_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function validateUsername(raw) {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, message: 'Username tidak boleh kosong.' };
  }
  const username = raw.replace(/^@/, '').trim();
  if (username.length === 0) return { ok: false, message: 'Username tidak boleh kosong.' };
  if (username.length > 30) return { ok: false, message: 'Username Instagram maksimal 30 karakter.' };
  if (!IG_USERNAME_RE.test(username)) return { ok: false, message: 'Username hanya boleh huruf, angka, titik, dan underscore.' };
  return { ok: true, username };
}
