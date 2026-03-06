const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const ui = {
  mode: document.getElementById("mode"),
  ai: document.getElementById("difficulty"),
  newGame: document.getElementById("newGame"),
  status: document.getElementById("status"),
  p1Group: document.getElementById("p1group"),
  p2Group: document.getElementById("p2group"),
  p2Label: document.getElementById("p2label"),
  turn: document.getElementById("turn"),
  bih: document.getElementById("bih")
};

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const BALL = {
  r: 11
};

const PHYS = {
  friction: 0.988,
  minSpeed: 0.05,
  restitutionRail: 0.98,
  restitutionBall: 0.96,
  maxPower: 14.5,
  minPower: 1.2,
  substeps: 2
};

const TABLE = {
  marginX: 80,
  marginY: 80,
  rail: 28,
  pocketR: 18
};

const INPUT = {
  down: false,
  aimX: 0,
  aimY: 0,
  dragDist: 0
};

const BALL_COLORS = {
  1: "#f7d117",
  2: "#2f6df6",
  3: "#d62828",
  4: "#6f42c1",
  5: "#f28c28",
  6: "#1f9d55",
  7: "#7a1f1f",
  8: "#111111",
  9: "#f7d117",
  10: "#2f6df6",
  11: "#d62828",
  12: "#6f42c1",
  13: "#f28c28",
  14: "#1f9d55",
  15: "#7a1f1f"
};

const STATE = {
  mode: "ai",
  aiLevel: "medium",
  balls: [],
  current: 0,
  groups: [null, null],
  ballInHand: false,
  winner: null,
  shotInProgress: false,
  phase: "AIM",
  firstContact: null,
  pocketedThisTurn: [],
  foul: false,
  table: null
};

function resize() {
  const cssWidth = Math.min(window.innerWidth * 0.96, 1020);
  const cssHeight = cssWidth * 0.55;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * DPR);
  canvas.height = Math.round(cssHeight * DPR);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = cssWidth;
  const h = cssHeight;

  const left = TABLE.marginX;
  const right = w - TABLE.marginX;
  const top = TABLE.marginY;
  const bottom = h - TABLE.marginY;

  const pockets = [
    { x: left, y: top, r: TABLE.pocketR },
    { x: (left + right) / 2, y: top, r: TABLE.pocketR },
    { x: right, y: top, r: TABLE.pocketR },
    { x: left, y: bottom, r: TABLE.pocketR },
    { x: (left + right) / 2, y: bottom, r: TABLE.pocketR },
    { x: right, y: bottom, r: TABLE.pocketR }
  ];

  STATE.table = { left, right, top, bottom, pockets };

  if (!STATE.balls.length) {
    newGame();
  }
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeBall(number, x, y, cue = false) {
  return {
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    r: BALL.r,
    active: true,
    cue,
    sunk: false
  };
}

function getCueBall() {
  return STATE.balls.find((b) => b.cue);
}

function isSolid(n) {
  return n >= 1 && n <= 7;
}

function isStripe(n) {
  return n >= 9 && n <= 15;
}

function groupOfBall(n) {
  if (isSolid(n)) return "solids";
  if (isStripe(n)) return "stripes";
  return null;
}

function groupLabel(group) {
  if (!group) return "—";
  return group === "solids" ? "Solids" : "Stripes";
}

function currentPlayerName() {
  if (STATE.current === 0) return "Player 1";
  return STATE.mode === "ai" ? "AI" : "Player 2";
}

function winnerName() {
  if (STATE.winner === 0) return "Player 1";
  return STATE.mode === "ai" ? "AI" : "Player 2";
}

function updateHUD() {
  if (ui.p2Label) {
    ui.p2Label.textContent = STATE.mode === "ai" ? "AI" : "Player 2";
  }

  if (ui.p1Group) ui.p1Group.textContent = groupLabel(STATE.groups[0]);
  if (ui.p2Group) ui.p2Group.textContent = groupLabel(STATE.groups[1]);
  if (ui.turn) ui.turn.textContent = STATE.winner != null ? `${winnerName()} wins` : currentPlayerName();
  if (ui.bih) ui.bih.textContent = STATE.ballInHand ? "yes" : "no";

  if (!ui.status) return;

  if (STATE.winner != null) {
    ui.status.textContent = `${winnerName()} wins! Tap New Game to play again.`;
    return;
  }

  if (STATE.ballInHand) {
    ui.status.textContent = `${currentPlayerName()} has ball-in-hand. Tap to place the cue ball, then drag to shoot.`;
  } else if (STATE.phase === "AIM") {
    ui.status.textContent = `${currentPlayerName()} to shoot. Pull back from the cue ball to set direction and power.`;
  } else {
    ui.status.textContent = `${currentPlayerName()} shot in progress...`;
  }
}

