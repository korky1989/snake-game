const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const ui = {
  mode: document.getElementById("mode"),
  difficulty: document.getElementById("difficulty"),
  newGame: document.getElementById("newGame"),
  status: document.getElementById("status"),
  p1Group: document.getElementById("p1group"),
  p2Group: document.getElementById("p2group"),
  p2Label: document.getElementById("p2label"),
  turn: document.getElementById("turn"),
  bih: document.getElementById("bih"),
};

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

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
  15: "#7a1f1f",
};

const PHYS = {
  friction: 0.985,
  minSpeed: 0.055,
  restitutionRail: 0.94,
  restitutionBall: 0.985,
  maxPower: 15.5,
  minPower: 0.85,
  substeps: 2,
};

const TABLE = {
  rail: 34,
  cushionInset: 18,
  pocketR: 23,
  cornerPocketR: 25,
  middlePocketR: 22,
};

const STATE = {
  mode: "ai",
  aiLevel: "medium",
  balls: [],
  current: 0,
  groups: [null, null],
  ballInHand: false,
  winner: null,
  phase: "AIM",
  shotInProgress: false,
  firstContact: null,
  railAfterContact: false,
  pocketedThisTurn: [],
  foul: false,
  pendingSwitch: false,
  table: null,
};

const INPUT = {
  down: false,
  placingCue: false,
  aimX: 0,
  aimY: 0,
  power: 0,
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

function otherPlayer(i) {
  return i === 0 ? 1 : 0;
}

function currentPlayerName() {
  return STATE.current === 0 ? "Player 1" : (STATE.mode === "ai" ? "AI" : "Player 2");
}

function winnerName() {
  return STATE.winner === 0 ? "Player 1" : (STATE.mode === "ai" ? "AI" : "Player 2");
}

function makeBall(number, x, y, cue = false) {
  return {
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    r: STATE.table.ballR,
    active: true,
    cue,
    sunk: false,
  };
}

function getCueBall() {
  return STATE.balls.find((b) => b.cue);
}

function anyBallMoving() {
  return STATE.balls.some((b) => b.active && (Math.abs(b.vx) > PHYS.minSpeed || Math.abs(b.vy) > PHYS.minSpeed));
}

function ballsOfGroupRemaining(group) {
  if (!group) return 7;
  return STATE.balls.filter((b) => {
    if (!b.active || b.cue || b.number === 8) return false;
    return groupOfBall(b.number) === group;
  }).length;
}

function playerOnEight(playerIndex) {
  const g = STATE.groups[playerIndex];
  if (!g) return false;
  return ballsOfGroupRemaining(g) === 0;
}

function setStatus(message) {
  ui.status.textContent = message;
}

function groupMarkup(group) {
  if (group === "solids") {
    return `<span class="group-ball solid-1" data-num="1" aria-label="Solids"></span>`;
  }
  if (group === "stripes") {
    return `<span class="group-ball stripe-9" data-num="9" aria-label="Stripes"></span>`;
  }
  return "—";
}

function updateHUD() {
  ui.p2Label.textContent = STATE.mode === "ai" ? "AI" : "Player 2";

  ui.p1Group.innerHTML = groupMarkup(STATE.groups[0]);
  ui.p2Group.innerHTML = groupMarkup(STATE.groups[1]);

  ui.p1Group.className = `group-display ${STATE.groups[0] ? "" : "group-empty"}`.trim();
  ui.p2Group.className = `group-display ${STATE.groups[1] ? "" : "group-empty"}`.trim();

  ui.turn.textContent = STATE.winner != null ? `${winnerName()} wins` : currentPlayerName();
  ui.bih.textContent = STATE.ballInHand ? "yes" : "no";

  if (STATE.winner != null) {
    setStatus(`${winnerName()} wins! Tap New Game to play again.`);
    return;
  }

  if (STATE.ballInHand) {
    setStatus(`${currentPlayerName()} has ball-in-hand. Drag the cue ball to place it.`);
    return;
  }

  if (STATE.phase === "AIM") {
    setStatus(`${currentPlayerName()} to shoot.`);
    return;
  }

  if (STATE.phase === "AI") {
    setStatus("AI is lining up a shot…");
  }
}

function resize() {
  const cssWidth = Math.min(window.innerWidth * 0.96, 1040);
  const cssHeight = Math.min(cssWidth * 0.55, window.innerHeight * 0.72);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * DPR);
  canvas.height = Math.round(cssHeight * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const w = cssWidth;
  const h = cssHeight;
  const rail = clamp(w * 0.035, 26, 38);
  const ballR = clamp(w * 0.0108, 8.5, 12.2);
  const cushion = clamp(rail * 0.54, 14, 22);

  const left = rail + 26;
  const right = w - rail - 26;
  const top = rail + 24;
  const bottom = h - rail - 24;

  const pockets = [
    { x: left, y: top, r: clamp(ballR * 2.15, 18, 26), corner: true },
    { x: (left + right) * 0.5, y: top, r: clamp(ballR * 1.95, 16, 24), corner: false },
    { x: right, y: top, r: clamp(ballR * 2.15, 18, 26), corner: true },
    { x: left, y: bottom, r: clamp(ballR * 2.15, 18, 26), corner: true },
    { x: (left + right) * 0.5, y: bottom, r: clamp(ballR * 1.95, 16, 24), corner: false },
    { x: right, y: bottom, r: clamp(ballR * 2.15, 18, 26), corner: true },
  ];

  STATE.table = {
    w,
    h,
    rail,
    ballR,
    cushion,
    left,
    right,
    top,
    bottom,
    pockets,
    headX: left + (right - left) * 0.25,
    footX: left + (right - left) * 0.75,
    centerY: (top + bottom) * 0.5,
  };

  for (const ball of STATE.balls) {
    ball.r = STATE.table.ballR;
  }

  if (!STATE.balls.length) {
    newGame();
  }
}

function rackBalls() {
  const t = STATE.table;
  const cueX = t.left + (t.right - t.left) * 0.25;
  const cueY = t.centerY;

  const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  const rack = [];

  const apex = { x: t.footX, y: t.centerY };
  const rowGap = t.ballR * 2 * Math.cos(Math.PI / 6);
  const colGap = t.ballR * 2 + 0.3;

  const positions = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      positions.push({
        x: apex.x + row * rowGap,
        y: apex.y - row * t.ballR + col * colGap,
      });
    }
  }

  const apexIndex = 0;
  const centerIndex = 4 + 1 + 2;
  const backLeftIndex = 10;
  const backRightIndex = 14;

  const solids = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);

  const rackNumbers = new Array(15).fill(null);
  rackNumbers[apexIndex] = 1;
  rackNumbers[centerIndex] = 8;

  rackNumbers[backLeftIndex] = solids.pop();
  rackNumbers[backRightIndex] = stripes.pop();

  const remaining = shuffle([...solids, ...stripes]);
  let idx = 0;
  for (let i = 0; i < rackNumbers.length; i += 1) {
    if (rackNumbers[i] == null) {
      rackNumbers[i] = remaining[idx];
      idx += 1;
    }
  }

  STATE.balls = [makeBall(0, cueX, cueY, true)];
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i];
    const n = rackNumbers[i];
    rack.push(makeBall(n, p.x, p.y, false));
  }
  STATE.balls.push(...rack);
}

function screenToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top),
  };
}

function isLegalCuePlacement(x, y) {
  const cue = getCueBall();
  if (!cue) return false;
  const t = STATE.table;

  if (x < t.left + cue.r || x > t.right - cue.r || y < t.top + cue.r || y > t.bottom - cue.r) {
    return false;
  }

  for (const p of t.pockets) {
    if (dist(x, y, p.x, p.y) < p.r - cue.r * 0.1) {
      return false;
    }
  }

  for (const ball of STATE.balls) {
    if (!ball.active || ball.cue) continue;
    if (dist(x, y, ball.x, ball.y) < cue.r * 2.02) {
      return false;
    }
  }

  return true;
}

function updateCuePlacementFromPointer(p) {
  const cue = getCueBall();
  if (!cue) return;

  const x = clamp(p.x, STATE.table.left + cue.r, STATE.table.right - cue.r);
  const y = clamp(p.y, STATE.table.top + cue.r, STATE.table.bottom - cue.r);

  if (isLegalCuePlacement(x, y)) {
    cue.x = x;
    cue.y = y;
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (STATE.winner != null) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  const p = screenToCanvas(e);
  INPUT.down = true;
  INPUT.aimX = p.x;
  INPUT.aimY = p.y;

  canvas.setPointerCapture?.(e.pointerId);

  if (STATE.ballInHand) {
    INPUT.placingCue = true;
    updateCuePlacementFromPointer(p);
  } else {
    INPUT.placingCue = false;
    updateAimFromPointer(p);
  }
});

