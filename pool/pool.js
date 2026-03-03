/* 8-ball Pool Starter
 * - Mobile-friendly pointer controls (aim + drag power)
 * - 2P local + 1P vs AI mode
 * - Rule/turn skeleton for 8-ball (groups, fouls, ball-in-hand)
 * NOTE: This is a scaffold. The collision solver is included but tuned conservatively.
 */

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const turnEl = document.getElementById("turn");
const bihEl = document.getElementById("bih");
const p1groupEl = document.getElementById("p1group");
const p2groupEl = document.getElementById("p2group");

const modeSel = document.getElementById("mode");
const diffSel = document.getElementById("difficulty");
document.getElementById("newGame").addEventListener("click", () => newGame());

/** --- Canvas sizing (CSS size -> internal pixels) --- */
function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
}
window.addEventListener("resize", resizeCanvasToDisplaySize);

/** --- Table + physics constants --- */
const PHYS = {
  friction: 0.992,     // velocity decay per step
  railRestitution: 0.92,
  ballRestitution: 0.985,
  stopEps: 0.03,       // below this -> considered stopped
  maxPower: 28,        // impulse scaling
};

const BALL = {
  r: 10,    // will be scaled based on canvas size each resize
  m: 1,
};

function vecLen(x, y) { return Math.hypot(x, y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** --- Game state --- */
const STATE = {
  mode: "ai",             // "ai" or "local"
  difficulty: "medium",
  phase: "AIM",           // AIM | ROLL | RESOLVE | AI
  current: 0,             // 0 = P1, 1 = P2/AI
  ballInHand: false,
  groups: [null, null],   // "solids" | "stripes" | null
  winner: null,
  foul: false,

  // shot tracking for rules
  firstContact: null,     // ball id first hit by cue ball (object ball number)
  railAfterContact: false,
  pocketedThisShot: [],

  balls: [],              // Ball objects
  table: null,
};

function setStatus(msg) { statusEl.textContent = msg; }

function updateHUD() {
  const g0 = STATE.groups[0] ?? "—";
  const g1 = STATE.groups[1] ?? "—";
  p1groupEl.textContent = g0;
  p2groupEl.textContent = g1;
  turnEl.textContent = STATE.current === 0 ? "Player 1" : (STATE.mode === "ai" ? "AI" : "Player 2");
  bihEl.textContent = STATE.ballInHand ? "yes" : "no";
}

/** --- Table geometry (computed from canvas) --- */
function makeTable() {
  // a cushion inset to keep balls away from canvas edge
  const W = canvas.width, H = canvas.height;
  const inset = Math.round(Math.min(W, H) * 0.06);
  const left = inset, right = W - inset, top = inset, bottom = H - inset;

  const pocketR = Math.round(Math.min(W, H) * 0.045);
  const pockets = [
    { x: left, y: top, r: pocketR },
    { x: (left + right) / 2, y: top, r: pocketR },
    { x: right, y: top, r: pocketR },
    { x: left, y: bottom, r: pocketR },
    { x: (left + right) / 2, y: bottom, r: pocketR },
    { x: right, y: bottom, r: pocketR },
  ];

  // head string for kitchen (break / ball in hand placement restriction if you want)
  const headX = left + (right - left) * 0.25;

  return { left, right, top, bottom, pockets, headX };
}

function scaleBallRadius() {
  const W = canvas.width, H = canvas.height;
  BALL.r = Math.round(Math.min(W, H) * 0.018);
}

/** --- Balls --- */
function makeBall(number, x, y, isCue = false) {
  return {
    number, // 0 for cue, 8 for eight, 1-7 solids, 9-15 stripes
    x, y,
    vx: 0, vy: 0,
    r: BALL.r,
    active: true,
    isCue,
  };
}

function rackBalls() {
  const t = STATE.table;
  const balls = [];

  // cue ball
  const cueX = t.left + (t.right - t.left) * 0.20;
  const cueY = (t.top + t.bottom) / 2;
  balls.push(makeBall(0, cueX, cueY, true));

  // triangle rack
  const rackX = t.left + (t.right - t.left) * 0.70;
  const rackY = (t.top + t.bottom) / 2;

  // numbers 1-15 (we'll place 8 in the center row, other numbers shuffled)
  const nums = [];
  for (let n = 1; n <= 15; n++) if (n !== 8) nums.push(n);
  shuffle(nums);

  const spacing = BALL.r * 2.05;
  let idx = 0;

  // rows: 5,4,3,2,1 (point to the left usually; we point to the left-to-right rack direction)
  const rows = 5;
  for (let row = 0; row < rows; row++) {
    const count = rows - row;
    const x = rackX + row * spacing;
    const yStart = rackY - (count - 1) * spacing * 0.5;
    for (let i = 0; i < count; i++) {
      let num;
      // place 8 ball in the center of the third row (row=2) / middle position
      if (row === 2 && i === 1) num = 8;
      else num = nums[idx++];

      balls.push(makeBall(num, x, yStart + i * spacing, false));
    }
  }

  STATE.balls = balls;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** --- Input (pointer aiming + ball-in-hand placing) --- */
const INPUT = {
  down: false,
  placingCue: false,
  aimX: 0, aimY: 0,
  startX: 0, startY: 0,
};

function screenToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return {
    x: (e.clientX - rect.left) * dpr,
    y: (e.clientY - rect.top) * dpr
  };
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = screenToCanvas(e);
  INPUT.down = true;
  INPUT.startX = p.x; INPUT.startY = p.y;
  INPUT.aimX = p.x; INPUT.aimY = p.y;

  if (STATE.winner) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  if (STATE.ballInHand) {
    INPUT.placingCue = true;
  } else {
    INPUT.placingCue = false;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!INPUT.down) return;
  const p = screenToCanvas(e);
  INPUT.aimX = p.x; INPUT.aimY = p.y;

  if (INPUT.placingCue) {
    const cue = getCueBall();
    // keep cue within rails and not inside pockets
    cue.x = clamp(p.x, STATE.table.left + cue.r, STATE.table.right - cue.r);
    cue.y = clamp(p.y, STATE.table.top + cue.r, STATE.table.bottom - cue.r);
  }
});

canvas.addEventListener("pointerup", () => {
  if (!INPUT.down) return;
  INPUT.down = false;

  if (STATE.winner) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  if (INPUT.placingCue) {
    // finish ball in hand placement
    STATE.ballInHand = false;
    INPUT.placingCue = false;
    updateHUD();
    return;
  }

  // take shot
  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = cue.x - INPUT.aimX;
  const dy = cue.y - INPUT.aimY;
  const dist = vecLen(dx, dy);
  const power = clamp(dist / (BALL.r * 7), 0, 1); // normalized
  const impulse = power * PHYS.maxPower;

  if (impulse < 0.2) return;

  // direction from aim point -> cue (pull back) so ball goes away from pointer
  const len = Math.max(1e-6, vecLen(dx, dy));
  cue.vx += (dx / len) * impulse;
  cue.vy += (dy / len) * impulse;

  beginShot();
});

function getCueBall() {
  return STATE.balls.find(b => b.isCue);
}

/** --- Shot lifecycle & rules tracking --- */
function beginShot() {
  STATE.phase = "ROLL";
  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisShot = [];
  STATE.foul = false;
  setStatus("Rolling…");
}

function endShotAndResolve() {
  STATE.phase = "RESOLVE";
  resolveTurn();
}

function allStopped() {
  for (const b of STATE.balls) {
    if (!b.active) continue;
    if (vecLen(b.vx, b.vy) > PHYS.stopEps) return false;
  }
  return true;
}

/** --- Physics step --- */
function step() {
  const t = STATE.table;

  // integrate
  for (const b of STATE.balls) {
    if (!b.active) continue;
    b.x += b.vx;
    b.y += b.vy;

    // friction
    b.vx *= PHYS.friction;
    b.vy *= PHYS.friction;

    // rail collisions
    // left/right
    if (b.x - b.r < t.left) {
      b.x = t.left + b.r;
      b.vx = -b.vx * PHYS.railRestitution;
      if (STATE.firstContact) STATE.railAfterContact = true;
    } else if (b.x + b.r > t.right) {
      b.x = t.right - b.r;
      b.vx = -b.vx * PHYS.railRestitution;
      if (STATE.firstContact) STATE.railAfterContact = true;
    }
    // top/bottom
    if (b.y - b.r < t.top) {
      b.y = t.top + b.r;
      b.vy = -b.vy * PHYS.railRestitution;
      if (STATE.firstContact) STATE.railAfterContact = true;
    } else if (b.y + b.r > t.bottom) {
      b.y = t.bottom - b.r;
      b.vy = -b.vy * PHYS.railRestitution;
      if (STATE.firstContact) STATE.railAfterContact = true;
    }
  }

  // ball-ball collisions (naive O(n^2) is fine for 16 balls)
  const balls = STATE.balls;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.active) continue;

    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b.active) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.r + b.r;

      if (dist > 0 && dist < minDist) {
        // separate overlap
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minDist - dist);
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        // relative velocity along normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
          const e = PHYS.ballRestitution;
          const jImpulse = -(1 + e) * velAlongNormal / (1 / BALL.m + 1 / BALL.m);
          const ix = jImpulse * nx;
          const iy = jImpulse * ny;

          a.vx -= ix / BALL.m;
          a.vy -= iy / BALL.m;
          b.vx += ix / BALL.m;
          b.vy += iy / BALL.m;

          // rules: track first contact with cue ball
          if (!STATE.firstContact) {
            if (a.isCue && !b.isCue) STATE.firstContact = b.number;
            else if (b.isCue && !a.isCue) STATE.firstContact = a.number;
          }
        }
      }
    }
  }

  // pocket detection
  for (const b of STATE.balls) {
    if (!b.active) continue;
    for (const p of t.pockets) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < p.r) {
        pocketBall(b);
        break;
      }
    }
  }
}

