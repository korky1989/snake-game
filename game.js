(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const overlayRestart = document.getElementById("overlayRestart");

  // Settings UI (added in index.html step)
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const settingsClose = document.getElementById("settingsClose");
  const speedInput = document.getElementById("speedInput");
  const speedVal = document.getElementById("speedVal");
  const soundInput = document.getElementById("soundInput");
  const vibInput = document.getElementById("vibInput");
  const rmInput = document.getElementById("rmInput");

  const GRID = 20;
  const SIZE = canvas.width; // internal resolution
  const CELL = SIZE / GRID;

  const COLORS = {
    bg: "#0b0f14",
    grid: "rgba(255,255,255,0.06)",
    snake: "#4ade80",
    head: "#86efac",
    food: "#fb7185",
  };

  // ---------- Settings ----------
  const DEFAULT_SETTINGS = {
    speedMs: 110,
    sound: true,
    vibration: true,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem("snake_settings");
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(s) {
    localStorage.setItem("snake_settings", JSON.stringify(s));
  }

  let settings = loadSettings();

  function syncSettingsUI() {
    if (!speedInput) return;
    speedInput.value = String(settings.speedMs);
    speedVal.textContent = `${settings.speedMs}ms`;
    soundInput.checked = !!settings.sound;
    vibInput.checked = !!settings.vibration;
    rmInput.checked = !!settings.reducedMotion;
  }

  function openSettings() {
    syncSettingsUI();
    settingsModal?.classList.remove("hidden");
  }

  function closeSettings() {
    settingsModal?.classList.add("hidden");
  }

  // ---------- Best score ----------
  function loadBest() {
    const v = Number(localStorage.getItem("snake_best") || "0");
    return Number.isFinite(v) ? v : 0;
  }

  function saveBest(v) {
    localStorage.setItem("snake_best", String(v));
  }

  // ---------- Juice: audio ----------
  let audioCtx = null;

  function ensureAudio() {
    if (!settings.sound) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep({ freq = 440, dur = 0.06, type = "sine", vol = 0.05 } = {}) {
    if (!settings.sound) return;
    ensureAudio();

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = type;
    o.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(t0);
    o.stop(t0 + dur);
  }

  const sfx = {
    eat: () => beep({ freq: 740, dur: 0.07, type: "triangle", vol: 0.06 }),
    turn: () => beep({ freq: 520, dur: 0.025, type: "square", vol: 0.015 }),
    die: () => beep({ freq: 120, dur: 0.18, type: "sawtooth", vol: 0.06 }),
  };

  // ---------- Juice: vibration ----------
  function buzz(pattern = 20) {
    if (!settings.vibration) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ---------- Juice: particles / shake / flash ----------
  const particles = [];
  let shakeMs = 0;
  let flashMs = 0;

  function triggerShake(ms) {
    if (settings.reducedMotion) return;
    shakeMs = Math.max(shakeMs, ms);
  }

  function triggerFlash(ms) {
    if (settings.reducedMotion) return;
    flashMs = Math.max(flashMs, ms);
  }

  function spawnEatParticles(x, y) {
    if (settings.reducedMotion) return;
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: (Math.random() * 2 - 1) * 4,
        vy: (Math.random() * 2 - 1) * 4,
        life: 250,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    if (settings.reducedMotion) return;
    for (const p of particles) {
      const a = Math.max(0, p.life / 250);
      ctx.fillStyle = `rgba(255,255,255,${0.35 * a})`;
      ctx.beginPath();
      ctx.arc(p.x * CELL, p.y * CELL, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Game state ----------
  let snake, dir, nextDir, food, score, best, running;
  let lastTime = 0;
  let stepMs = settings.speedMs;

  // Stable timing + better input feel
  let accMs = 0;
  let turnLocked = false;
  let bufferedTurn = null;

  function spawnFood() {
    while (true) {
      const p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      if (!snake?.some((s) => s.x === p.x && s.y === p.y)) return p;
    }
  }

  function updateUI() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    pauseBtn.textContent = running ? "Pause" : "Resume";
  }

  function reset() {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];

    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    food = spawnFood();
    score = 0;

    stepMs = settings.speedMs;
    running = true;

    lastTime = 0;
    accMs = 0;
    turnLocked = false;
    bufferedTurn = null;

    overlay.classList.add("hidden");
    updateUI();
  }

  function setDirection(nx, ny) {
    // prevent reversing (compare against effective direction)
    const cur = turnLocked ? nextDir : dir;
    if (nx === -cur.x && ny === -cur.y) return;

    // 1 turn per tick, buffer 1 extra
    if (!turnLocked) {
      nextDir = { x: nx, y: ny };
      turnLocked = true;
    } else {
      bufferedTurn = { x: nx, y: ny };
    }

    // optional tiny tick
    if (!settings.reducedMotion) sfx.turn();
  }

  function gameOver() {
    running = false;
    overlayTitle.textContent = "Game Over";
    overlayMsg.textContent = "Tap Restart to play again.";
    overlay.classList.remove("hidden");
    updateUI();

    sfx.die();
    buzz([30, 40, 30]);
    triggerShake(250);
    triggerFlash(180);
  }

  function tick() {
    dir = nextDir;
    turnLocked = false;

    // apply buffered turn for next tick if valid
    if (bufferedTurn) {
      const bt = bufferedTurn;
      bufferedTurn = null;
      if (!(bt.x === -dir.x && bt.y === -dir.y)) {
        nextDir = bt;
        turnLocked = true;
      }
    }

    const head = snake[0];
    const newHead = { x: head.x + dir.x, y: head.y + dir.y };

    // wall collision
    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      gameOver();
      return;
    }

    const willEat = newHead.x === food.x && newHead.y === food.y;

    // self collision: if NOT eating, tail moves away -> exclude last segment
    const bodyToCheck = willEat ? snake : snake.slice(0, -1);
    if (bodyToCheck.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      gameOver();
      return;
    }

    snake.unshift(newHead);

    if (willEat) {
      score += 1;
      if (score > best) {
        best = score;
        saveBest(best);
      }

      // speed up slightly but never beyond chosen base speed if user set faster/slower
      stepMs = Math.max(55, stepMs - 2);

      spawnEatParticles(food.x, food.y);
      sfx.eat();
      buzz(15);
      triggerFlash(80);
      triggerShake(60);

      food = spawnFood();
    } else {
      snake.pop();
    }

    updateUI();
  }

  function draw(dt) {
    // decay shake/flash
    if (shakeMs > 0) shakeMs -= dt;
    if (flashMs > 0) flashMs -= dt;

    ctx.save();
    if (shakeMs > 0 && !settings.reducedMotion) {
      const mag = 2;
      ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    }

    // background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      const p = i * CELL;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(SIZE, p);
      ctx.stroke();
    }

    // food
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.roundRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6, 6);
    ctx.fill();

    // snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      ctx.fillStyle = i === 0 ? COLORS.head : COLORS.snake;
      ctx.beginPath();
      ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 6);
      ctx.fill();
    }

    drawParticles();

    ctx.restore();

    // flash overlay
    if (flashMs > 0 && !settings.reducedMotion) {
      const a = Math.min(0.25, flashMs / 120);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;
    lastTime = ts;

    if (running) {
      accMs += dt;
      while (accMs >= stepMs) {
        tick();
        accMs -= stepMs;
        if (!running) {
          accMs = 0;
          break;
        }
      }
    }

    updateParticles(dt);
    draw(dt);
    requestAnimationFrame(loop);
  }

  // ---------- Controls ----------
  window.addEventListener("keydown", (e) => {
    ensureAudio();

    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();

    if (k === "arrowup" || k === "w") setDirection(0, -1);
    else if (k === "arrowdown" || k === "s") setDirection(0, 1);
    else if (k === "arrowleft" || k === "a") setDirection(-1, 0);
    else if (k === "arrowright" || k === "d") setDirection(1, 0);
    else if (k === " " || k === "p") togglePause();
    else if (k === "r") reset();
    else if (k === "escape") closeSettings();
  });

  // Touch swipe
  let touchStart = null;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      ensureAudio();
      if (!e.touches.length) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault(); // prevent scrolling while swiping on canvas
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
      if (!t) return;

      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;

      const ax = Math.abs(dx),
        ay = Math.abs(dy);
      if (Math.max(ax, ay) < 20) return;

      if (ax > ay) setDirection(dx > 0 ? 1 : -1, 0);
      else setDirection(0, dy > 0 ? 1 : -1);
    },
    { passive: true }
  );

  // On-screen pad
  document.querySelectorAll(".pad-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ensureAudio();
      const d = btn.getAttribute("data-dir");
      if (d === "up") setDirection(0, -1);
      if (d === "down") setDirection(0, 1);
      if (d === "left") setDirection(-1, 0);
      if (d === "right") setDirection(1, 0);
    });
  });

  function togglePause() {
    ensureAudio();
    running = !running;

    if (!running) {
      overlayTitle.textContent = "Paused";
      overlayMsg.textContent = "Press Resume or tap Pause again.";
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
    updateUI();
  }

  pauseBtn.addEventListener("click", togglePause);
  restartBtn.addEventListener("click", () => {
    ensureAudio();
    reset();
  });
  overlayRestart.addEventListener("click", () => {
    ensureAudio();
    reset();
  });

  // Settings wiring
  settingsBtn?.addEventListener("click", () => {
    ensureAudio();
    openSettings();
  });
  settingsClose?.addEventListener("click", closeSettings);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings(); // click outside card closes
  });

  speedInput?.addEventListener("input", () => {
    const v = Math.max(55, Math.min(180, Number(speedInput.value)));
    settings.speedMs = v;
    speedVal.textContent = `${v}ms`;
  });

  function commitSettings() {
    // apply
    saveSettings(settings);
    // apply speed immediately (don’t surprise player mid-move; but it’s fine)
    stepMs = settings.speedMs;
  }

  soundInput?.addEventListener("change", () => {
    settings.sound = !!soundInput.checked;
    commitSettings();
  });
  vibInput?.addEventListener("change", () => {
    settings.vibration = !!vibInput.checked;
    commitSettings();
  });
  rmInput?.addEventListener("change", () => {
    settings.reducedMotion = !!rmInput.checked;
    commitSettings();
  });

  speedInput?.addEventListener("change", () => {
    commitSettings();
  });

  // RoundRect polyfill
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  // Start
  best = loadBest();
  bestEl.textContent = String(best);

  syncSettingsUI();
  reset();
  requestAnimationFrame(loop);
})();