function rackBalls() {
  const t = STATE.table;
  const balls = [];

  const cueX = t.left + (t.right - t.left) * 0.20;
  const cueY = (t.top + t.bottom) / 2;
  balls.push(makeBall(0, cueX, cueY, true));

  const rackX = t.left + (t.right - t.left) * 0.70;
  const rackY = (t.top + t.bottom) / 2;
  const spacing = BALL.r * 2.02;

  const solids = [2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  shuffle(solids);
  shuffle(stripes);

  const backLeftCorner = solids.pop();
  const backRightCorner = stripes.pop();

  const remaining = [...solids, ...stripes];
  shuffle(remaining);

  const layout = [
    [1],
    [remaining.pop(), remaining.pop()],
    [remaining.pop(), 8, remaining.pop()],
    [remaining.pop(), remaining.pop(), remaining.pop(), remaining.pop()],
    [backLeftCorner, remaining.pop(), remaining.pop(), remaining.pop(), backRightCorner]
  ];

  for (let row = 0; row < layout.length; row++) {
    const count = layout[row].length;
    const x = rackX + row * spacing;
    const yStart = rackY - ((count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
      balls.push(makeBall(layout[row][i], x, yStart + i * spacing, false));
    }
  }

  STATE.balls = balls;
}

function newGame() {
  STATE.current = 0;
  STATE.groups = [null, null];
  STATE.ballInHand = false;
  STATE.winner = null;
  STATE.shotInProgress = false;
  STATE.phase = "AIM";
  STATE.firstContact = null;
  STATE.pocketedThisTurn = [];
  STATE.foul = false;
  INPUT.down = false;
  INPUT.dragDist = 0;

  rackBalls();
  updateHUD();
  draw();
}

function clearShotFlags() {
  STATE.firstContact = null;
  STATE.pocketedThisTurn = [];
  STATE.foul = false;
}

function allStopped() {
  return STATE.balls.every(
    (b) => !b.active || (Math.abs(b.vx) < PHYS.minSpeed && Math.abs(b.vy) < PHYS.minSpeed)
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

function canPlaceCueBall(x, y) {
  const t = STATE.table;
  const cue = getCueBall();
  if (!cue) return false;

  const px = clamp(x, t.left + cue.r + 2, t.right - cue.r - 2);
  const py = clamp(y, t.top + cue.r + 2, t.bottom - cue.r - 2);

  for (const b of STATE.balls) {
    if (!b.active || b.cue) continue;
    if (dist(px, py, b.x, b.y) < cue.r + b.r + 2) return false;
  }
  return true;
}

function placeCueBall(x, y) {
  const t = STATE.table;
  const cue = getCueBall();
  if (!cue) return false;
  if (!canPlaceCueBall(x, y)) return false;

  cue.active = true;
  cue.sunk = false;
  cue.vx = 0;
  cue.vy = 0;
  cue.x = clamp(x, t.left + cue.r + 2, t.right - cue.r - 2);
  cue.y = clamp(y, t.top + cue.r + 2, t.bottom - cue.r - 2);
  STATE.ballInHand = false;
  updateHUD();
  return true;
}

function powerFromDrag(len) {
  const maxDrag = 180;
  const t = clamp(len / maxDrag, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return PHYS.minPower + (PHYS.maxPower - PHYS.minPower) * eased;
}

function shootTowards(x, y, powerScale = 1) {
  const cue = getCueBall();
  if (!cue || !cue.active || STATE.winner != null) return;

  const dx = cue.x - x;
  const dy = cue.y - y;
  const len = Math.hypot(dx, dy);
  if (len < 8) return;

  const power = powerFromDrag(len) * powerScale;
  cue.vx = (dx / len) * power;
  cue.vy = (dy / len) * power;

  STATE.phase = "ROLL";
  STATE.shotInProgress = true;
  clearShotFlags();
  updateHUD();
}

function switchTurn() {
  STATE.current = 1 - STATE.current;
}

function activeBallsOfGroup(group) {
  return STATE.balls.filter((b) => b.active && groupOfBall(b.number) === group);
}

function assignGroupsFromBall(number) {
  const group = groupOfBall(number);
  if (!group) return;
  const other = group === "solids" ? "stripes" : "solids";
  STATE.groups[STATE.current] = group;
  STATE.groups[1 - STATE.current] = other;
}

function handlePocket(ball) {
  ball.active = false;
  ball.sunk = true;
  ball.vx = 0;
  ball.vy = 0;
  STATE.pocketedThisTurn.push(ball.number);

  if (ball.cue) {
    STATE.foul = true;
    STATE.ballInHand = true;
    return;
  }

  if (ball.number === 8) {
    const playerGroup = STATE.groups[STATE.current];
    const canLegallyPot8 = playerGroup && activeBallsOfGroup(playerGroup).length === 0;

    if (canLegallyPot8 && !STATE.foul) {
      STATE.winner = STATE.current;
    } else {
      STATE.winner = 1 - STATE.current;
    }
  }
}

function resolveRails(ball) {
  const t = STATE.table;

  if (ball.x - ball.r < t.left) {
    ball.x = t.left + ball.r;
    ball.vx *= -PHYS.restitutionRail;
  } else if (ball.x + ball.r > t.right) {
    ball.x = t.right - ball.r;
    ball.vx *= -PHYS.restitutionRail;
  }

  if (ball.y - ball.r < t.top) {
    ball.y = t.top + ball.r;
    ball.vy *= -PHYS.restitutionRail;
  } else if (ball.y + ball.r > t.bottom) {
    ball.y = t.bottom - ball.r;
    ball.vy *= -PHYS.restitutionRail;
  }
}

function resolveBallCollision(a, b) {
  if (!a.active || !b.active) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (d === 0 || d >= minD) return;

  const nx = dx / d;
  const ny = dy / d;

  const overlap = minD - d;
  const correction = overlap * 0.5 + 0.01;

  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;

  if (velAlongNormal > 0) return;

  const impulseMag = -(1 + PHYS.restitutionBall) * velAlongNormal / 2;
  const impulseX = impulseMag * nx;
  const impulseY = impulseMag * ny;

  a.vx -= impulseX;
  a.vy -= impulseY;
  b.vx += impulseX;
  b.vy += impulseY;

  if (STATE.firstContact == null && (a.cue || b.cue)) {
    const other = a.cue ? b : a;
    STATE.firstContact = other.number;
  }
}

function evaluateTurn() {
  if (STATE.winner != null) {
    updateHUD();
    return;
  }

  const pocketed = STATE.pocketedThisTurn.filter((n) => n !== 0);
  const playerGroup = STATE.groups[STATE.current];

  if (!playerGroup) {
    const firstScoringBall = pocketed.find((n) => isSolid(n) || isStripe(n));
    if (firstScoringBall) {
      assignGroupsFromBall(firstScoringBall);
    }
  }

  const targetGroup = STATE.groups[STATE.current];
  const firstContactGroup = groupOfBall(STATE.firstContact);

  if (targetGroup && STATE.firstContact != null && firstContactGroup && firstContactGroup !== targetGroup && STATE.firstContact !== 8) {
    STATE.foul = true;
  }

  if (targetGroup && STATE.firstContact == null) {
    STATE.foul = true;
  }

  if (targetGroup && activeBallsOfGroup(targetGroup).length > 0 && STATE.firstContact === 8) {
    STATE.foul = true;
  }

  let keepTurn = false;

  if (STATE.groups[STATE.current]) {
    keepTurn = pocketed.some((n) => groupOfBall(n) === STATE.groups[STATE.current]);
  } else {
    keepTurn = pocketed.some((n) => isSolid(n) || isStripe(n));
  }

  if (STATE.foul) {
    STATE.ballInHand = true;
    switchTurn();
  } else if (!keepTurn) {
    switchTurn();
  }

  STATE.phase = "AIM";
  STATE.shotInProgress = false;
  updateHUD();

  if (STATE.mode === "ai" && STATE.current === 1 && STATE.winner == null) {
    setTimeout(aiTakeShot, 450);
  }
}

function physicsSubstep() {
  for (const b of STATE.balls) {
    if (!b.active) continue;

    b.x += b.vx / PHYS.substeps;
    b.y += b.vy / PHYS.substeps;
  }

  for (let i = 0; i < STATE.balls.length; i++) {
    for (let j = i + 1; j < STATE.balls.length; j++) {
      resolveBallCollision(STATE.balls[i], STATE.balls[j]);
    }
  }

  for (const b of STATE.balls) {
    if (!b.active) continue;
    resolveRails(b);
  }

  const t = STATE.table;
  for (const b of STATE.balls) {
    if (!b.active) continue;
    for (const p of t.pockets) {
      if (dist(b.x, b.y, p.x, p.y) < p.r) {
        handlePocket(b);
        break;
      }
    }
  }
}

function physicsStep() {
  for (let s = 0; s < PHYS.substeps; s++) {
    physicsSubstep();
  }

  for (const b of STATE.balls) {
    if (!b.active) continue;

    b.vx *= PHYS.friction;
    b.vy *= PHYS.friction;

    if (Math.abs(b.vx) < PHYS.minSpeed) b.vx = 0;
    if (Math.abs(b.vy) < PHYS.minSpeed) b.vy = 0;
  }

  if (STATE.shotInProgress && allStopped()) {
    evaluateTurn();
  }
}

function drawBallShadow(b) {
  const r = b.r;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    b.x + r * 0.22,
    b.y + r * 0.36,
    r * 0.95,
    r * 0.62,
    0,
    0,
    Math.PI * 2
  );
  const shadowGrad = ctx.createRadialGradient(
    b.x + r * 0.18,
    b.y + r * 0.28,
    r * 0.12,
    b.x + r * 0.22,
    b.y + r * 0.36,
    r * 1.05
  );
  shadowGrad.addColorStop(0, "rgba(0,0,0,0.26)");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();
}

function drawBall(b) {
  ctx.save();

  const r = b.r;
  const color = BALL_COLORS[b.number] || "#ffffff";

  drawBallShadow(b);

  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  if (b.number === 0) {
    const cueGrad = ctx.createRadialGradient(
      b.x - r * 0.35, b.y - r * 0.4, r * 0.1,
      b.x, b.y, r
    );
    cueGrad.addColorStop(0, "#ffffff");
    cueGrad.addColorStop(1, "#dfe6ee");
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = cueGrad;
    ctx.fill();
  } else if (b.number === 8 || (b.number >= 1 && b.number <= 7)) {
    const solidGrad = ctx.createRadialGradient(
      b.x - r * 0.35, b.y - r * 0.45, r * 0.15,
      b.x, b.y, r
    );
    solidGrad.addColorStop(0, lightenColor(color, 0.32));
    solidGrad.addColorStop(0.55, color);
    solidGrad.addColorStop(1, darkenColor(color, 0.28));

    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = solidGrad;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.96, 0, Math.PI * 2);
    ctx.clip();

    const stripeGrad = ctx.createLinearGradient(b.x, b.y - r, b.x, b.y + r);
    stripeGrad.addColorStop(0, lightenColor(color, 0.25));
    stripeGrad.addColorStop(0.5, color);
    stripeGrad.addColorStop(1, darkenColor(color, 0.25));

    ctx.fillStyle = stripeGrad;
    ctx.fillRect(b.x - r * 1.2, b.y - r * 0.43, r * 2.4, r * 0.86);
    ctx.restore();
  }

  if (b.number !== 0) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.fillStyle = b.number === 8 ? "#111111" : "#222222";
    ctx.font = `bold ${Math.round(r * 0.9)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.number), b.x, b.y + r * 0.02);
  }

  const gloss = ctx.createRadialGradient(
    b.x - r * 0.42,
    b.y - r * 0.52,
    r * 0.04,
    b.x - r * 0.18,
    b.y - r * 0.16,
    r * 0.9
  );
  gloss.addColorStop(0, "rgba(255,255,255,0.95)");
  gloss.addColorStop(0.2, "rgba(255,255,255,0.38)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0.14)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");

  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.stroke();

  ctx.restore();
}

function drawWoodRails(t, rail) {
  const left = t.left - rail;
  const top = t.top - rail;
  const width = (t.right - t.left) + rail * 2;
  const height = (t.bottom - t.top) + rail * 2;

  const baseGrad = ctx.createLinearGradient(left, top, left, top + height);
  baseGrad.addColorStop(0, "#6e170f");
  baseGrad.addColorStop(0.2, "#9f2318");
  baseGrad.addColorStop(0.5, "#7c170f");
  baseGrad.addColorStop(0.8, "#a6271b");
  baseGrad.addColorStop(1, "#63120d");

  ctx.fillStyle = baseGrad;
  ctx.fillRect(left, top, width, height);

  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 36; i++) {
    const y = top + i * (height / 36);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.bezierCurveTo(
      left + width * 0.25, y + 3,
      left + width * 0.55, y - 3,
      left + width, y + 2
    );
    ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#49a7d0";
  ctx.fillRect(t.left, t.top, t.right - t.left, t.bottom - t.top);

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 1, top + 1, width - 2, height - 2);
}

function drawTable() {
  const t = STATE.table;
  const rail = TABLE.rail;

  const outerGrad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
  outerGrad.addColorStop(0, "#11213a");
  outerGrad.addColorStop(1, "#08101f");
  ctx.fillStyle = outerGrad;
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  drawWoodRails(t, rail);

  const feltGrad = ctx.createLinearGradient(0, t.top, 0, t.bottom);
  feltGrad.addColorStop(0, "#66c4eb");
  feltGrad.addColorStop(0.5, "#56b4de");
  feltGrad.addColorStop(1, "#3797c5");
  ctx.fillStyle = feltGrad;
  ctx.fillRect(t.left, t.top, t.right - t.left, t.bottom - t.top);

  const feltLight = ctx.createRadialGradient(
    (t.left + t.right) / 2,
    t.top + (t.bottom - t.top) * 0.35,
    10,
    (t.left + t.right) / 2,
    (t.top + t.bottom) / 2,
    (t.right - t.left) * 0.6
  );
  feltLight.addColorStop(0, "rgba(255,255,255,0.08)");
  feltLight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = feltLight;
  ctx.fillRect(t.left, t.top, t.right - t.left, t.bottom - t.top);

  const cushionGradTop = ctx.createLinearGradient(0, t.top - rail, 0, t.top + 8);
  cushionGradTop.addColorStop(0, "#1f2d21");
  cushionGradTop.addColorStop(1, "#111915");

  const cushionGradSide = ctx.createLinearGradient(t.left - rail, 0, t.left + 8, 0);
  cushionGradSide.addColorStop(0, "#1e2d22");
  cushionGradSide.addColorStop(1, "#111915");

  ctx.fillStyle = cushionGradTop;
  ctx.fillRect(t.left, t.top - 8, t.right - t.left, 8);
  ctx.fillRect(t.left, t.bottom, t.right - t.left, 8);

  ctx.fillStyle = cushionGradSide;
  ctx.fillRect(t.left - 8, t.top, 8, t.bottom - t.top);
  ctx.fillRect(t.right, t.top, 8, t.bottom - t.top);

  ctx.strokeStyle = "rgba(120,220,255,0.78)";
  ctx.lineWidth = 2;
  ctx.strokeRect(t.left, t.top, t.right - t.left, t.bottom - t.top);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(t.left + (t.right - t.left) * 0.24, t.top);
  ctx.lineTo(t.left + (t.right - t.left) * 0.24, t.bottom);
  ctx.stroke();

  for (const p of t.pockets) {
    const pocketGrad = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r * 1.25);
    pocketGrad.addColorStop(0, "#070707");
    pocketGrad.addColorStop(0.55, "#000000");
    pocketGrad.addColorStop(1, "rgba(0,0,0,0.7)");

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = pocketGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCueStick() {
  if (STATE.phase !== "AIM" || STATE.ballInHand || STATE.winner != null) return;
  const isHumanTurn = !(STATE.mode === "ai" && STATE.current === 1);
  if (!isHumanTurn || !INPUT.down) return;

  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = cue.x - INPUT.aimX;
  const dy = cue.y - INPUT.aimY;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;

  // unit vector from cue ball toward drag point (back of the shot)
  const backX = -dx / len;
  const backY = -dy / len;

  const offsetFromBall = clamp(len, 12, 70);
  const stickLength = 150;

  const startX = cue.x + backX * (cue.r + offsetFromBall);
  const startY = cue.y + backY * (cue.r + offsetFromBall);
  const endX = startX + backX * stickLength;
  const endY = startY + backY * stickLength;

  ctx.save();
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.lineWidth = 8;
  const wood = ctx.createLinearGradient(startX, startY, endX, endY);
  wood.addColorStop(0, "#f2d19a");
  wood.addColorStop(0.55, "#c28b4e");
  wood.addColorStop(1, "#7a4c22");
  ctx.strokeStyle = wood;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + backX * 18, startY + backY * 18);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#dfe8f0";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX + backX * 18, startY + backY * 18);
  ctx.lineTo(startX + backX * 26, startY + backY * 26);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2f77b8";
  ctx.stroke();

  ctx.restore();
}

function drawAimGuide() {
  if (STATE.phase !== "AIM" || STATE.ballInHand || STATE.winner != null) return;
  const isHumanTurn = !(STATE.mode === "ai" && STATE.current === 1);
  if (!isHumanTurn || !INPUT.down) return;

  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = cue.x - INPUT.aimX;
  const dy = cue.y - INPUT.aimY;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;

  // unit vector in actual shot direction
  const shotX = dx / len;
  const shotY = dy / len;

  const guideLen = 170;
  const startX = cue.x + shotX * (cue.r + 4);
  const startY = cue.y + shotY * (cue.r + 4);
  const endX = cue.x + shotX * guideLen;
  const endY = cue.y + shotY * guideLen;

  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.68)";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cue.x + shotX * 28, cue.y + shotY * 28, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.restore();
}

function drawPowerMeter() {
  if (STATE.phase !== "AIM" || STATE.ballInHand || STATE.winner != null) return;
  const isHumanTurn = !(STATE.mode === "ai" && STATE.current === 1);
  if (!isHumanTurn || !INPUT.down) return;

  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const len = Math.hypot(cue.x - INPUT.aimX, cue.y - INPUT.aimY);
  const power = powerFromDrag(len);
  const pct = (power - PHYS.minPower) / (PHYS.maxPower - PHYS.minPower);

  const barW = 120;
  const barH = 10;
  const x = 18;
  const y = canvas.clientHeight - 24;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y, barW, barH);

  const fill = ctx.createLinearGradient(x, y, x + barW, y);
  fill.addColorStop(0, "#63d7ff");
  fill.addColorStop(0.65, "#ffd166");
  fill.addColorStop(1, "#ff6b6b");
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, barW * pct, barH);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Power", x, y - 4);
  ctx.restore();
}

function drawWinnerOverlay() {
  if (STATE.winner == null) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.fillStyle = "white";
  ctx.font = `${Math.round(canvas.clientHeight * 0.08)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${winnerName()} wins!`, canvas.clientWidth / 2, canvas.clientHeight / 2);
  ctx.restore();
}

function drawBallInHandGhost() {
  if (!STATE.ballInHand || !INPUT.down) return;
  const cue = getCueBall();
  if (!cue) return;

  const t = STATE.table;
  const x = clamp(INPUT.aimX, t.left + cue.r + 2, t.right - cue.r - 2);
  const y = clamp(INPUT.aimY, t.top + cue.r + 2, t.bottom - cue.r - 2);

  ctx.save();
  ctx.globalAlpha = canPlaceCueBall(x, y) ? 0.65 : 0.25;
  ctx.beginPath();
  ctx.arc(x, y, cue.r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  drawTable();

  for (const b of STATE.balls) {
    if (!b.active) continue;
    drawBall(b);
  }

  drawBallInHandGhost();
  drawAimGuide();
  drawCueStick();
  drawPowerMeter();
  drawWinnerOverlay();
}

function loop() {
  physicsStep();
  draw();
  requestAnimationFrame(loop);
}

function getCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function onPointerDown(evt) {
  if (STATE.winner != null) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  const p = getCanvasPoint(evt);
  INPUT.down = true;
  INPUT.aimX = p.x;
  INPUT.aimY = p.y;

  const cue = getCueBall();
  if (cue) {
    INPUT.dragDist = dist(cue.x, cue.y, p.x, p.y);
  }
}

function onPointerMove(evt) {
  if (!INPUT.down) return;
  const p = getCanvasPoint(evt);
  INPUT.aimX = p.x;
  INPUT.aimY = p.y;

  const cue = getCueBall();
  if (cue) {
    INPUT.dragDist = dist(cue.x, cue.y, p.x, p.y);
  }
}

function onPointerUp(evt) {
  if (!INPUT.down) return;

  const p = getCanvasPoint(evt);
  INPUT.aimX = p.x;
  INPUT.aimY = p.y;
  INPUT.down = false;

  if (STATE.winner != null) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  if (STATE.ballInHand) {
    placeCueBall(p.x, p.y);
    return;
  }

  shootTowards(p.x, p.y);
}

function aiTakeShot() {
  if (STATE.mode !== "ai" || STATE.current !== 1 || STATE.phase !== "AIM" || STATE.winner != null) return;

  const cue = getCueBall();
  if (!cue) return;

  if (STATE.ballInHand) {
    const t = STATE.table;
    let placed = false;

    for (let tries = 0; tries < 200 && !placed; tries++) {
      const x = t.left + (t.right - t.left) * (0.15 + Math.random() * 0.25);
      const y = t.top + (t.bottom - t.top) * (0.1 + Math.random() * 0.8);
      placed = placeCueBall(x, y);
    }

    if (!placed) {
      placeCueBall(t.left + (t.right - t.left) * 0.2, (t.top + t.bottom) / 2);
    }
  }

  const targetGroup = STATE.groups[1];
  let candidates = STATE.balls.filter((b) => {
    if (!b.active || b.cue) return false;
    if (!targetGroup) return b.number !== 8;
    if (activeBallsOfGroup(targetGroup).length === 0) return b.number === 8;
    return groupOfBall(b.number) === targetGroup;
  });

  if (!candidates.length) {
    candidates = STATE.balls.filter((b) => b.active && !b.cue && b.number !== 8);
  }
  if (!candidates.length) {
    candidates = STATE.balls.filter((b) => b.active && !b.cue);
  }

  const target = rand(candidates);

  const difficultyScale = {
    easy: 0.78,
    medium: 0.9,
    hard: 0.98
  }[STATE.aiLevel] || 0.9;

  const jitter = {
    easy: 34,
    medium: 18,
    hard: 8
  }[STATE.aiLevel] || 18;

  const tx = target.x + (Math.random() * 2 - 1) * jitter;
  const ty = target.y + (Math.random() * 2 - 1) * jitter;

  shootTowards(tx, ty, difficultyScale);
}

function clampColor(n) {
  return Math.max(0, Math.min(255, n));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;

  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((v) => clampColor(Math.round(v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

function darkenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r * (1 - amount),
    g * (1 - amount),
    b * (1 - amount)
  );
}

if (ui.mode) {
  ui.mode.addEventListener("change", () => {
    STATE.mode = ui.mode.value === "local" ? "local" : "ai";
    newGame();
  });
}

if (ui.ai) {
  ui.ai.addEventListener("change", () => {
    STATE.aiLevel = ui.ai.value || "medium";
  });
}

if (ui.newGame) {
  ui.newGame.addEventListener("click", newGame);
}

canvas.addEventListener("mousedown", onPointerDown);
canvas.addEventListener("mousemove", onPointerMove);
canvas.addEventListener("mouseup", onPointerUp);
canvas.addEventListener("mouseleave", () => {
  INPUT.down = false;
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  onPointerDown(e);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  onPointerMove(e);
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const fake = {
    clientX: INPUT.aimX + canvas.getBoundingClientRect().left,
    clientY: INPUT.aimY + canvas.getBoundingClientRect().top
  };
  onPointerUp(fake);
}, { passive: false });

window.addEventListener("resize", resize);

STATE.mode = ui.mode?.value === "local" ? "local" : "ai";
STATE.aiLevel = ui.ai?.value || "medium";

resize();
updateHUD();
requestAnimationFrame(loop);