canvas.addEventListener("pointermove", (e) => {
  const p = screenToCanvas(e);

  if (!INPUT.down) {
    if (STATE.phase === "AIM" && !STATE.ballInHand && !(STATE.mode === "ai" && STATE.current === 1)) {
      updateAimFromPointer(p);
    }
    return;
  }

  if (INPUT.placingCue) {
    updateCuePlacementFromPointer(p);
    return;
  }

  updateAimFromPointer(p);
});

canvas.addEventListener("pointerup", () => {
  if (!INPUT.down) return;
  INPUT.down = false;

  if (STATE.winner != null) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  if (INPUT.placingCue) {
    INPUT.placingCue = false;
    STATE.ballInHand = false;
    updateHUD();
    return;
  }

  takePlayerShot();
});

canvas.addEventListener("pointercancel", () => {
  INPUT.down = false;
  INPUT.placingCue = false;
});

function updateAimFromPointer(p) {
  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = p.x - cue.x;
  const dy = p.y - cue.y;
  const len = Math.hypot(dx, dy);

  if (len < 0.001) return;

  INPUT.aimX = p.x;
  INPUT.aimY = p.y;
  INPUT.power = clamp(len / (cue.r * 8), 0, 1);
}

function takePlayerShot() {
  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = INPUT.aimX - cue.x;
  const dy = INPUT.aimY - cue.y;
  const len = Math.hypot(dx, dy);
  if (len < cue.r * 0.6) return;

  const dirX = dx / len;
  const dirY = dy / len;
  const impulse = PHYS.minPower + INPUT.power * (PHYS.maxPower - PHYS.minPower);

  cue.vx += dirX * impulse;
  cue.vy += dirY * impulse;
  beginShot();
}

function beginShot() {
  STATE.phase = "ROLL";
  STATE.shotInProgress = true;
  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisTurn = [];
  STATE.foul = false;
  STATE.pendingSwitch = true;
  INPUT.power = 0;
}

function resolveBallCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (d <= 0 || d >= minD) return;

  const nx = dx / d;
  const ny = dy / d;
  const overlap = minD - d;

  const push = overlap * 0.5 + 0.001;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const speedAlongNormal = rvx * nx + rvy * ny;

  if (speedAlongNormal > 0) return;

  const j = -(1 + PHYS.restitutionBall) * speedAlongNormal / 2;
  const ix = nx * j;
  const iy = ny * j;

  a.vx -= ix;
  a.vy -= iy;
  b.vx += ix;
  b.vy += iy;

  const tangentX = -ny;
  const tangentY = nx;
  const relTan = rvx * tangentX + rvy * tangentY;
  const frictionImpulse = relTan * 0.018;

  a.vx += tangentX * frictionImpulse;
  a.vy += tangentY * frictionImpulse;
  b.vx -= tangentX * frictionImpulse;
  b.vy -= tangentY * frictionImpulse;

  const cue = getCueBall();
  if (cue && STATE.firstContact == null) {
    if (a === cue && !b.cue) STATE.firstContact = b.number;
    if (b === cue && !a.cue) STATE.firstContact = a.number;
  }
}

function handleRailCollision(ball) {
  const t = STATE.table;
  let touched = false;

  if (ball.x - ball.r < t.left) {
    ball.x = t.left + ball.r;
    ball.vx = Math.abs(ball.vx) * PHYS.restitutionRail;
    touched = true;
  } else if (ball.x + ball.r > t.right) {
    ball.x = t.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * PHYS.restitutionRail;
    touched = true;
  }

  if (ball.y - ball.r < t.top) {
    ball.y = t.top + ball.r;
    ball.vy = Math.abs(ball.vy) * PHYS.restitutionRail;
    touched = true;
  } else if (ball.y + ball.r > t.bottom) {
    ball.y = t.bottom - ball.r;
    ball.vy = -Math.abs(ball.vy) * PHYS.restitutionRail;
    touched = true;
  }

  if (touched && STATE.firstContact != null) {
    STATE.railAfterContact = true;
  }
}

