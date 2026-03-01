(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const overlayRestart = document.getElementById("overlayRestart");
  const levelToast = document.getElementById("levelToast");
  const settingsInfoEl = document.getElementById("settingsInfo");

  const SIZE = canvas.width;     // internal resolution
  const LEVEL_STEP = 5;

  const DEFAULT_SETTINGS = {
    baseSpeed: 110,
    gridSize: 20,
  };

  const LEVEL_STEP = 5;
  const PATTERN_COUNT = 6;

  const COLORS = {
    bg: "#0b0f14",
    grid: "rgba(255,255,255,0.06)",
    snake: "#4ade80",
    head: "#86efac",
    food: "#fb7185",
    obstacle: "#64748b",
  };

  let settings, GRID, CELL;
  let snake, dir, nextDir, food, score, best, running, lastTime, stepMs, level;

  function loadSettings() {
    try {
      const raw = localStorage.getItem("snake_settings");
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const baseSpeed = Number(parsed.baseSpeed);
      const gridSize = Number(parsed.gridSize);
      return {
        baseSpeed: Number.isFinite(baseSpeed) ? Math.min(220, Math.max(50, baseSpeed)) : DEFAULT_SETTINGS.baseSpeed,
        gridSize: Number.isFinite(gridSize) ? Math.min(30, Math.max(12, Math.floor(gridSize))) : DEFAULT_SETTINGS.gridSize,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function applySettings() {
    settings = loadSettings();
    GRID = settings.gridSize;
    CELL = SIZE / GRID;
  }

  function loadBest() {
    try {
      const v = Number(localStorage.getItem("snake_best") || "0");
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem("snake_best", String(v));
    } catch {
      // Ignore storage errors (private mode / blocked storage).
    }
  }

  function showLevelToast(newLevel) {
    levelToast.textContent = `Level ${newLevel}!`;
    levelToast.classList.remove("hidden");
    setTimeout(() => {
      levelToast.classList.add("hidden");
    }, 1000);
  }

  function getLevelForScore(v) {
    return Math.floor(v / LEVEL_STEP) + 1;
  }

  function updateLevelState(nextLevel, showToast) {
    level = nextLevel;
    stepMs = Math.max(35, settings.baseSpeed - (level - 1) * 4);
    if (showToast) showLevelToast(level);
  }

  function showLevelToast(newLevel) {
    levelToast.textContent = `Level ${newLevel}!`;
    levelToast.classList.remove("hidden");
    setTimeout(() => {
      levelToast.classList.add("hidden");
    }, 1000);
  }

  function getLevelForScore(v) {
    return Math.floor(v / LEVEL_STEP) + 1;
  }

  function updateLevelState(nextLevel, showToast) {
    level = nextLevel;
    stepMs = Math.max(35, settings.baseSpeed - (level - 1) * 4);
    if (showToast) showLevelToast(level);
  }

  function reset() {
    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);

    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];

    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    updateLevelState(1, false);
    food = spawnFood();
    running = true;
    lastTime = 0;
    overlay.classList.add("hidden");
    levelToast.classList.add("hidden");
    updateUI();
  }

  function isCellBlocked(x, y) {
    return snake?.some(s => s.x === x && s.y === y);
  }

  function spawnFood() {
    while (true) {
      const p = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
      if (!isCellBlocked(p.x, p.y)) return p;
    }
  }

  function updateUI() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    levelEl.textContent = String(level);
    pauseBtn.textContent = running ? "Pause" : "Resume";
    settingsInfoEl.textContent = `Speed ${settings.baseSpeed}ms • Grid ${GRID}x${GRID}`;
  }

  function setDirection(nx, ny) {
    if (nx === -dir.x && ny === -dir.y) return;
    nextDir = { x: nx, y: ny };
  }

  function gameOver() {
    running = false;
    overlayTitle.textContent = "Game Over";
    overlayMsg.textContent = "Tap Restart to play again.";
    overlay.classList.remove("hidden");
    updateUI();
  }

  function tick() {
    dir = nextDir;

    const head = snake[0];
    const newHead = { x: head.x + dir.x, y: head.y + dir.y };

    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      gameOver();
      return;
    }

    if (snake.some((s, i) => i !== 0 && s.x === newHead.x && s.y === newHead.y)) {
      gameOver();
      return;
    }

    snake.unshift(newHead);

    if (newHead.x === food.x && newHead.y === food.y) {
      score += 1;
      if (score > best) {
        best = score;
        saveBest(best);
      }

      const newLevel = getLevelForScore(score);
      if (newLevel > level) updateLevelState(newLevel, true);
      food = spawnFood();
    } else {
      snake.pop();
    }

    updateUI();
  }

  function drawObstacles() {
    ctx.fillStyle = COLORS.obstacle;
    obstacles.forEach((key) => {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      ctx.beginPath();
      ctx.roundRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 4);
      ctx.fill();
    });
  }

  function draw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      const p = i * CELL;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }

    drawObstacles();

    // food
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.roundRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6, 6);
    ctx.fill();

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      ctx.fillStyle = i === 0 ? COLORS.head : COLORS.snake;
      ctx.beginPath();
      ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 6);
      ctx.fill();
    }
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;

    if (running && dt >= stepMs) {
      tick();
      lastTime = ts;
    }

    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") setDirection(0, -1);
    else if (k === "arrowdown" || k === "s") setDirection(0, 1);
    else if (k === "arrowleft" || k === "a") setDirection(-1, 0);
    else if (k === "arrowright" || k === "d") setDirection(1, 0);
    else if (k === " " || k === "p") togglePause();
    else if (k === "r") reset();
    else if (k === "l") {
      updateLevelState(level + 1, true);
      food = spawnFood();
      updateUI();
    }
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!t) return;

    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;

    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 20) return;

    if (ax > ay) setDirection(dx > 0 ? 1 : -1, 0);
    else setDirection(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  document.querySelectorAll(".pad-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.getAttribute("data-dir");
      if (d === "up") setDirection(0, -1);
      if (d === "down") setDirection(0, 1);
      if (d === "left") setDirection(-1, 0);
      if (d === "right") setDirection(1, 0);
    });
  });

  function togglePause() {
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
  restartBtn.addEventListener("click", reset);
  overlayRestart.addEventListener("click", reset);

  best = loadBest();
  bestEl.textContent = String(best);

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

  applySettings();
  reset();
  requestAnimationFrame(loop);
})();
