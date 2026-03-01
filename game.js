(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

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

  const SIZE = canvas.width;
  const LEVEL_FOOD_STEP = 5;
  const PATTERN_COUNT = 6;

  const DEFAULT_SETTINGS = {
    baseSpeed: 110,
    gridSize: 20,
  };

  const COLORS = {
    bg: "#0b0f14",
    grid: "rgba(255,255,255,0.06)",
    snake: "#4ade80",
    head: "#86efac",
    food: "#fb7185",
    obstacle: "#64748b",
  };

  const hasRoundRect = typeof ctx.roundRect === "function";

  let settings, GRID, CELL;
  let snake, dir, nextDir, food, score, best, running, lastTime, stepMs, level, obstacles;

  function toKey(x, y) {
    return `${x},${y}`;
  }

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
    if (!levelToast) return;
    levelToast.textContent = `Level ${newLevel}!`;
    levelToast.classList.remove("hidden");
    setTimeout(() => {
      levelToast.classList.add("hidden");
    }, 1000);
  }

  function getLevelForScore(v) {
    return Math.floor(v / LEVEL_FOOD_STEP) + 1;
  }

  function getPatternIndexForLevel(lvl) {
    return (lvl - 1) % PATTERN_COUNT;
  }

  function getLoopForLevel(lvl) {
    return Math.floor((lvl - 1) / PATTERN_COUNT);
  }

  function addCell(set, x, y) {
    if (x < 0 || x >= GRID || y < 0 || y >= GRID) return;
    set.add(toKey(x, y));
  }

  function buildObstaclesForLevel(lvl) {
    const set = new Set();

    // Keep level 1 open for a simple start.
    if (lvl === 1) return set;

    const pattern = getPatternIndexForLevel(lvl);
    const loop = getLoopForLevel(lvl);

    if (pattern === 0) {
      // Center box with one opening.
      for (let x = 7; x <= 12; x++) {
        addCell(set, x, 7);
        addCell(set, x, 12);
      }
      for (let y = 8; y <= 11; y++) {
        addCell(set, 7, y);
        if (y !== 10) addCell(set, 12, y);
      }
    } else if (pattern === 1) {
      // Vertical gates.
      for (let y = 2; y < GRID - 2; y++) {
        if (y >= 8 && y <= 11) continue;
        addCell(set, 6, y);
        addCell(set, 13, y);
      }
    } else if (pattern === 2) {
      // Pillars.
      const pillars = [
        [5, 5], [10, 5], [15, 5],
        [5, 10], [15, 10],
        [5, 15], [10, 15], [15, 15],
      ];
      pillars.forEach(([px, py]) => {
        addCell(set, px, py);
        addCell(set, px + 1, py);
        addCell(set, px, py + 1);
        addCell(set, px + 1, py + 1);
      });
    } else if (pattern === 3) {
      // Zig-zag walls.
      for (let x = 2; x < GRID - 2; x++) {
        if (x % 2 === 0) {
          addCell(set, x, 6);
          addCell(set, x, 13);
        }
      }
    } else if (pattern === 4) {
      // Offset horizontal bars.
      for (let x = 2; x < GRID - 2; x++) {
        if (x === 9 || x === 10) continue;
        addCell(set, x, 5);
      }
      for (let x = 2; x < GRID - 2; x++) {
        if (x === 4 || x === 5) continue;
        addCell(set, x, 10);
      }
      for (let x = 2; x < GRID - 2; x++) {
        if (x === 14 || x === 15) continue;
        addCell(set, x, 15);
      }
    } else if (pattern === 5) {
      // Corner brackets.
      for (let i = 2; i <= 6; i++) {
        addCell(set, i, 2);
        addCell(set, 2, i);
        addCell(set, GRID - 3, i);
        addCell(set, GRID - 1 - i, 2);

        addCell(set, i, GRID - 3);
        addCell(set, 2, GRID - 1 - i);
        addCell(set, GRID - 3, GRID - 1 - i);
        addCell(set, GRID - 1 - i, GRID - 3);
      }
    }

    // Add gradual pressure on each cycle through the 6 patterns.
    for (let n = 0; n < loop; n++) {
      const edge = 2 + n;
      if (edge >= GRID - 2 - n) break;
      for (let x = edge; x < GRID - edge; x++) {
        if (x === 9 || x === 10) continue;
        addCell(set, x, edge);
      }
      for (let y = edge + 1; y < GRID - edge; y++) {
        if (y === 9 || y === 10) continue;
        addCell(set, edge, y);
      }
    }

    return set;
  }

  function isObstacleCell(x, y) {
    return obstacles?.has(toKey(x, y));
  }

  function isCellBlocked(x, y) {
    if (isObstacleCell(x, y)) return true;
    return snake?.some(s => s.x === x && s.y === y);
  }

  function updateLevelState(nextLevel, showToast) {
    level = nextLevel;
    obstacles = buildObstaclesForLevel(level);
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
    overlay?.classList.add("hidden");
    levelToast?.classList.add("hidden");
    updateUI();
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
    if (scoreEl) scoreEl.textContent = String(score);
    if (bestEl) bestEl.textContent = String(best);
    if (levelEl) levelEl.textContent = String(level);
    if (pauseBtn) pauseBtn.textContent = running ? "Pause" : "Resume";
    if (settingsInfoEl) settingsInfoEl.textContent = `Speed ${settings.baseSpeed}ms • Grid ${GRID}x${GRID}`;
  }

  function setDirection(nx, ny) {
    if (nx === -dir.x && ny === -dir.y) return;
    nextDir = { x: nx, y: ny };
  }

  function gameOver() {
    running = false;
    if (overlayTitle) overlayTitle.textContent = "Game Over";
    if (overlayMsg) overlayMsg.textContent = "Tap Restart to play again.";
    overlay?.classList.remove("hidden");
    updateUI();
  }

  function drawCell(x, y, inset, radius, color) {
    const px = x * CELL + inset;
    const py = y * CELL + inset;
    const size = Math.max(1, CELL - inset * 2);
    ctx.fillStyle = color;
    if (hasRoundRect) {
      ctx.beginPath();
      ctx.roundRect(px, py, size, size, radius);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, size, size);
    }
  }

  function tick() {
    dir = nextDir;

    const head = snake[0];
    const newHead = { x: head.x + dir.x, y: head.y + dir.y };

    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      gameOver();
      return;
    }

    if (isObstacleCell(newHead.x, newHead.y)) {
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

    if (obstacles) {
      obstacles.forEach((key) => {
        const [xs, ys] = key.split(",");
        drawCell(Number(xs), Number(ys), 3, 4, COLORS.obstacle);
      });
    }

    drawCell(food.x, food.y, 3, 6, COLORS.food);

    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      drawCell(s.x, s.y, 2, 6, i === 0 ? COLORS.head : COLORS.snake);
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
      if (overlayTitle) overlayTitle.textContent = "Paused";
      if (overlayMsg) overlayMsg.textContent = "Press Resume or tap Pause again.";
      overlay?.classList.remove("hidden");
    } else {
      overlay?.classList.add("hidden");
    }
    updateUI();
  }

  pauseBtn?.addEventListener("click", togglePause);
  restartBtn?.addEventListener("click", reset);
  overlayRestart?.addEventListener("click", reset);

  best = loadBest();
  if (bestEl) bestEl.textContent = String(best);

  applySettings();
  reset();
  requestAnimationFrame(loop);
})();