function handlePocket(ball) {
  if (!ball.active) return;

  for (const pocket of STATE.table.pockets) {
    const fallDist = pocket.r - 2;
    if (dist(ball.x, ball.y, pocket.x, pocket.y) < fallDist) {
      ball.active = false;
      ball.sunk = true;
      ball.vx = 0;
      ball.vy = 0;
      ball.x = pocket.x;
      ball.y = pocket.y;
      STATE.pocketedThisTurn.push(ball.number);
      return;
    }
  }
}

function stepPhysics() {
  const stepScale = 1 / PHYS.substeps;

  for (let s = 0; s < PHYS.substeps; s += 1) {
    for (const ball of STATE.balls) {
      if (!ball.active) continue;

      ball.x += ball.vx * stepScale;
      ball.y += ball.vy * stepScale;

      ball.vx *= PHYS.friction;
      ball.vy *= PHYS.friction;

      if (Math.hypot(ball.vx, ball.vy) < PHYS.minSpeed) {
        ball.vx = 0;
        ball.vy = 0;
      }

      handleRailCollision(ball);
      handlePocket(ball);
    }

    for (let i = 0; i < STATE.balls.length; i += 1) {
      const a = STATE.balls[i];
      if (!a.active) continue;

      for (let j = i + 1; j < STATE.balls.length; j += 1) {
        const b = STATE.balls[j];
        if (!b.active) continue;
        resolveBallCollision(a, b);
      }
    }
  }
}

function assignGroupsFromPocketed() {
  if (STATE.groups[0] || STATE.groups[1]) return;

  const firstObject = STATE.pocketedThisTurn.find((n) => n >= 1 && n <= 15 && n !== 8);
  if (!firstObject) return;

  const g = groupOfBall(firstObject);
  if (!g) return;

  STATE.groups[STATE.current] = g;
  STATE.groups[otherPlayer(STATE.current)] = g === "solids" ? "stripes" : "solids";
}

function evaluateShot() {
  const pocketed = STATE.pocketedThisTurn.slice();
  const cueSunk = pocketed.includes(0);
  const eightSunk = pocketed.includes(8);
  const player = STATE.current;
  const opponent = otherPlayer(player);
  const playerGroup = STATE.groups[player];
  const onEight = playerOnEight(player);

  assignGroupsFromPocketed();

  const updatedPlayerGroup = STATE.groups[player];
  const legalTargets = updatedPlayerGroup
    ? updatedPlayerGroup === "solids"
      ? "solids"
      : "stripes"
    : null;

  if (cueSunk) {
    STATE.foul = true;
  }

  if (eightSunk) {
    if (onEight && !cueSunk && STATE.firstContact === 8) {
      STATE.winner = player;
    } else {
      STATE.winner = opponent;
    }
    updateHUD();
    return;
  }

  if (STATE.firstContact == null) {
    STATE.foul = true;
  } else if (updatedPlayerGroup) {
    if (onEight) {
      if (STATE.firstContact !== 8) STATE.foul = true;
    } else if (groupOfBall(STATE.firstContact) !== legalTargets) {
      STATE.foul = true;
    }
  }

  const objectPocketed = pocketed.filter((n) => n > 0 && n !== 8);
  const legalPocket = objectPocketed.some((n) => {
    if (!updatedPlayerGroup) return n !== 8;
    if (onEight) return n === 8;
    return groupOfBall(n) === updatedPlayerGroup;
  });

  if (!cueSunk && !legalPocket && STATE.firstContact != null && !STATE.railAfterContact && objectPocketed.length === 0) {
    STATE.foul = true;
  }

  if (cueSunk) {
    const cue = getCueBall();
    cue.active = true;
    cue.sunk = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = STATE.table.headX;
    cue.y = STATE.table.centerY;
    STATE.ballInHand = true;
  }

  if (STATE.foul) {
    STATE.current = opponent;
    STATE.ballInHand = true;
  } else {
    const keepsTurn = objectPocketed.some((n) => {
      if (!updatedPlayerGroup) return n !== 8;
      return groupOfBall(n) === updatedPlayerGroup;
    });

    if (!keepsTurn) {
      STATE.current = opponent;
    }
  }

  STATE.phase = "AIM";
  STATE.shotInProgress = false;
  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisTurn = [];
  updateHUD();

  if (STATE.mode === "ai" && STATE.current === 1 && STATE.winner == null) {
    STATE.phase = "AI";
    setTimeout(aiTakeTurn, 520);
  }
}

