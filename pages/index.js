import { useState, useRef, useEffect, useCallback } from 'react';
import { validateUsername } from '../lib/validate';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RL_KEY = 'ir_rl';

const STEP_LABELS = [(u) => `cari akun @${u}... `, () => 'Nicee, aku dapat akunmu', () => 'Weitt, analisis dulu yak...', () => 'Sabarr, dikit lagi ini...'];

function clientRl() {
  try {
    const { reqs = [] } = JSON.parse(localStorage.getItem(RL_KEY) || '{}');
    const now = Date.now();
    const fresh = reqs.filter((t) => t > now - RATE_WINDOW_MS);
    const allowed = fresh.length < RATE_LIMIT;
    const resetIn = allowed ? 0 : Math.ceil((Math.min(...fresh) + RATE_WINDOW_MS - now) / 60000);
    return { allowed, remaining: RATE_LIMIT - fresh.length, resetIn, fresh };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT, resetIn: 0, fresh: [] };
  }
}

function consumeClientRl(fresh) {
  try {
    localStorage.setItem(RL_KEY, JSON.stringify({ reqs: [...fresh, Date.now()] }));
  } catch (_) {}
}

function scoreColor(s) {
  if (s >= 8) return '#22c55e';
  if (s >= 6) return '#84cc16';
  if (s >= 4) return '#f59e0b';
  if (s >= 2) return '#f97316';
  return '#ef4444';
}

function verdict(s) {
  if (s >= 9) return '🔥 Sultan Konten';
  if (s >= 8) return '⭐ Top Tier';
  if (s >= 7) return '✨ Keren Cuy';
  if (s >= 6) return '👍 Lumayan Lah';
  if (s >= 5) return '😐 Biasa Aja';
  if (s >= 4) return '😅 Masih Belajar';
  if (s >= 3) return '💀 Butuh Bantuan';
  if (s >= 2) return '☠️ Gawat Darurat';
  return '🗑️ Yikes...';
}

function avatarEmoji(s) {
  if (s >= 8) return '🌟';
  if (s >= 6) return '😎';
  if (s >= 4) return '🤔';
  return '😬';
}

