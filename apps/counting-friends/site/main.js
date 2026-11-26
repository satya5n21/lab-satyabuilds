// Counting Friends: a follower count drawn in particles on a starry sky.
// The text is rendered to an offscreen canvas, sampled into target points, and each particle
// springs toward its point. The pointer acts as wind; while pressed the springs relax so the
// particles stay blown away, and on release they settle back into the text.
(() => {
  'use strict';

  const CFG = Object.assign(
    { handle: 'satya5n21', label: 'friends', fallbackCount: 1000, apiUrl: '', refreshHours: 12, requestTimeoutMs: 8000 },
    window.COUNTING_FRIENDS || {}
  );
  const CACHE_KEY = 'counting-friends:last-count';
  const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const readout = document.getElementById('readout');
  const hint = document.getElementById('hint');
  const profile = document.getElementById('profile');

  let W = 0, H = 0, DPR = 1;
  let bg = null;          // pre-rendered sky gradient, nebulae and dust
  let starSprite = null;  // soft glow used for the brighter stars
  let stars = [];
  let particles = [];
  let count = initialCount();
  let shooting = null, nextShootAt = performance.now() + 4000;

  // Particle colours. 0 handle, 1-3 number (dithered left to right), 4 label, 5 fast-moving.
  const COLORS = ['#b9c2ff', '#9fd4ff', '#eef3ff', '#cbb9ff', '#ffd79e', '#ffffff'];
  const buckets = COLORS.map(() => []);

  const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, down: false, lastT: 0 };
  let springK = 1;  // eases between 1 (normal) and a weak value while pressed

  // ---------- count source ----------

  function validCount(n) {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.floor(n) : null;
  }

  function initialCount() {
    const q = new URLSearchParams(location.search).get('count');
    if (q !== null && validCount(Number(q)) !== null) return validCount(Number(q));
    if (CFG.apiUrl) {
      try {
        const cached = validCount(Number(localStorage.getItem(CACHE_KEY)));
        if (cached !== null && localStorage.getItem(CACHE_KEY) !== null) return cached;
      } catch (_) { /* storage blocked: fall through */ }
    }
    return validCount(Number(CFG.fallbackCount)) ?? 1000;
  }

  function pickCount(json) {
    if (!json || typeof json !== 'object') return null;
    const candidates = [
      json.followers,
      json.followers_count,
      json.count,
      json.public_metrics && json.public_metrics.followers_count,
      json.data && json.data.public_metrics && json.data.public_metrics.followers_count,
    ];
    for (const c of candidates) {
      const n = validCount(typeof c === 'string' ? Number(c) : c);
      if (n !== null) return n;
    }
    return null;
  }

  async function fetchCount() {
    if (!CFG.apiUrl) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.requestTimeoutMs);
    try {
      const res = await fetch(CFG.apiUrl, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const n = pickCount(await res.json());
      if (n === null) throw new Error('no follower count in response');
      try { localStorage.setItem(CACHE_KEY, String(n)); } catch (_) {}
      return n;
    } catch (err) {
      console.warn('[counting-friends] using', count, 'because the count request failed:', err.message || err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh() {
    const n = await fetchCount();
    if (n !== null) setCount(n);
  }

  function setCount(n) {
    if (n === count) return;
    count = n;
    updateReadout();
    setTargets(buildTargets());
  }

  function updateReadout() {
    readout.textContent = `@${CFG.handle}: ${count.toLocaleString('en-US')} ${CFG.label}`;
    document.title = `${count.toLocaleString('en-US')} ${CFG.label} · @${CFG.handle}`;
  }

  // ---------- sky ----------

  function rand(a, b) { return a + Math.random() * (b - a); }

  function buildSky() {
    bg = document.createElement('canvas');
    bg.width = Math.round(W * DPR);
    bg.height = Math.round(H * DPR);
    const g = bg.getContext('2d');
    g.scale(DPR, DPR);

    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#03040c');
    base.addColorStop(0.55, '#060a1c');
    base.addColorStop(1, '#0b0f26');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    // Soft nebulae.
    const m = Math.max(W, H);
    const neb = (x, y, r, color) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    };
    neb(W * 0.18, H * 0.22, m * 0.45, 'rgba(70, 60, 160, 0.20)');
    neb(W * 0.85, H * 0.78, m * 0.5, 'rgba(30, 90, 150, 0.17)');
    neb(W * 0.62, H * 0.12, m * 0.3, 'rgba(140, 60, 130, 0.10)');

    // A faint diagonal band of dust, like a distant galaxy arm.
    const dust = Math.min(4000, Math.round((W * H) / 450));
    for (let i = 0; i < dust; i++) {
      const t = Math.random();
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * m * 0.16;
      const x = t * W * 1.2 - W * 0.1 + spread * 0.5;
      const y = H * 0.95 - t * H * 0.9 + spread;
      g.fillStyle = `rgba(200, 210, 255, ${rand(0.04, 0.22).toFixed(3)})`;
      const s = Math.random() < 0.9 ? 0.7 : 1.1;
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < dust * 0.5; i++) {
      g.fillStyle = `rgba(220, 225, 255, ${rand(0.03, 0.14).toFixed(3)})`;
      g.fillRect(Math.random() * W, Math.random() * H, 0.7, 0.7);
    }

    starSprite = document.createElement('canvas');
    starSprite.width = starSprite.height = 32;
    const s = starSprite.getContext('2d');
    const sg = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.15, 'rgba(225,235,255,0.85)');
    sg.addColorStop(0.45, 'rgba(160,190,255,0.18)');
    sg.addColorStop(1, 'rgba(160,190,255,0)');
    s.fillStyle = sg;
    s.fillRect(0, 0, 32, 32);

    const n = Math.min(650, Math.round((W * H) / 2600));
    const tints = ['#ffffff', '#dfe8ff', '#cfe0ff', '#fff1dc', '#ffe2c8'];
    stars = [];
    for (let i = 0; i < n; i++) {
      const bright = Math.random() < 0.08;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: bright ? rand(1.4, 2.6) : rand(0.4, 1.2),
        a: bright ? rand(0.7, 1) : rand(0.25, 0.8),
        tw: rand(0.4, 1.8),
        ph: Math.random() * Math.PI * 2,
        depth: rand(0.2, 1),
        bright,
        tint: tints[(Math.random() * tints.length) | 0],
      });
    }
  }

  function drawSky(t) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, W, H);

    // Gentle parallax toward the pointer.
    const ox = pointer.active ? (pointer.x - W / 2) * -0.012 : 0;
    const oy = pointer.active ? (pointer.y - H / 2) * -0.012 : 0;
    parallax.x += (ox - parallax.x) * 0.04;
    parallax.y += (oy - parallax.y) * 0.04;

    const ts = t / 1000;
    for (const s of stars) {
      const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(ts * s.tw + s.ph);
      const x = s.x + parallax.x * s.depth;
      const y = s.y + parallax.y * s.depth;
      ctx.globalAlpha = s.a * tw;
      if (s.bright) {
        const d = s.r * 7;
        ctx.drawImage(starSprite, x - d / 2, y - d / 2, d, d);
      } else {
        ctx.fillStyle = s.tint;
        ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
      }
    }
    ctx.globalAlpha = 1;

    if (!reduceMotion) drawShootingStar(t);
  }
  const parallax = { x: 0, y: 0 };

  function drawShootingStar(t) {
    if (!shooting && t > nextShootAt) {
      const fromLeft = Math.random() < 0.5;
      const angle = rand(0.25, 0.6) * (fromLeft ? 1 : -1);
      const speed = rand(9, 15);
      shooting = {
        x: fromLeft ? rand(-0.1, 0.5) * W : rand(0.5, 1.1) * W,
        y: rand(-0.05, 0.35) * H,
        vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
        vy: Math.abs(Math.sin(angle)) * speed,
        life: 1,
      };
      nextShootAt = t + rand(6000, 14000);
    }
    if (!shooting) return;
    const s = shooting;
    s.x += s.vx; s.y += s.vy; s.life -= 0.018;
    const len = 14;
    const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len);
    g.addColorStop(0, `rgba(255,255,255,${(0.9 * s.life).toFixed(3)})`);
    g.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len);
    ctx.stroke();
    if (s.life <= 0 || s.x < -W * 0.3 || s.x > W * 1.3 || s.y > H * 1.2) shooting = null;
  }

  // ---------- text targets ----------

  function buildTargets() {
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.floor(W));
    off.height = Math.max(1, Math.floor(H));
    const o = off.getContext('2d', { willReadFrequently: true });
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';

    const numText = count.toLocaleString('en-US');
    const handleText = '@' + CFG.handle;
    const labelText = CFG.label;

    o.font = `800 100px ${FONT}`;
    let numSize = (100 * (W * 0.84)) / Math.max(1, o.measureText(numText).width);
    numSize = Math.min(numSize, H * 0.4, 440);
    const narrow = W < 700;
    const handleSize = Math.max(narrow ? 21 : 17, Math.min(56, numSize * (narrow ? 0.22 : 0.17)));
    const labelSize = Math.max(narrow ? 34 : 24, Math.min(120, numSize * (narrow ? 0.38 : 0.3)));

    const lines = [
      { text: handleText, font: `600 ${handleSize}px ${FONT}`, size: handleSize, channel: 0, spacing: '0.02em' },
      { text: numText, font: `800 ${numSize}px ${FONT}`, size: numSize, channel: 1, spacing: '0em' },
      { text: labelText, font: `700 ${labelSize}px ${FONT}`, size: labelSize, channel: 2, spacing: '0.08em' },
    ];
    for (const l of lines) {
      o.font = l.font;
      if ('letterSpacing' in o) o.letterSpacing = l.spacing;
      const m = o.measureText(l.text);
      l.asc = m.actualBoundingBoxAscent || l.size * 0.72;
      l.desc = m.actualBoundingBoxDescent || l.size * 0.05;
    }
    const gap1 = numSize * 0.16, gap2 = numSize * 0.12;
    const total = lines[0].asc + lines[0].desc + gap1 + lines[1].asc + lines[1].desc + gap2 + lines[2].asc + lines[2].desc;
    let y = (H - total) / 2 - H * 0.02;
    const fills = ['#ff0000', '#00ff00', '#0000ff'];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      o.font = l.font;
      if ('letterSpacing' in o) o.letterSpacing = l.spacing;
      o.fillStyle = fills[l.channel];
      o.fillText(l.text, W / 2, y + l.asc);
      l.top = y;
      l.bottom = y + l.asc + l.desc;
      y = l.bottom + (i === 0 ? gap1 : gap2);
    }

    const img = o.getImageData(0, 0, off.width, off.height).data;
    const w = off.width;

    // Pick a sampling step per line: small text needs a fine step to stay legible, and the
    // total is capped so phones and huge screens both stay smooth.
    const maxParticles = W < 700 ? 4200 : W > 1800 ? 11000 : 8500;
    const coverage = [0, 0, 0];
    for (let py = 0; py < off.height; py += 2) {
      for (let px = 0; px < w; px += 2) {
        const i = (py * w + px) * 4;
        if (img[i] > 128) coverage[0]++; else if (img[i + 1] > 128) coverage[1]++; else if (img[i + 2] > 128) coverage[2]++;
      }
    }
    const estimate = (steps) => coverage.reduce((sum, c, k) => sum + (c * 4) / (steps[k] * steps[k]), 0);
    let base = 2.6;
    const stepsFor = (b) => [
      Math.max(1.6, Math.min(b, handleSize / 9)),
      b,
      Math.max(2, Math.min(b, labelSize / 10)),
    ];
    while (estimate(stepsFor(base)) > maxParticles && base < 14) base += 0.25;
    const steps = stepsFor(base);

    const pts = [];
    for (let k = 0; k < 3; k++) {
      const st = steps[k];
      const l = lines[k];
      const y0 = Math.max(0, Math.floor(l.top - 2)), y1 = Math.min(off.height - 1, Math.ceil(l.bottom + 2));
      for (let fy = y0; fy <= y1; fy += st) {
        const py = Math.round(fy);
        for (let fx = 0; fx < w; fx += st) {
          const px = Math.round(fx);
          const v = img[(py * w + px) * 4 + k];
          if (v <= 128) continue;
          const jx = (Math.random() - 0.5) * st * 0.35;
          const jy = (Math.random() - 0.5) * st * 0.35;
          let c;
          if (k === 0) c = 0;
          else if (k === 2) c = 4;
          else {
            // Dither cool blue -> white -> lavender across the number.
            const p = px / w + (Math.random() - 0.5) * 0.35;
            c = p < 0.38 ? 1 : p < 0.62 ? 2 : 3;
            if (Math.random() < 0.22) c = 2;
          }
          pts.push({ x: px + jx, y: py + jy, c, s: st * rand(0.55, 0.8) });
        }
      }
    }
    return pts;
  }

  function spawn(fromAnywhere) {
    return {
      x: fromAnywhere ? Math.random() * W : W / 2 + rand(-1, 1) * W * 0.6,
      y: fromAnywhere ? Math.random() * H : rand(-0.1, 1.1) * H,
      vx: 0, vy: 0,
      tx: 0, ty: 0, c: 2, s: 2,
      k: rand(0.75, 1.25),
      ph: Math.random() * Math.PI * 2,
      life: reduceMotion ? 1 : rand(-1.2, 0),
      dying: false,
    };
  }

  function setTargets(points) {
    for (let i = points.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = points[i]; points[i] = points[j]; points[j] = t;
    }
    const alive = particles.filter((p) => !p.dying);
    const dying = particles.filter((p) => p.dying);
    const next = [];
    for (let i = 0; i < points.length; i++) {
      const p = i < alive.length ? alive[i] : spawn(true);
      const t = points[i];
      p.tx = t.x; p.ty = t.y; p.c = t.c; p.s = t.s;
      if (reduceMotion && i >= alive.length) { p.x = t.x; p.y = t.y; }
      next.push(p);
    }
    for (let i = points.length; i < alive.length; i++) {
      const p = alive[i];
      p.dying = true;
      p.vx += rand(-3, 3); p.vy += rand(-3, 3);
      dying.push(p);
    }
    particles = next.concat(dying);
  }

  // ---------- simulation ----------

  function step(dt, t) {
    const pressed = pointer.down;
    springK += ((pressed ? 0.06 : 1) - springK) * Math.min(1, (pressed ? 0.25 : 0.05) * dt);
    const k = 0.042 * springK;
    const damp = Math.pow(pressed ? 0.94 : 0.87, dt);

    const scale = Math.min(W, H) / 900;
    const R = (pressed ? 170 : 95) * Math.max(0.6, scale);
    const R2 = R * R;
    const radial = pressed ? 2.6 : 0.9;
    const along = pressed ? 0.55 : 0.18;
    const active = pointer.active;
    const px = pointer.x, py = pointer.y, pvx = pointer.vx, pvy = pointer.vy;
    const ts = t / 1000;

    for (const b of buckets) b.length = 0;
    let removed = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.dying) {
        p.life -= 0.025 * dt;
        if (p.life <= 0) { removed++; continue; }
      } else if (p.life < 1) {
        p.life = Math.min(1, p.life + 0.022 * dt);
      }

      if (!p.dying && p.life > 0) {
        const sway = reduceMotion ? 0 : 0.5;
        const tx = p.tx + Math.sin(ts * 1.3 + p.ph) * sway;
        const ty = p.ty + Math.cos(ts * 1.1 + p.ph * 1.7) * sway;
        p.vx += (tx - p.x) * k * p.k * dt;
        p.vy += (ty - p.y) * k * p.k * dt;
      }

      if (active) {
        const dx = p.x - px, dy = p.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          let f = 1 - d / R;
          f *= f;
          const turb = pressed ? (Math.random() - 0.5) * 1.2 * f : 0;
          p.vx += ((dx / d) * radial * f + pvx * along * f + turb) * dt;
          p.vy += ((dy / d) * radial * f + pvy * along * f - Math.abs(turb) * 0.3) * dt;
        }
      }

      p.vx *= damp; p.vy *= damp;
      const sp2 = p.vx * p.vx + p.vy * p.vy;
      if (sp2 > 1600) { const s = 40 / Math.sqrt(sp2); p.vx *= s; p.vy *= s; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.life > 0) buckets[sp2 > 9 ? 5 : p.c].push(p);
    }

    if (removed) particles = particles.filter((p) => !(p.dying && p.life <= 0));

    // Pointer velocity fades when the pointer stops.
    pointer.vx *= Math.pow(0.8, dt);
    pointer.vy *= Math.pow(0.8, dt);
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      ctx.fillStyle = COLORS[b];
      ctx.globalAlpha = b === 0 ? 0.85 : b === 5 ? 0.95 : 0.9;
      ctx.beginPath();
      for (const p of list) {
        const s = p.s * Math.min(1, p.life);
        ctx.rect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(2.5, Math.max(0.1, (t - last) / 16.667));
    last = t;
    requestAnimationFrame(frame);
    // The window can report 0x0 before it is laid out; wait for a real size.
    if (W < 1 || H < 1 || window.innerWidth !== W || window.innerHeight !== H) {
      if (window.innerWidth >= 1 && window.innerHeight >= 1 && (W < 1 || H < 1)) resize();
      if (W < 1 || H < 1) return;
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(t);
    step(dt, t);
    drawParticles();
  }

  // ---------- input ----------

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function track(e) {
    const { x, y } = toLocal(e);
    const now = performance.now();
    if (pointer.active) {
      const dtp = Math.max(8, now - pointer.lastT) / 16.667;
      const vx = (x - pointer.x) / dtp, vy = (y - pointer.y) / dtp;
      pointer.vx += (vx - pointer.vx) * 0.5;
      pointer.vy += (vy - pointer.vy) * 0.5;
    }
    pointer.x = x; pointer.y = y; pointer.lastT = now;
    pointer.active = true;
  }

  canvas.addEventListener('pointerdown', (e) => {
    track(e);
    pointer.down = true;
    canvas.classList.add('dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    hint.classList.add('gone');
  });
  canvas.addEventListener('pointermove', track);
  const release = (e) => {
    pointer.down = false;
    canvas.classList.remove('dragging');
    if (e.pointerType !== 'mouse') { pointer.active = false; pointer.vx = pointer.vy = 0; }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    if (!pointer.down) { pointer.active = false; pointer.vx = pointer.vy = 0; }
    if (e.pointerType !== 'mouse') pointer.active = false;
  });
  window.addEventListener('blur', () => { pointer.down = false; pointer.active = false; canvas.classList.remove('dragging'); });

  // ---------- layout ----------

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    if (W < 1 || H < 1) { W = H = 0; return; }
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    buildSky();
    setTargets(buildTargets());
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  async function start() {
    profile.href = 'https://x.com/' + encodeURIComponent(CFG.handle);
    profile.textContent = 'x.com/' + CFG.handle;
    if (window.matchMedia('(pointer: coarse)').matches) hint.textContent = 'Touch and drag to blow the particles away';
    updateReadout();
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
    resize();
    requestAnimationFrame((t) => { last = t; frame(t); });
    if (CFG.apiUrl) {
      refresh();
      const every = Math.max(0.25, Number(CFG.refreshHours) || 12) * 3600 * 1000;
      setInterval(refresh, every);
    }
  }

  start();
})();
