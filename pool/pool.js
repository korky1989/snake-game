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
  aimDirX: 1,
  aimDirY: 0,
  lockedAim: false,
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
  INPUT.lockedAim = false;

  canvas.setPointerCapture?.(e.pointerId);

  if (STATE.ballInHand) {
    INPUT.placingCue = true;
    updateCuePlacementFromPointer(p);
  } else {
    INPUT.placingCue = false;
    INPUT.lockedAim = true;
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
    INPUT.lockedAim = false;
    STATE.ballInHand = false;
    updateHUD();
    return;
  }

  takePlayerShot();
  INPUT.lockedAim = false;
});

canvas.addEventListener("pointercancel", () => {
  INPUT.down = false;
  INPUT.placingCue = false;
  INPUT.lockedAim = false;
});

function updateAimFromPointer(p) {
  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const dx = p.x - cue.x;
  const dy = p.y - cue.y;
  const len = Math.hypot(dx, dy);

  if (len < 0.001) {
    INPUT.aimX = cue.x + INPUT.aimDirX * cue.r * 6;
    INPUT.aimY = cue.y + INPUT.aimDirY * cue.r * 6;
    if (!INPUT.lockedAim) {
      INPUT.power = 0;
    }
    return;
  }

  if (!INPUT.lockedAim) {
    INPUT.aimDirX = dx / len;
    INPUT.aimDirY = dy / len;
    INPUT.aimX = p.x;
    INPUT.aimY = p.y;
    INPUT.power = 0;
    return;
  }

  INPUT.aimX = cue.x + INPUT.aimDirX * cue.r * 6;
  INPUT.aimY = cue.y + INPUT.aimDirY * cue.r * 6;

  const pullDistance = (-dx * INPUT.aimDirX) + (-dy * INPUT.aimDirY);
  INPUT.power = clamp(pullDistance / (cue.r * 7), 0, 1);
}

function takePlayerShot() {
  const cue = getCueBall();
  if (!cue || !cue.active) return;

  const len = Math.hypot(INPUT.aimDirX, INPUT.aimDirY);
  if (len < 0.001) return;

  const dirX = INPUT.aimDirX / len;
  const dirY = INPUT.aimDirY / len;
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
  let collided = false;

  if (ball.x - ball.r < t.left) {
    ball.x = t.left + ball.r;
    ball.vx = Math.abs(ball.vx) * PHYS.restitutionRail;
    collided = true;
  } else if (ball.x + ball.r > t.right) {
    ball.x = t.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * PHYS.restitutionRail;
    collided = true;
  }

  if (ball.y - ball.r < t.top) {
    ball.y = t.top + ball.r;
    ball.vy = Math.abs(ball.vy) * PHYS.restitutionRail;
    collided = true;
  } else if (ball.y + ball.r > t.bottom) {
    ball.y = t.bottom - ball.r;
    ball.vy = -Math.abs(ball.vy) * PHYS.restitutionRail;
    collided = true;
  }

  if (collided && STATE.firstContact != null && !ball.cue) {
    STATE.railAfterContact = true;
  }
  if (collided && STATE.firstContact != null && ball.cue) {
    STATE.railAfterContact = true;
  }
}

function tryPocket(ball) {
  if (!ball.active) return false;

  for (const p of STATE.table.pockets) {
    const d = dist(ball.x, ball.y, p.x, p.y);

    const lipFactor = p.corner ? 0.9 : 0.87;
    const captureRadius = p.r * lipFactor;

    if (d < captureRadius) {
      ball.active = false;
      ball.sunk = true;
      ball.vx = 0;
      ball.vy = 0;
      STATE.pocketedThisTurn.push(ball.number);
      return true;
    }
  }

  return false;
}

function simulateStep() {
  const active = STATE.balls.filter((b) => b.active);

  for (const ball of active) {
    ball.x += ball.vx;
    ball.y += ball.vy;
  }

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      resolveBallCollision(active[i], active[j]);
    }
  }

  for (const ball of active) {
    handleRailCollision(ball);
    tryPocket(ball);
  }

  for (const ball of active) {
    if (!ball.active) continue;

    ball.vx *= PHYS.friction;
    ball.vy *= PHYS.friction;

    if (Math.hypot(ball.vx, ball.vy) < PHYS.minSpeed) {
      ball.vx = 0;
      ball.vy = 0;
    }
  }
}

