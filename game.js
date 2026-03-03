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

  const GRID = 20;               // 20x20 grid
  const SIZE = canvas.width;     // internal resolution
  const CELL = SIZE / GRID;

  const COLORS = {
    bg: "#0b0f14",
    grid: "rgba(255,255,255,0.06)",
    snake: "#4ade80",
    head: "#86efac",
    food: "#fb7185",
  };

  let snake, dir, nextDir, food, score, best, running, lastTime, stepMs;

  function loadBest() {
    const v = Number(localStorage.getItem("snake_best") || "0");
    return Number.isFinite(v) ? v : 0;
  }
  function saveBest(v) {
    localStorage.setItem("snake_best", String(v));
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
    stepMs = 110; // speed (lower = faster)
    running = true;
    lastTime = 0;
    overlay.classList.add("hidden");
    updateUI();
  }

  function spawnFood() {
    while (true) {
      const p = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
      if (!snake?.some(s => s.x === p.x && s.y === p.y)) return p;
    }
  }

  function updateUI() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    pauseBtn.textContent = running ? "Pause" : "Resume";
  }

  function setDirection(nx, ny) {
    // prevent reversing into yourself
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

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      gameOver();
      return;
    }

    // Self collision
    if (snake.some((s, i) => i !== 0 && s.x === newHead.x && s.y === newHead.y)) {
      gameOver();
      return;
    }

    snake.unshift(newHead);

    // Eat food
    if (newHead.x === food.x && newHead.y === food.y) {
      score += 1;
      if (score > best) {
        best = score;
        saveBest(best);
      }
      // speed up slightly
      stepMs = Math.max(55, stepMs - 2);
      food = spawnFood();
    } else {
      snake.pop();
    }

    updateUI();
  }

  function draw() {
    // background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // subtle grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      const p = i * CELL;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
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

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") setDirection(0, -1);
    else if (k === "arrowdown" || k === "s") setDirection(0, 1);
    else if (k === "arrowleft" || k === "a") setDirection(-1, 0);
    else if (k === "arrowright" || k === "d") setDirection(1, 0);
    else if (k === " " || k === "p") togglePause();
    else if (k === "r") reset();
  });

  // Touch controls (swipe)
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    // prevent scrolling while swiping on canvas
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
    if (Math.max(ax, ay) < 20) return; // ignore tiny swipes

    if (ax > ay) setDirection(dx > 0 ? 1 : -1, 0);
    else setDirection(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  // On-screen pad
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

  // Start
  best = loadBest();
  bestEl.textContent = String(best);

  // RoundRect polyfill for older browsers
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

  reset();
  requestAnimationFrame(loop);
})();