export default function Home() {
  const [username, setUsername] = useState('');
  const [phase, setPhase] = useState('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState({ emoji: '😵', title: 'Ada Error!', msg: '' });
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [rlWarning, setRlWarning] = useState('');
  const [usageText, setUsageText] = useState('AI aktif — siap nge-judge lo');
  const [usageDotClass, setUsageDotClass] = useState('usageDot');

  const shareCardRef = useRef(null);
  const inputRef = useRef(null);
  const scoreCircleRef = useRef(null);
  const scoreNumRef = useRef(null);
  const statsBarRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const rl = clientRl();
    if (!rl.allowed) {
      setUsageText(`Limit tercapai. Reset in ${rl.resetIn} menit`);
      setUsageDotClass('usageDot error');
    } else if (rl.remaining <= 2) {
      setUsageText(`Sisa ${rl.remaining}x lagi buat sejam ini`);
      setUsageDotClass('usageDot warn');
    }
  }, []);

  const showToast = useCallback((msg, duration = 3000) => {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
  }, []);

  const animateScore = useCallback((score) => {
    const color = scoreColor(score);
    const circle = scoreCircleRef.current;
    const numEl = scoreNumRef.current;
    const bar = statsBarRef.current;
    if (!circle || !numEl) return;
    circle.style.stroke = color;
    numEl.style.color = color;
    const offset = 201 - (score / 10) * 201;
    setTimeout(() => {
      circle.style.strokeDashoffset = offset;
      if (bar) {
        bar.style.width = score * 10 + '%';
        bar.style.background = `linear-gradient(90deg, ${color}, ${color}aa)`;
      }
    }, 150);
    let cur = 0;
    const step = score / 30;
    const timer = setInterval(() => {
      cur = Math.min(cur + step, score);
      numEl.textContent = cur.toFixed(1);
      if (cur >= score) {
        numEl.textContent = score;
        clearInterval(timer);
      }
    }, 40);
  }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    const delays = [0, 600, 1300, 2200];
    const timers = delays.map((d, i) => setTimeout(() => setStepIdx(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  useEffect(() => {
    if (phase === 'result' && result) {
      setTimeout(() => animateScore(result.score), 250);
    }
  }, [phase, result, animateScore]);

  async function handleRate() {
    const validation = validateUsername(username);
    if (!validation.ok) {
      showToast('⚠️ ' + validation.message);
      return;
    }
    const clean = validation.username;

    const rl = clientRl();
    if (!rl.allowed) {
      setRlWarning(`⏳ Slow down! Coba lagi ${rl.resetIn} menit lagi ya.`);
      setTimeout(() => setRlWarning(''), 5000);
      return;
    }

    setRlWarning('');
    setPhase('loading');
    setStepIdx(1);
    consumeClientRl(rl.fresh);

    try {
      const res = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: clean }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          const mins = data.retryAfter ? Math.ceil(data.retryAfter / 60) : '?';
          setError({ emoji: '⏳', title: 'Slow down!', msg: data.error || `Coba lagi ${mins} menit lagi.` });
        } else {
          setError({ emoji: '😵', title: 'Ada Error!', msg: data.error || 'Terjadi kesalahan. Coba lagi!' });
        }
        setPhase('error');
        return;
      }

      if (!data.valid) {
        setError({ emoji: '🤔', title: 'Akun Ga Ketemu!', msg: `Username "@${clean}" ga valid atau akun-nya ga ada. Cek lagi bro!` });
        setPhase('error');
        return;
      }

      setResult(data);
      setPhase('result');

      const rl2 = clientRl();
      if (rl2.remaining <= 2 && rl2.remaining > 0) {
        setUsageText(`Sisa ${rl2.remaining}x lagi buat sejam ini`);
        setUsageDotClass('usageDot warn');
      }
    } catch (err) {
      console.error(err);
      setError({ emoji: '🌐', title: 'Koneksi Gagal!', msg: 'Cek internet lo dan coba lagi.' });
      setPhase('error');
    }
  }

  function handleReset() {
    setPhase('idle');
    setResult(null);
    setStepIdx(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function shareImage(mode) {
    if (!shareCardRef.current) return;
    showToast('🎨 Lagi bikin gambar...');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#13131a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const uname = result?.username || 'akun';

      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `instarate_${uname}.png`;
        a.click();
        showToast('✅ Gambar berhasil didownload!');
        return;
      }

      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'instarate.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'InstaRate Result' });
            return;
          } catch (_) {}
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'instarate_story.png';
        a.click();
        showToast('📱 Download dulu, terus upload ke Story IG lo!', 4500);
      });
    } catch (e) {
      console.error(e);
      showToast('❌ Gagal bikin gambar. Coba lagi!');
    }
  }

  async function shareText() {
    const score = result?.score ?? '?';
    const text = `Akun Instagram @${result?.username} dapet skor ${score}/10 — ${verdict(score)} 🔥\n\nby @rafiansya__ | InstaRate `;
    try {
      await navigator.clipboard.writeText(text);
      showToast('✅ Teks berhasil di-copy!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('✅ Teks berhasil di-copy!');
    }
  }

  const isLoading = phase === 'loading';

  return (
    <>
      <div className="page">
        <header className="header">
          <h1 className="title">
            Rate Akun
            <br />
            <span className="gradient">Instagram</span>
          </h1>
          <p className="subtitle">Masukin username Instagram, terus AI bakal beri insight dan nebak karekterkmu wkkwkwkw</p>
        </header>

        <div className="card" style={isLoading ? { opacity: 0.55, pointerEvents: 'none' } : {}}>
          <p className="testPrivet">Pastikan akunmu ga privat ya..</p>

          <div className="inputWrapper">
            <span className="atSymbol">@</span>
            <input
              ref={inputRef}
              className="input"
              type="text"
              placeholder="username_instagram_lo"
              maxLength={30}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleRate()}
            />
          </div>
          <button className="btnRate" onClick={handleRate} disabled={isLoading}>
            <span className="shimmer" />
            {isLoading ? 'Lagi nganalisis...' : 'Lihat Sekarang!'}
          </button>
          {rlWarning && <div className="warningBanner">{rlWarning}</div>}
          <div className="usageRow">
            <div className={usageDotClass} />
            <span>{usageText}</span>
          </div>
        </div>

        {phase === 'loading' && (
          <div className="loadingSection">
            <div className="spinner">
              <div className="spinRing" />
              <div className="spinRing" />
              <div className="spinRing" />
            </div>
            <div className="stepList">
              {STEP_LABELS.map((label, i) => {
                const idx = i + 1;
                const cls = stepIdx > idx ? 'step done' : stepIdx === idx ? 'step active' : 'step';
                return (
                  <div key={i} className={cls}>
                    <div className="stepDot" />
                    <span>{label(username)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="errorSection">
            <div className="errorEmoji">{error.emoji}</div>
            <div className="errorTitle">{error.title}</div>
            <div className="errorMsg">{error.msg}</div>
            <button className="btnAgain" onClick={handleReset} style={{ marginTop: 16 }}>
              ↩ Coba Lagi
            </button>
          </div>
        )}

        {phase === 'result' && result && (
          <div className="resultSection">
            <div className="shareCard" ref={shareCardRef}>
              <div className="profileRow">
                <div className="avatar">{avatarEmoji(result.score)}</div>
                <div>
                  <div className="profileUsername">@{result.username}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <div className="platformTag">instagram.com</div>
                    {result.isPrivate && (
                      <div className="platformTag" style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa' }}>
                        Private
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="scoreSection">
                <div className="scoreCircleWrap">
                  <svg viewBox="0 0 80 80">
                    <circle className="circleTrack" cx="40" cy="40" r="32" />
                    <circle className="circleFill" ref={scoreCircleRef} cx="40" cy="40" r="32" />
                  </svg>
                  <div className="scoreNum" ref={scoreNumRef}>
                    0
                  </div>
                </div>
                <div className="scoreMeta">
                  <div className="scoreLabel">Skor Keseluruhan</div>
                  <div className="scoreVerdict">{verdict(result.score)}</div>
                  <div className="scoreDesc">Skor: {result.score}/10</div>
                  <div className="statsBar">
                    <div className="statsBarFill" ref={statsBarRef} />
                  </div>
                </div>
              </div>

              <div className="roastBox">
                <div className="roastLabel">Analisis AI</div>
                <div className="roastText">
                  {result.roast.split('\n\n').map((para, i) => {
                    const isTitle = para.startsWith('##') && para.endsWith('##');
                    if (isTitle) {
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: '1.5px',
                            color: '#ff3c6e',
                            marginTop: i === 0 ? '0' : '16px',
                            marginBottom: '6px',
                            fontStyle: 'normal',
                          }}
                        >
                          {para.replace(/##/g, '')}
                        </div>
                      );
                    }
                    return (
                      <p
                        key={i}
                        style={{
                          marginBottom: '4px',
                          lineHeight: '1.7',
                          fontSize: '0.93rem',
                        }}
                      >
                        {para}
                      </p>
                    );
                  })}
                </div>
              </div>

              <div className="cardFooter">
                <div className="copyright">
                  Generated by <strong>@rafiansya__</strong>
                  <br />
                  <span style={{ fontSize: '0.68rem', opacity: 0.5 }}>instarate.app</span>
                </div>
                <div className="watermark">InstaRate </div>
              </div>
            </div>

            <div className="shareRow">
              <button className="btnShare ig" onClick={() => shareImage('ig')}>
                Story IG
              </button>
              <button className="btnShare primary" onClick={() => shareImage('download')}>
                Download
              </button>
              <button className="btnShare" onClick={shareText}>
                Copy Teks
              </button>
            </div>
            <button className="btnAgain" onClick={handleReset}>
              ↩ Rate Akun Lain
            </button>
          </div>
        )}
      </div>

      <footer>
        Dibuat dengan ❤️ oleh{' '}
        <a href="https://instagram.com/rafiansya__" target="_blank" rel="noopener noreferrer">
          @rafiansya__
        </a>
        <br />
        AI-powered • Hasil buat hiburan aja, jangan baper :)
      </footer>

      <div className={`toast ${toastVisible ? 'show' : ''}`}>{toast}</div>
    </>
  );
}