function pocketBall(ball) {
  // stop ball, mark inactive
  ball.active = false;
  ball.vx = ball.vy = 0;
  STATE.pocketedThisShot.push(ball.number);

  // cue scratch -> respawn later via ball-in-hand
  if (ball.isCue) {
    setStatus("Scratch!");
  }
}

/** --- Turn resolution (8-ball skeleton) --- */
function isSolid(n) { return n >= 1 && n <= 7; }
function isStripe(n) { return n >= 9 && n <= 15; }

function groupOfBall(n) {
  if (isSolid(n)) return "solids";
  if (isStripe(n)) return "stripes";
  return null;
}

function playerLegalGroup(playerIndex) {
  return STATE.groups[playerIndex]; // can be null initially
}

function opponent(i) { return i === 0 ? 1 : 0; }

function resolveTurn() {
  const cur = STATE.current;
  const opp = opponent(cur);

  const cuePocketed = STATE.pocketedThisShot.includes(0);
  const eightPocketed = STATE.pocketedThisShot.includes(8);

  // Determine if group assignment happens this shot
  if (STATE.groups[0] == null && STATE.groups[1] == null) {
    // First pocketed non-cue non-8 ball assigns groups (only if not a foul)
    const firstObj = STATE.pocketedThisShot.find(n => n !== 0 && n !== 8);
    if (firstObj != null) {
      const g = groupOfBall(firstObj);
      if (g) {
        STATE.groups[cur] = g;
        STATE.groups[opp] = g === "solids" ? "stripes" : "solids";
      }
    }
  }

  // Compute foul
  const legalGroup = playerLegalGroup(cur);
  const firstContact = STATE.firstContact;

  // 1) no contact at all
  if (firstContact == null) STATE.foul = true;

  // 2) wrong first contact (once groups assigned)
  if (!STATE.foul && legalGroup) {
    const firstGroup = groupOfBall(firstContact);
    if (firstContact === 8) {
      // hitting 8 first is foul unless player is on 8 (cleared group)
      if (!playerOnEight(cur)) STATE.foul = true;
    } else if (firstGroup && firstGroup !== legalGroup) {
      STATE.foul = true;
    }
  }

  // 3) rail after contact required if no pocket
  const pocketedAnyObj = STATE.pocketedThisShot.some(n => n !== 0);
  if (!STATE.foul && !pocketedAnyObj && !STATE.railAfterContact) STATE.foul = true;

  // 4) scratch
  if (cuePocketed) STATE.foul = true;

  // Handle 8-ball outcomes
  if (eightPocketed) {
    // If pocketed on foul or before clearing group => loss
    if (STATE.foul || !playerOnEight(cur)) {
      STATE.winner = opp;
      setStatus(`${winnerName()} wins (illegal 8-ball).`);
      updateHUD();
      return;
    } else {
      STATE.winner = cur;
      setStatus(`${winnerName()} wins!`);
      updateHUD();
      return;
    }
  }

  // Decide whether player continues
  const pocketedOwn = pocketedOwnGroupThisShot(cur);

  if (STATE.foul) {
    // opponent gets ball in hand, turn switches
    STATE.ballInHand = true;
    STATE.current = opp;
    setStatus("Foul! Ball in hand.");
  } else if (pocketedOwn || (STATE.groups[0] == null && STATE.groups[1] == null && pocketedAnyObj)) {
    // before groups assigned, any legal object pocket -> continue
    setStatus("Nice! Shoot again.");
  } else {
    STATE.current = opp;
    setStatus("Turn switches.");
  }

  // If cue got pocketed, respawn cue ball at a default spot (ball in hand still applies)
  if (cuePocketed) respawnCueBall();

  STATE.phase = "AIM";
  updateHUD();

  // AI turn?
  if (!STATE.winner && STATE.mode === "ai" && STATE.current === 1) {
    STATE.phase = "AI";
    setTimeout(aiTakeTurn, 250); // small delay feels natural
  }
}