function advancePhysics() {
  for (let s = 0; s < PHYS.substeps; s += 1) {
    simulateStep();
  }
}

function assignGroupsFromFirstPocket(pocketedObjects) {
  if (!pocketedObjects.length) return;

  if (STATE.groups[0] || STATE.groups[1]) return;

  const first = pocketedObjects[0];
  const g = groupOfBall(first);
  if (!g) return;

  STATE.groups[STATE.current] = g;
  STATE.groups[otherPlayer(STATE.current)] = g === "solids" ? "stripes" : "solids";
}

function legalFirstContact() {
  const onEight = playerOnEight(STATE.current);

  if (onEight) return STATE.firstContact === 8;

  const myGroup = STATE.groups[STATE.current];
  if (!myGroup) {
    return STATE.firstContact != null && STATE.firstContact !== 8;
  }

  return groupOfBall(STATE.firstContact) === myGroup;
}

function endShotIfStopped() {
  if (anyBallMoving()) return;

  if (!STATE.shotInProgress) {
    if (STATE.phase === "ROLL") {
      STATE.phase = "AIM";
      updateHUD();
      maybeStartAiTurn();
    }
    return;
  }

  STATE.shotInProgress = false;

  const pocketed = STATE.pocketedThisTurn.slice();
  const cueSunk = pocketed.includes(0);
  const eightSunk = pocketed.includes(8);
  const objectPocketed = pocketed.filter((n) => n !== 0 && n !== 8);

  assignGroupsFromFirstPocket(objectPocketed);

  const onEight = playerOnEight(STATE.current);
  const firstHitLegal = legalFirstContact();

  let foul = false;
  let keepTurn = false;

  if (!firstHitLegal) foul = true;

  if (cueSunk) {
    foul = true;
  }

  if (eightSunk) {
    if (onEight && !cueSunk && STATE.firstContact === 8) {
      STATE.winner = STATE.current;
    } else {
      STATE.winner = otherPlayer(STATE.current);
    }
    updateHUD();
    return;
  }

  const myGroup = STATE.groups[STATE.current];

  if (objectPocketed.length > 0) {
    if (!myGroup) {
      keepTurn = true;
    } else {
      const myPocketed = objectPocketed.some((n) => groupOfBall(n) === myGroup);
      const oppPocketed = objectPocketed.some((n) => groupOfBall(n) && groupOfBall(n) !== myGroup);

      if (oppPocketed && !myPocketed) {
        foul = true;
      } else if (myPocketed) {
        keepTurn = true;
      }
    }
  }

  const legalPocket = objectPocketed.length > 0;
  if (!cueSunk && !legalPocket && STATE.firstContact != null && !STATE.railAfterContact && objectPocketed.length === 0) {
    foul = true;
  }

  if (cueSunk) {
    const cue = getCueBall();
    cue.active = true;
    cue.sunk = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = STATE.table.headX;
    cue.y = STATE.table.centerY;
  }

  STATE.ballInHand = foul;
  STATE.foul = foul;

  if (foul) {
    STATE.current = otherPlayer(STATE.current);
  } else if (!keepTurn) {
    STATE.current = otherPlayer(STATE.current);
  }

  STATE.phase = "AIM";
  STATE.pendingSwitch = false;
  STATE.firstContact = null;
  STATE.railAfterContact = false;
  STATE.pocketedThisTurn = [];

  if (STATE.ballInHand) {
    setStatus(`${currentPlayerName()} has ball-in-hand. Drag the cue ball to place it.`);
  }

  updateHUD();
  maybeStartAiTurn();
}

function chooseAiTargetBall() {
  const group = STATE.groups[1];

  const candidates = STATE.balls.filter((b) => {
    if (!b.active || b.cue) return false;
    if (b.number === 8) return playerOnEight(1);
    if (!group) return b.number !== 8;
    return groupOfBall(b.number) === group;
  });

  return candidates.length ? rand(candidates) : null;
}