function getLegalTargetBalls(playerIndex) {
  const group = STATE.groups[playerIndex];
  const onEight = playerOnEight(playerIndex);

  return STATE.balls.filter((b) => {
    if (!b.active || b.cue) return false;
    if (onEight) return b.number === 8;
    if (!group) return b.number !== 8;
    if (b.number === 8) return false;
    return groupOfBall(b.number) === group;
  });
}

function pickNearestLegalTargetBall(playerIndex) {
  const cue = getCueBall();
  if (!cue) return null;

  const legal = getLegalTargetBalls(playerIndex);
  let best = null;
  let bestScore = Infinity;

  for (const b of legal) {
    const d = dist(cue.x, cue.y, b.x, b.y);
    if (d < bestScore) {
      bestScore = d;
      best = b;
    }
  }

  return best;
}

function aiTakeTurn() {
  if (STATE.winner != null) return;
  if (STATE.mode !== "ai" || STATE.current !== 1) return;

  if (STATE.ballInHand) {
    const cue = getCueBall();
    const legal = pickNearestLegalTargetBall(1);
    cue.x = STATE.table.headX;
    cue.y = STATE.table.centerY;

    if (legal) {
      const desiredY = clamp(legal.y, STATE.table.top + cue.r, STATE.table.bottom - cue.r);
      if (isLegalCuePlacement(cue.x, desiredY)) {
        cue.y = desiredY;
      }
    }
    STATE.ballInHand = false;
  }

  const cue = getCueBall();
  const target = pickNearestLegalTargetBall(1);

  if (!cue || !target) {
    const ang = Math.random() * Math.PI * 2;
    cue.vx = Math.cos(ang) * 8;
    cue.vy = Math.sin(ang) * 8;
    beginShot();
    updateHUD();
    return;
  }

  let dx = target.x - cue.x;
  let dy = target.y - cue.y;
  const baseAng = Math.atan2(dy, dx);

  const jitter =
    STATE.aiLevel === "easy" ? 0.16 :
    STATE.aiLevel === "medium" ? 0.08 : 0.03;

  const power =
    STATE.aiLevel === "easy" ? 8.5 :
    STATE.aiLevel === "medium" ? 11.5 : 13.2;

  const ang = baseAng + (Math.random() * 2 - 1) * jitter;
  cue.vx = Math.cos(ang) * power;
  cue.vy = Math.sin(ang) * power;
  beginShot();
  updateHUD();
}