function playerOnEight(playerIndex) {
  const g = STATE.groups[playerIndex];
  if (!g) return false;
  // if all balls of player's group are inactive, they are "on the 8"
  for (const b of STATE.balls) {
    if (!b.active) continue;
    if (g === "solids" && isSolid(b.number)) return false;
    if (g === "stripes" && isStripe(b.number)) return false;
  }
  return true;
}

function pocketedOwnGroupThisShot(playerIndex) {
  const g = STATE.groups[playerIndex];
  if (!g) return false;
  for (const n of STATE.pocketedThisShot) {
    if (g === "solids" && isSolid(n)) return true;
    if (g === "stripes" && isStripe(n)) return true;
  }
  return false;
}

function respawnCueBall() {
  const cue = getCueBall();
  if (!cue) return;
  cue.active = true;
  cue.vx = cue.vy = 0;
  // default respawn in kitchen area
  const t = STATE.table;
  cue.x = t.left + (t.right - t.left) * 0.20;
  cue.y = (t.top + t.bottom) / 2;
}

function winnerName() {
  return STATE.winner === 0 ? "Player 1" : (STATE.mode === "ai" ? "AI" : "Player 2");
}

/** --- AI Hook (placeholder: very dumb shot for now) --- */
function aiTakeTurn() {
  if (STATE.winner) return;
  if (STATE.phase !== "AI") return;

  // TODO: Replace with shot search + simulation.
  // For now: aim at nearest legal ball and shoot gently.
  const cue = getCueBall();
  const target = pickNearestLegalTargetBall();
  if (!cue || !target) {
    // if no target found, just tap a random direction
    cue.vx += 6;
    beginShot();
    return;
  }

  const dx = target.x - cue.x;
  const dy = target.y - cue.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));

  // difficulty controls power + jitter
  const diff = STATE.difficulty;
  const jitter = diff === "easy" ? 0.14 : diff === "medium" ? 0.08 : 0.03;
  const ang = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * jitter;
  const power = diff === "easy" ? 10 : diff === "medium" ? 14 : 18;

  cue.vx += Math.cos(ang) * power;
  cue.vy += Math.sin(ang) * power;

  beginShot();
}