function findPocketForBall(ball) {
  const cue = getCueBall();
  if (!cue) return null;

  let best = null;
  let bestScore = Infinity;

  for (const p of STATE.table.pockets) {
    const d = dist(cue.x, cue.y, b.x, b.y);
    const d2 = dist(ball.x, ball.y, p.x, p.y);
    const score = d + d2 * 0.9;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function aiTakeShot() {
  if (STATE.winner != null) return;

  if (STATE.ballInHand) {
    const cue = getCueBall();
    const legal = STATE.balls
      .filter((b) => b.active && !b.cue)
      .sort((a, b) => a.x - b.x)[0];

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
  const target = chooseAiTargetBall();

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
    STATE.aiLevel === "easy" ? 0.26 :
    STATE.aiLevel === "medium" ? 0.14 : 0.07;

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
  wood.addColorStop(0, "#96602c");
  wood.addColorStop(0.2, "#b77737");
  wood.addColorStop(0.5, "#6a3c15");
  wood.addColorStop(0.8, "#8d5727");
  wood.addColorStop(1, "#4b280e");

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
  const railGrad = ctx.createLinearGradient(t.left, t.top, t.right, t.bottom);
  railGrad.addColorStop(0, "#4f2d10");
  railGrad.addColorStop(0.55, "#3e230c");
  railGrad.addColorStop(1, "#2b1808");
  ctx.fillStyle = railGrad;
  ctx.fill();

  const felt = ctx.createRadialGradient(
    (t.left + t.right) * 0.5,
    (t.top + t.bottom) * 0.48,
    t.ballR * 2,
    (t.left + t.right) * 0.5,
    (t.top + t.bottom) * 0.48,
    (t.right - t.left) * 0.7
  );
  felt.addColorStop(0, "#2390e4");
  felt.addColorStop(0.4, "#0f70c9");
  felt.addColorStop(0.74, "#0a569f");
  felt.addColorStop(1, "#073a6f");

  roundRect(ctx, t.left, t.top, t.right - t.left, t.bottom - t.top, 18);
  ctx.fillStyle = felt;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 1.4;
  roundRect(ctx, t.left + 3, t.top + 3, t.right - t.left - 6, t.bottom - t.top - 6, 16);
  ctx.stroke();
  ctx.restore();

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
  ctx.ellipse(ball.x + ball.r * 0.08, ball.y + ball.r * 0.72, ball.r * 0.98, ball.r * 0.46, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
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
  ctx.arc(ball.x - ball.r * 0.08, ball.y - ball.r * 0.24, ball.r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.76)";
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

  const len = Math.hypot(INPUT.aimDirX, INPUT.aimDirY);
  const dirX = len > 0.001 ? INPUT.aimDirX / len : 1;
  const dirY = len > 0.001 ? INPUT.aimDirY / len : 0;

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
    advancePhysics();
    endShotIfStopped();
  }

  draw();
  requestAnimationFrame(tick);
}

function maybeStartAiTurn() {
  if (STATE.winner != null) return;
  if (STATE.mode !== "ai") return;
  if (STATE.current !== 1) return;
  if (STATE.phase !== "AIM") return;
  if (STATE.ballInHand && !isLegalCuePlacement(STATE.table.headX, STATE.table.centerY)) {
    // still manageable by AI placement path
  }

  STATE.phase = "AI";
  updateHUD();

  const delay =
    STATE.aiLevel === "easy" ? 580 :
    STATE.aiLevel === "medium" ? 460 : 340;

  setTimeout(() => {
    if (STATE.phase !== "AI") return;
    aiTakeShot();
  }, delay);
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
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
  INPUT.aimDirX = 1;
  INPUT.aimDirY = 0;
  INPUT.aimX = cue.x + 140;
  INPUT.aimY = cue.y;
  INPUT.lockedAim = false;

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

window.addEventListener("resize", () => {
  resize();
  updateHUD();
});

resize();
updateHUD();
requestAnimationFrame(tick);
