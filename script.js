/**
 * Starbooth: a whimsical photobooth that runs entirely in the browser.
 * No server, no accounts. Photos are processed in memory and only leave
 * the page when the person chooses to save or download them.
 */

(function () {
  const $ = (s) => document.querySelector(s);
  // ------------------------------------------------------------
  // Configuration: layouts, filters, frame colors, pose prompts
  // ------------------------------------------------------------

  const LAYOUTS = {
    strip: { n: 4, c: 1, r: 4, pw: 340, ph: 255, label: "strip of 4" },
    grid: { n: 4, c: 2, r: 2, pw: 300, ph: 225, label: "2 × 2" },
    trio: { n: 3, c: 1, r: 3, pw: 380, ph: 285, label: "trio" },
    solo: { n: 1, c: 1, r: 1, pw: 560, ph: 420, label: "solo" },
  };
  const FILTERS = {
    none: "plain",
    warm: "warm glow",
    dream: "dreamy",
    pastel: "pastel",
    mono: "moonlight",
    film: "film grain",
  };
  const CSSF = {
    none: "none",
    warm: "sepia(.35) saturate(1.3) brightness(1.06) hue-rotate(-8deg)",
    dream: "brightness(1.12) contrast(.88) saturate(1.25) blur(.6px)",
    pastel: "saturate(.8) brightness(1.15) contrast(.85) hue-rotate(12deg)",
    mono: "grayscale(1) contrast(1.1) brightness(1.05)",
    film: "sepia(.25) contrast(1.12) saturate(.85) brightness(.97)",
  };
  const FRAMES = {
    white: "#ffffff",
    cream: "#fbf6ea",
    pink: "#ffdbe8",
    blue: "#d9ecff",
    butter: "#fff2bd",
    sage: "#e0eed2",
    crayon: "#fbf6ea",
    night: "#2a3560",
  };
  const SWBG = {
    crayon:
      "linear-gradient(135deg,#fbf6ea 38%,#ff8fb7 39%,#ff8fb7 50%,#8cc8ff 51%,#8cc8ff 62%,#fbf6ea 63%)",
  };
  const POSES = [
    "hold a star",
    "make a wish",
    "blow a kiss",
    "your silliest face",
    "wave hello",
    "peek-a-boo",
    "tiny smile",
    "surprise!",
    "hug the air",
    "sleepy star",
    "sparkle eyes",
    "puffy cheeks",
  ];
  const S = {
    layout: "strip",
    filter: "warm",
    timer: 3,
    frame: "white",
    stars: true,
    cap: true,
    shots: [],
    stk: [],
    prompt: false,
    sound: true,
    busy: false,
    stream: null,
    seed: 1,
  };

  // ------------------------------------------------------------
  // Settings UI: chips, swatches and toggles
  // ------------------------------------------------------------

  function chips(id, obj, key, fmt) {
    const el = $(id);
    el.innerHTML = "";
    Object.keys(obj).forEach((k) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = fmt ? fmt(k, obj[k]) : obj[k];
      b.setAttribute("aria-pressed", S[key] == k);
      b.onclick = () => {
        if (S.busy) return;
        S[key] = isNaN(k) ? k : +k;
        chips(id, obj, key, fmt);
        onChange(key);
      };
      el.appendChild(b);
    });
  }
  function swatches() {
    const el = $("#g-frame");
    el.innerHTML = "";
    Object.keys(FRAMES).forEach((k) => {
      const b = document.createElement("button");
      b.className = "chip sw";
      b.style.background = SWBG[k] || FRAMES[k];
      b.title = k;
      b.setAttribute("aria-label", k + " frame");
      b.setAttribute("aria-pressed", S.frame == k);
      b.onclick = () => {
        S.frame = k;
        swatches();
        if (S.shots.length === LAYOUTS[S.layout].n) compose();
      };
      el.appendChild(b);
    });
  }
  chips("#g-layout", LAYOUTS, "layout", (k, v) => v.label);
  chips("#g-filter", FILTERS, "filter");
  chips("#g-timer", { 3: "3s", 5: "5s", 10: "10s" }, "timer");
  swatches();
  function toggle(id, key) {
    const b = $(id);
    b.onclick = () => {
      S[key] = !S[key];
      b.setAttribute("aria-pressed", S[key]);
      if (S.shots.length === LAYOUTS[S.layout].n) compose();
    };
  }
  toggle("#t-stars", "stars");
  toggle("#t-cap", "cap");
  toggle("#t-prompt", "prompt");
  toggle("#t-sound", "sound");

  function onChange(k) {
    if (k === "filter") $("#vid").style.filter = CSSF[S.filter];
    if (k === "layout") {
      S.shots = [];
      $("#result").style.display = "none";
    }
    drawTray();
  }
  function drawTray() {
    const t = $("#tray");
    t.innerHTML = "";
    const n = LAYOUTS[S.layout].n;
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      if (S.shots[i]) {
        d.className = "t";
        const im = new Image();
        im.src = S.shots[i].toDataURL("image/jpeg", 0.6);
        d.appendChild(im);
      } else {
        d.className = "t empty";
        d.textContent = "☆";
      }
      t.appendChild(d);
    }
  }
  drawTray();

  function say(t) {
    $("#msg").textContent = t || "";
  }
  // ------------------------------------------------------------
  // Camera and capture
  // ------------------------------------------------------------

  async function startCam() {
    say("asking the stars for permission…");
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      S.stream = st;
      const v = $("#vid");
      v.srcObject = st;
      v.style.display = "block";
      v.style.filter = CSSF[S.filter];
      await v.play();
      $("#ph").style.display = "none";
      $("#light").classList.add("on");
      $("#go").disabled = false;
      say("");
    } catch (e) {
      say(
        e && e.name === "NotAllowedError"
          ? "the camera is blocked. allow it from the lock icon in your address bar, or open this page in its own tab. you can also upload photos instead."
          : "couldn’t wake the camera. you can upload photos instead.",
      );
    }
  }
  $("#camBtn").onclick = startCam;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function grab(src, sw, sh) {
    const L = LAYOUTS[S.layout],
      c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const x = c.getContext("2d");
    let w = sw,
      h = sh,
      sx = 0,
      sy = 0;
    const want = 4 / 3;
    if (w / h > want) {
      const nw = h * want;
      sx = (w - nw) / 2;
      w = nw;
    } else {
      const nh = w / want;
      sy = (h - nh) / 2;
      h = nh;
    }
    if ("filter" in x) x.filter = CSSF[S.filter];
    if (src.tagName === "VIDEO") {
      x.translate(800, 0);
      x.scale(-1, 1);
    }
    x.drawImage(src, sx, sy, w, h, 0, 0, 800, 600);
    if (S.filter === "film") {
      if ("filter" in x) x.filter = "none";
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = "rgba(0,0,0," + Math.random() * 0.08 + ")";
        x.fillRect(Math.random() * 800, Math.random() * 600, 2, 2);
      }
    }
    return c;
  }
  async function countdown(sec) {
    const el = $("#count");
    el.style.display = "flex";
    for (let i = sec; i > 0; i--) {
      el.textContent = i;
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      await wait(1000);
    }
    el.style.display = "none";
  }
  let AC;
  function snd() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(),
        g = AC.createGain(),
        t = AC.currentTime;
      o.type = "triangle";
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.08);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g);
      g.connect(AC.destination);
      o.start();
      o.stop(t + 0.13);
    } catch (e) {}
  }
  function flash() {
    if (S.sound) snd();
    const f = $("#flash");
    f.classList.remove("go");
    void f.offsetWidth;
    f.classList.add("go");
  }
  async function shoot() {
    if (S.busy || !S.stream) return;
    S.busy = true;
    S.shots = [];
    S.stk = [];
    $("#result").style.display = "none";
    $("#go").disabled = true;
    drawTray();
    const n = LAYOUTS[S.layout].n,
      v = $("#vid");
    for (let i = 0; i < n; i++) {
      say("photo " + (i + 1) + " of " + n + " — get ready ✧");
      if (S.prompt) $("#prompt").textContent = POSES[(Math.random() * POSES.length) | 0];
      await countdown(S.timer);
      $("#prompt").textContent = "";
      flash();
      S.shots.push(grab(v, v.videoWidth, v.videoHeight));
      drawTray();
      await wait(650);
    }
    say("");
    S.busy = false;
    $("#go").disabled = false;
    finish();
  }
  $("#go").onclick = shoot;

  $("#file").onchange = async (e) => {
    const files = [...e.target.files].slice(0, LAYOUTS[S.layout].n);
    if (!files.length) return;
    S.shots = [];
    for (const f of files) {
      const im = await new Promise((r) => {
        const i = new Image();
        i.onload = () => r(i);
        i.src = URL.createObjectURL(f);
      });
      S.shots.push(grab(im, im.naturalWidth, im.naturalHeight));
    }
    const n = LAYOUTS[S.layout].n;
    while (S.shots.length < n) S.shots.push(S.shots[S.shots.length % files.length]);
    drawTray();
    finish();
    e.target.value = "";
  };

  // ------------------------------------------------------------
  // Strip composer: draws the finished photostrip on a canvas
  // ------------------------------------------------------------

  function rng(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function spark(x, y, r, col, ctx, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        k = (i % 2 ? 0.42 : 1) * r * (1 + 0.07 * Math.sin(i * 2.3 + r));
      ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r / 10);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2e2c3b";
    ctx.stroke();
    ctx.restore();
  }
  function rr(x, p, w, h, r) {
    x.beginPath();
    x.roundRect ? x.roundRect(p[0], p[1], w, h, r) : x.rect(p[0], p[1], w, h);
  }

  function compose(fast) {
    const L = LAYOUTS[S.layout],
      pad = 40,
      gap = 22,
      foot = 96,
      top = 92,
      rnd = rng(S.seed);
    const W = pad * 2 + L.c * L.pw + (L.c - 1) * gap,
      H = top + L.r * L.ph + (L.r - 1) * gap + foot;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = FRAMES[S.frame];
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.16;
    x.fillStyle = "#fff";
    for (let i = 0; i < 260; i++) {
      x.beginPath();
      x.arc(rnd() * W, rnd() * H, 1 + rnd() * 2, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    if (S.frame === "crayon") {
      const cc = ["#ff8fb7", "#8cc8ff", "#9ccc65", "#ffd23f"];
      x.lineCap = "round";
      x.lineJoin = "round";
      x.lineWidth = 3.2;
      x.globalAlpha = 0.8;
      for (let i = 0; i < 34; i++) {
        x.strokeStyle = cc[i % 4];
        let px = rnd() * W,
          py = rnd() * H;
        x.beginPath();
        x.moveTo(px, py);
        for (let j = 0; j < 5; j++) {
          px += (rnd() - 0.5) * 70;
          py += (rnd() - 0.5) * 50;
          x.quadraticCurveTo(px + (rnd() - 0.5) * 40, py + (rnd() - 0.5) * 40, px, py);
        }
        x.stroke();
      }
      x.globalAlpha = 1;
    }
    L.pos = [];
    for (let i = 0; i < L.n; i++) {
      const col = i % L.c,
        row = Math.floor(i / L.c),
        px = pad + col * (L.pw + gap),
        py = top + row * (L.ph + gap);
      x.save();
      x.translate(px + L.pw / 2, py + L.ph / 2);
      x.rotate((rnd() - 0.5) * 0.045);
      x.fillStyle = "rgba(46,44,59,.12)";
      x.fillRect(-L.pw / 2 + 5, -L.ph / 2 + 6, L.pw, L.ph);
      x.fillStyle = "#fffdf6";
      x.fillRect(-L.pw / 2 - 7, -L.ph / 2 - 7, L.pw + 14, L.ph + 14);
      x.drawImage(S.shots[i], -L.pw / 2, -L.ph / 2, L.pw, L.ph);
      x.lineWidth = 2.5;
      x.strokeStyle = "#3d3a5c";
      x.strokeRect(-L.pw / 2 - 7, -L.ph / 2 - 7, L.pw + 14, L.ph + 14);
      x.restore();
    }
    if (S.stars) {
      const cols = ["#ffd23f", "#ff8fb7", "#8cc8ff", "#9ccc65"];
      const n = Math.max(10, Math.round(W / 30));
      for (let i = 0; i < n; i++) {
        const r = 7 + rnd() * 10;
        spark(
          22 + ((i + 0.2 + rnd() * 0.6) * (W - 44)) / n,
          18 + rnd() * (top - 44),
          r,
          cols[i % 4],
          x,
          (rnd() - 0.5) * 0.6,
        );
      }
      const m = Math.max(3, Math.round((H - top - foot) / 90));
      for (let j = 0; j < m * 2; j++) {
        const sd = j % 2,
          r = 6 + rnd() * 5;
        spark(
          sd ? W - 19 + rnd() * 4 : 19 - rnd() * 4,
          top + (((j >> 1) + 0.3 + rnd() * 0.5) * (H - top - foot)) / m,
          r,
          cols[(j + 1) % 4],
          x,
          (rnd() - 0.5) * 0.8,
        );
      }
    }
    if (S.cap) {
      x.fillStyle = S.frame === "night" ? "#fff7e0" : "#3d3a5c";
      x.textAlign = "center";
      x.font = '68px "Reenie Beanie",cursive';
      x.fillText("starbooth", W / 2 - 14, H - foot + 52);
      spark(W / 2 + x.measureText("starbooth").width / 2 + 4, H - foot + 30, 11, "#ffd23f", x, 0.2);
      x.font = '19px "Cutive Mono",monospace';
      x.fillText(
        new Date().toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        W / 2,
        H - foot + 78,
      );
    }
    for (const k of S.stk) {
      x.save();
      x.translate(k.x, k.y);
      x.rotate(k.a);
      STK[k.t](x, k.r, k.c);
      x.restore();
    }
    S.canvas = c;
    $("#out").src = fast ? c.toDataURL("image/jpeg", 0.72) : c.toDataURL("image/png");
  }
  function finish() {
    S.seed = (Math.random() * 1e9) | 0;
    S.stk = [];
    compose();
    $("#smsg").textContent = "";
    page("result");
  }

  $("#again").onclick = () => {
    S.shots = [];
    S.stk = [];
    drawTray();
    page("booth");
  };

  // ------------------------------------------------------------
  // Doodles: draggable stickers on the finished strip
  // ------------------------------------------------------------

  const SIZES = [26, 38, 56],
    PAL = ["#ffd23f", "#ff8fb7", "#8cc8ff", "#9ccc65", "#c9b6ff"];
  function fs(x, c, r) {
    x.fillStyle = c;
    x.fill();
    x.lineWidth = Math.max(2, r / 12);
    x.lineJoin = "round";
    x.strokeStyle = "#2e2c3b";
    x.stroke();
  }
  const STK = {
    star: (x, r, c) => spark(0, 0, r, c, x, 0),
    heart: (x, r, c) => {
      x.beginPath();
      x.moveTo(0, r * 0.9);
      x.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.7, -r * 1.1, 0, -r * 0.35);
      x.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.6, -r * 0.1, 0, r * 0.9);
      fs(x, c, r);
    },
    swirl: (x, r, c) => {
      x.beginPath();
      for (let t = 0; t < 15; t += 0.2) {
        const k = (r * t) / 15;
        x.lineTo(Math.cos(t) * k, Math.sin(t) * k);
      }
      x.lineWidth = Math.max(3, r / 8);
      x.lineCap = "round";
      x.strokeStyle = c;
      x.stroke();
    },
    flower: (x, r, c) => {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        x.beginPath();
        x.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.42, 0, 7);
        fs(x, c, r);
      }
      x.beginPath();
      x.arc(0, 0, r * 0.28, 0, 7);
      fs(x, "#fff6cc", r);
    },
    hat: (x, r, c) => {
      x.beginPath();
      x.moveTo(0, -r);
      x.lineTo(-r * 0.75, r * 0.85);
      x.lineTo(r * 0.75, r * 0.85);
      x.closePath();
      fs(x, c, r);
      for (const p of [
        [-0.1, 0.1],
        [0.2, 0.5],
        [-0.3, 0.55],
      ]) {
        x.beginPath();
        x.arc(p[0] * r, p[1] * r, r * 0.08, 0, 7);
        x.fillStyle = "#2e2c3b";
        x.fill();
      }
      x.beginPath();
      x.arc(0, -r, r * 0.16, 0, 7);
      fs(x, "#fff", r);
    },
  };
  const NAMES = {
    star: "star",
    heart: "heart",
    swirl: "swirl",
    flower: "flower",
    hat: "party hat",
  };
  const gs = $("#g-stk");
  Object.keys(NAMES).forEach((k) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = NAMES[k];
    b.onclick = () => {
      const c = S.canvas;
      S.stk.push({
        t: k,
        c: PAL[(Math.random() * PAL.length) | 0],
        x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.4,
        y: c.height * 0.35 + Math.random() * c.height * 0.3,
        r: SIZES[1],
        z: 1,
        a: (Math.random() - 0.5) * 0.6,
      });
      compose();
    };
    gs.appendChild(b);
  });
  $("#stk-undo").onclick = () => {
    S.stk.pop();
    compose();
  };
  $("#stk-clear").onclick = () => {
    S.stk = [];
    compose();
  };
  const out = $("#out");
  let drag = null,
    moved = 0,
    raf = 0;
  function pt(e) {
    const b = out.getBoundingClientRect(),
      c = S.canvas;
    return {
      x: ((e.clientX - b.left) * c.width) / b.width,
      y: ((e.clientY - b.top) * c.height) / b.height,
    };
  }
  out.addEventListener("pointerdown", (e) => {
    if (!S.canvas) return;
    const p = pt(e);
    for (let i = S.stk.length - 1; i >= 0; i--) {
      const k = S.stk[i];
      if (Math.hypot(p.x - k.x, p.y - k.y) < k.r * 1.2) {
        drag = { k, dx: k.x - p.x, dy: k.y - p.y };
        moved = 0;
        out.setPointerCapture(e.pointerId);
        e.preventDefault();
        S.stk.push(S.stk.splice(i, 1)[0]);
        return;
      }
    }
  });
  out.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = pt(e);
    moved++;
    drag.k.x = p.x + drag.dx;
    drag.k.y = p.y + drag.dy;
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        compose(true);
      });
  });
  out.addEventListener("pointerup", () => {
    if (!drag) return;
    if (moved < 3) {
      drag.k.z = (drag.k.z + 1) % 3;
      drag.k.r = SIZES[drag.k.z];
    }
    drag = null;
    compose();
  });

  // ------------------------------------------------------------
  // Saving and downloading
  // ------------------------------------------------------------

  function saveBlob(blob, name, msgEl) {
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msgEl.textContent = "saved ✧";
    } catch (e) {
      msgEl.textContent = "press and hold (or right-click) the picture to save it ✧";
    }
  }
  $("#save").onclick = async () => {
    const blob = await new Promise((r) => S.canvas.toBlob(r, "image/png"));
    saveBlob(blob, "starbooth-" + Date.now() + ".png", $("#smsg"));
  };

  // ------------------------------------------------------------
  // My stars: private collection kept in localStorage
  // ------------------------------------------------------------

  const KEY = "starbooth:stars";
  let STARS = [];
  try {
    STARS = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch (e) {}
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(STARS));
      return true;
    } catch (e) {
      return false;
    }
  }
  function cnt() {
    $("#cnt").textContent = STARS.length ? "(" + STARS.length + ")" : "";
  }
  cnt();
  $("#keep").onclick = () => {
    const c = S.canvas,
      k = Math.min(1, 560 / c.width),
      t = document.createElement("canvas");
    t.width = c.width * k;
    t.height = c.height * k;
    t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
    STARS.unshift({ t: Date.now(), src: t.toDataURL("image/jpeg", 0.85) });
    STARS = STARS.slice(0, 16);
    let ok = persist();
    while (!ok && STARS.length > 1) {
      STARS.pop();
      ok = persist();
    }
    cnt();
    const msg = ok
      ? "saved to my stars!"
      : "kept for now, but this browser won’t store it for later";
    $("#smsg").textContent = msg;
    toast(msg);
    const kb = $("#keep");
    kb.textContent = ok ? "saved ✓" : "kept for now";
    kb.disabled = true;
    setTimeout(() => {
      kb.textContent = "keep in my stars";
      kb.disabled = false;
    }, 2400);
    const nb = $("#nav-book");
    nb.classList.remove("pulse");
    void nb.offsetWidth;
    nb.classList.add("pulse");
  };
  function toast(t) {
    const e = $("#toast");
    e.textContent = t;
    e.classList.remove("show");
    void e.offsetWidth;
    e.classList.add("show");
    clearTimeout(e._t);
    e._t = setTimeout(() => e.classList.remove("show"), 2600);
  }
  function renderBook() {
    const g = $("#sgrid");
    g.innerHTML = "";
    $("#sempty").style.display = STARS.length ? "none" : "block";
    STARS.forEach((s, i) => {
      const d = document.createElement("button");
      d.className = "sitem";
      d.style.transform = "rotate(" + ((i % 3) - 1) * 1.6 + "deg)";
      d.innerHTML = '<img alt="saved photostrip"><span></span>';
      d.firstChild.src = s.src;
      d.lastChild.textContent = new Date(s.t).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      d.onclick = () => {
        cur = i;
        $("#lbimg").src = s.src;
        $("#lbmsg").textContent = "";
        $("#lb").style.display = "flex";
      };
      g.appendChild(d);
    });
    cnt();
  }
  let cur = -1;
  function d2b(u) {
    const p = u.split(","),
      b = atob(p[1]),
      a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: "image/jpeg" });
  }
  $("#lb-close").onclick = () => {
    $("#lb").style.display = "none";
  };
  $("#lb-del").onclick = () => {
    STARS.splice(cur, 1);
    persist();
    $("#lb").style.display = "none";
    renderBook();
  };
  $("#lb-save").onclick = () =>
    saveBlob(d2b(STARS[cur].src), "starbooth-kept-" + Date.now() + ".jpg", $("#lbmsg"));
  // ------------------------------------------------------------
  // Page navigation and keyboard shortcut
  // ------------------------------------------------------------

  function page(p) {
    $("#boothPage").style.display = p === "booth" ? "" : "none";
    $("#result").style.display = p === "result" ? "grid" : "none";
    $("#sbook").style.display = p === "book" ? "block" : "none";
    $("#nav-booth").setAttribute("aria-pressed", p !== "book");
    $("#nav-book").setAttribute("aria-pressed", p === "book");
    window.scrollTo(0, 0);
    if (p === "book") renderBook();
  }
  $("#nav-booth").onclick = () => page("booth");
  $("#nav-book").onclick = () => page("book");
  addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      $("#boothPage").style.display !== "none" &&
      !S.busy &&
      !$("#go").disabled &&
      !/BUTTON|INPUT|LABEL/.test(e.target.tagName)
    ) {
      e.preventDefault();
      shoot();
    }
  });

  // ------------------------------------------------------------
  // Sparkle trail that follows the pointer
  // ------------------------------------------------------------

  const cv = $("#spark"),
    cx = cv.getContext("2d");
  let P = [];
  function rs() {
    cv.width = innerWidth;
    cv.height = innerHeight;
  }
  rs();
  addEventListener("resize", rs);
  let last = 0;
  addEventListener("pointermove", (e) => {
    const t = performance.now();
    if (t - last < 40) return;
    last = t;
    P.push({
      x: e.clientX,
      y: e.clientY,
      r: 4 + Math.random() * 7,
      l: 1,
      c: ["#ffd23f", "#ff8fb7", "#8cc8ff", "#9ccc65"][P.length % 4],
      a: Math.random() * 3,
      vy: 0.4 + Math.random() * 0.6,
    });
  });
  (function loop() {
    cx.clearRect(0, 0, cv.width, cv.height);
    P = P.filter((p) => p.l > 0);
    P.forEach((p) => {
      p.l -= 0.025;
      p.y += p.vy;
      cx.globalAlpha = p.l;
      spark(p.x, p.y, p.r * p.l + 1, p.c, cx, p.a);
    });
    cx.globalAlpha = 1;
    requestAnimationFrame(loop);
  })();
})();