function drawTable() {
  const t = STATE.table;
  const outerX = t.left - t.rail;
  const outerY = t.top - t.rail;
  const outerW = (t.right - t.left) + t.rail * 2;
  const outerH = (t.bottom - t.top) + t.rail * 2;

  ctx.save();

  const wood = ctx.createLinearGradient(outerX, outerY, outerX, outerY + outerH);
  wood.addColorStop(0, "#8a5726");
  wood.addColorStop(0.2, "#a86c34");
  wood.addColorStop(0.5, "#6b3f16");
  wood.addColorStop(0.8, "#8d5828");
  wood.addColorStop(1, "#4f2c10");

  roundRect(ctx, outerX, outerY, outerW, outerH, t.rail * 0.85);
  ctx.fillStyle = wood;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 8; i += 1) {
    const y = outerY + (outerH / 8) * i;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(outerX, y, outerW, outerH / 16);
  }
  ctx.restore();

  roundRect(ctx, t.left - t.cushion, t.top - t.cushion, (t.right - t.left) + t.cushion * 2, (t.bottom - t.top) + t.cushion * 2, t.cushion * 0.7);
  ctx.fillStyle = "#40230d";
  ctx.fill();

  const felt = ctx.createRadialGradient(
    (t.left + t.right) * 0.5,
    (t.top + t.bottom) * 0.48,
    t.ballR * 2,
    (t.left + t.right) * 0.5,
    (t.top + t.bottom) * 0.48,
    (t.right - t.left) * 0.7
  );
  felt.addColorStop(0, "#1780d9");
  felt.addColorStop(0.45, "#0d66ba");
  felt.addColorStop(0.75, "#0a4d93");
  felt.addColorStop(1, "#083863");

  roundRect(ctx, t.left, t.top, t.right - t.left, t.bottom - t.top, 18);
  ctx.fillStyle = felt;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.22;
  const sheen = ctx.createLinearGradient(t.left, t.top, t.right, t.bottom);
  sheen.addColorStop(0, "rgba(255,255,255,0.18)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.02)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, t.left, t.top, t.right - t.left, t.bottom - t.top, 18);
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(t.left + (t.right - t.left) * 0.24, t.top + 12);
  ctx.lineTo(t.left + (t.right - t.left) * 0.24, t.bottom - 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(t.left + (t.right - t.left) * 0.24, t.centerY, t.ballR * 3.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  for (const p of t.pockets) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    const pocketGrad = ctx.createRadialGradient(p.x - 4, p.y - 4, 3, p.x, p.y, p.r + 2);
    pocketGrad.addColorStop(0, "#262626");
    pocketGrad.addColorStop(0.55, "#0c0c0c");
    pocketGrad.addColorStop(1, "#000000");
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = pocketGrad;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawBall(ball) {
  if (!ball.active) return;

  ctx.save();

  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + ball.r * 0.68, ball.r * 0.9, ball.r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fill();

  const baseColor = ball.cue ? "#f8fbff" : BALL_COLORS[ball.number];
  const grad = ctx.createRadialGradient(
    ball.x - ball.r * 0.35,
    ball.y - ball.r * 0.42,
    ball.r * 0.2,
    ball.x,
    ball.y,
    ball.r
  );

  if (ball.cue) {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.5, "#f4f9ff");
    grad.addColorStop(1, "#d8e4f2");
  } else {
    grad.addColorStop(0, lighten(baseColor, 0.28));
    grad.addColorStop(0.58, baseColor);
    grad.addColorStop(1, darken(baseColor, 0.26));
  }

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  if (!ball.cue && ball.number >= 9) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.98, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ball.x - ball.r, ball.y - ball.r * 0.42, ball.r * 2, ball.r * 0.84);
    ctx.restore();
  }

  if (!ball.cue) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.fillStyle = ball.number === 8 ? "#ffffff" : "#15191f";
    ctx.font = `700 ${Math.max(9, ball.r * 0.95)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(ball.number), ball.x, ball.y + 0.35);
  }

  ctx.beginPath();
  ctx.arc(ball.x - ball.r * 0.28, ball.y - ball.r * 0.42, ball.r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.46)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawAimAid() {
  if (STATE.phase !== "AIM" || STATE.ballInHand) return;
  if (STATE.mode === "ai" && STATE.current === 1) return;

  const cue = getCueBall();
  if (!cue || !cue.active) return;

  let dx = INPUT.aimX - cue.x;
  let dy = INPUT.aimY - cue.y;
  let len = Math.hypot(dx, dy);

  if (len < cue.r * 0.8) {
    dx = 1;
    dy = 0;
    len = 1;
  }

  const dirX = dx / len;
  const dirY = dy / len;

  const lineLen = clamp((STATE.table.right - STATE.table.left) * 0.5, 180, 360);
  const startDist = cue.r * 1.5;
  const endX = cue.x + dirX * lineLen;
  const endY = cue.y + dirY * lineLen;

  ctx.save();
  ctx.setLineDash([4, 8]);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.moveTo(cue.x + dirX * startDist, cue.y + dirY * startDist);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();

  drawCueStick(cue, dirX, dirY, INPUT.power);
  drawPowerMeter(INPUT.power);
}

function drawCueStick(cue, dirX, dirY, power) {
  const stickLength = clamp(STATE.table.ballR * 18, 150, 240);
  const backOffset = cue.r + 10 + power * cue.r * 4.2;
  const frontX = cue.x - dirX * backOffset;
  const frontY = cue.y - dirY * backOffset;
  const backX = frontX - dirX * stickLength;
  const backY = frontY - dirY * stickLength;

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = STATE.table.ballR * 0.9;
  ctx.beginPath();
  ctx.moveTo(backX + 3, backY + 3);
  ctx.lineTo(frontX + 3, frontY + 3);
  ctx.stroke();

  const cueGrad = ctx.createLinearGradient(backX, backY, frontX, frontY);
  cueGrad.addColorStop(0, "#6c3f17");
  cueGrad.addColorStop(0.18, "#8b5523");
  cueGrad.addColorStop(0.72, "#ddb779");
  cueGrad.addColorStop(0.9, "#f6e2bb");
  cueGrad.addColorStop(1, "#f2f0ea");

  ctx.strokeStyle = cueGrad;
  ctx.lineWidth = STATE.table.ballR * 0.72;
  ctx.beginPath();
  ctx.moveTo(backX, backY);
  ctx.lineTo(frontX, frontY);
  ctx.stroke();

  ctx.strokeStyle = "#2f5fa5";
  ctx.lineWidth = STATE.table.ballR * 0.2;
  ctx.beginPath();
  ctx.moveTo(backX + dirX * stickLength * 0.12, backY + dirY * stickLength * 0.12);
  ctx.lineTo(backX + dirX * stickLength * 0.23, backY + dirY * stickLength * 0.23);
  ctx.stroke();

  ctx.restore();
}

function drawPowerMeter(power) {
  const t = STATE.table;
  const meterW = clamp((t.right - t.left) * 0.25, 120, 220);
  const meterH = 10;
  const x = t.left + 10;
  const y = t.bottom + t.rail * 0.35;

  ctx.save();
  roundRect(ctx, x, y, meterW, meterH, meterH / 2);
  ctx.fillStyle = "rgba(8, 14, 24, 0.45)";
  ctx.fill();

  roundRect(ctx, x + 1, y + 1, Math.max(0, (meterW - 2) * power), meterH - 2, meterH / 2);
  const grad = ctx.createLinearGradient(x, y, x + meterW, y);
  grad.addColorStop(0, "#4ec3ff");
  grad.addColorStop(0.55, "#4fdc95");
  grad.addColorStop(1, "#ffd25c");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, STATE.table.w, STATE.table.h);
  drawTable();

  for (const ball of STATE.balls) {
    drawBall(ball);
  }

  drawAimAid();
}

function tick() {
  if (STATE.phase === "ROLL") {
    stepPhysics();

    if (!anyBallMoving()) {
      evaluateShot();
    }
  }

  draw();
  requestAnimationFrame(tick);
}

function roundRect(context, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  context.beginPath();
  context.moveTo(x + rr, y);
  context.arcTo(x + w, y, x + w, y + h, rr);
  context.arcTo(x + w, y + h, x, y + h, rr);
  context.arcTo(x, y + h, x, y, rr);
  context.arcTo(x, y, x + w, y, rr);
  context.closePath();
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r * (1 - amount),
    g * (1 - amount),
    b * (1 - amount)
  );
}

function newGame() {
  if (!STATE.table) resize();

  STATE.mode = ui.mode.value;
  STATE.aiLevel = ui.difficulty.value;
  STATE.current = 0;
  STATE.groups = [null, null];
  STATE.ballInHand = false;
  STATE.winner = null;
  STATE.phase = "AIM";
  STATE.shotInProgress = false;
  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisTurn = [];
  STATE.foul = false;
  INPUT.down = false;
  INPUT.placingCue = false;
  INPUT.power = 0;

  rackBalls();

  const cue = getCueBall();
  INPUT.aimX = cue.x + 140;
  INPUT.aimY = cue.y;

  updateHUD();
}

ui.newGame.addEventListener("click", newGame);

ui.mode.addEventListener("change", () => {
  newGame();
});

ui.difficulty.addEventListener("change", () => {
  STATE.aiLevel = ui.difficulty.value;
  updateHUD();
});

window.addEventListener("resize", resize);

resize();
newGame();
requestAnimationFrame(tick);