function pickNearestLegalTargetBall() {
  const cue = getCueBall();
  if (!cue) return null;

  const g = STATE.groups[1]; // AI group
  let best = null;
  let bestD = Infinity;

  for (const b of STATE.balls) {
    if (!b.active) continue;
    if (b.isCue) continue;
    if (b.number === 8) {
      // only target 8 if on eight
      if (!playerOnEight(1)) continue;
    } else if (g) {
      if (g === "solids" && !isSolid(b.number)) continue;
      if (g === "stripes" && !isStripe(b.number)) continue;
    }
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/** --- Rendering --- */
function draw() {
  const t = STATE.table;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // table felt background is in CSS; here draw rails + pockets
  // rails
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(t.left - BALL.r * 1.2, t.top - BALL.r * 1.2, (t.right - t.left) + BALL.r * 2.4, BALL.r * 1.2);
  ctx.fillRect(t.left - BALL.r * 1.2, t.bottom, (t.right - t.left) + BALL.r * 2.4, BALL.r * 1.2);
  ctx.fillRect(t.left - BALL.r * 1.2, t.top, BALL.r * 1.2, (t.bottom - t.top));
  ctx.fillRect(t.right, t.top, BALL.r * 1.2, (t.bottom - t.top));
  ctx.restore();

  // pockets
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (const p of t.pockets) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // balls
  for (const b of STATE.balls) {
    if (!b.active) continue;
    drawBall(b);
  }

  // aiming line (human turn, aiming phase, not ball-in-hand)
  if (STATE.phase === "AIM" && !STATE.ballInHand && !STATE.winner) {
    const isHumanTurn = !(STATE.mode === "ai" && STATE.current === 1);
    if (isHumanTurn && INPUT.down) {
      const cue = getCueBall();
      if (cue && cue.active) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = Math.max(2, BALL.r * 0.2);
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(INPUT.aimX, INPUT.aimY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // winner overlay
  if (STATE.winner != null) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = `${Math.round(canvas.height * 0.08)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(`${winnerName()} wins!`, canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}

function drawBall(b) {
  ctx.save();
  // simple colors by type (not specifying exact palette in CSS; canvas uses fillStyle)
  let fill = "white";
  if (b.number === 0) fill = "white";
  else if (b.number === 8) fill = "black";
  else if (isSolid(b.number)) fill = "rgba(255,220,120,1)";
  else fill = "rgba(140,200,255,1)";

  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  // outline
  ctx.lineWidth = Math.max(1, b.r * 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();

  // number label
  if (b.number !== 0) {
    ctx.fillStyle = b.number === 8 ? "white" : "rgba(0,0,0,0.8)";
    ctx.font = `${Math.round(b.r * 1.2)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.number), b.x, b.y);
  }

  ctx.restore();
}

/** --- Main loop --- */
function loop() {
  resizeCanvasToDisplaySize();
  if (!STATE.table || STATE.table.W !== canvas.width || STATE.table.H !== canvas.height) {
    scaleBallRadius();
    STATE.table = makeTable();
    // when resizing, re-rack to avoid weird scaling mid-game
    if (!STATE.balls.length) rackBalls();
  }

  if (STATE.phase === "ROLL") {
    // multiple physics substeps for stability
    const sub = 2;
    for (let i = 0; i < sub; i++) step();

    if (allStopped()) endShotAndResolve();
  }

  draw();
  requestAnimationFrame(loop);
}

/** --- New game --- */
function newGame() {
  STATE.mode = modeSel.value;
  STATE.difficulty = diffSel.value;

  STATE.phase = "AIM";
  STATE.current = 0;
  STATE.ballInHand = false;
  STATE.groups = [null, null];
  STATE.winner = null;

  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisShot = [];
  STATE.foul = false;

  resizeCanvasToDisplaySize();
  scaleBallRadius();
  STATE.table = makeTable();
  rackBalls();

  setStatus("Aim and shoot.");
  updateHUD();
}

modeSel.addEventListener("change", () => newGame());
diffSel.addEventListener("change", () => { STATE.difficulty = diffSel.value; });

newGame();
updateHUD();
requestAnimationFrame(loop);
