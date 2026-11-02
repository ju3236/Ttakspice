// ===== 게임 로직 (DOM 없음) =====
import { BALANCE, GRADES, PREFERENCE_CHANCE, STAFF_NAMES, STAFF_ROSTER, WORK_TYPES } from "./data/config.js";
import { ENTITIES } from "./data/entities.js";
import { getLayout, workerSpot, entitySpot } from "./layout.js";

const SAVE_VERSION = 2;
const byId = Object.fromEntries(ENTITIES.map((e) => [e.id, e]));
export const getEntity = (id) => byId[id];

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const layoutOf = () => getLayout(ENTITIES.length);
export const roomOf = (cellIdx) => layoutOf().rooms[cellIdx];

let nextStaffId = 1;

// ---------- 직원 ----------
export function maxHp(s) { return 20 + s.stats.grit * 5; }
export function maxSan(s) { return 20 + s.stats.calm * 5; }
const walkSpeed = (s) => 80 * (1 + (s.stats.agility - 1) * 0.08);

function homeX() {
  const m = layoutOf().main;
  return rand(m.x + 40, m.x + m.w - 40);
}

export function makeStaff(state) {
  const used = state.staff.map((s) => s.name);
  const preset = STAFF_ROSTER.find((r) => !used.includes(r.name));
  const free = STAFF_NAMES.filter((n) => !used.includes(n));
  const s = {
    id: nextStaffId++,
    name: preset?.name ?? (free.length ? pick(free) : `직원 ${nextStaffId}`),
    image: preset?.image ?? null,
    stats: { grit: randInt(1, 3), calm: randInt(1, 3), focus: randInt(1, 3), agility: randInt(1, 3) },
    status: "idle",
    task: null,
    works: 0,
    boundUntil: 0,
    panicUntil: 0,
    x: homeX(),
    fy: 0,
    dir: 1,
    moving: false,
    goalX: null,
  };
  s.hp = maxHp(s);
  s.san = maxSan(s);
  return s;
}

export function isAvailable(s) { return s.status === "idle"; }

// ---------- 이동 ----------
// ent: {x, fy, dir, moving}. 목표 층/좌표까지 엘리베이터를 타며 이동. 도착하면 true.
function moveTo(ent, tf, tx, dt, speed) {
  const L = layoutOf();
  ent.moving = false;
  let budget = speed * dt;
  for (let guard = 0; guard < 4 && budget > 0; guard++) {
    const onFloor = Math.abs(ent.fy - Math.round(ent.fy)) < 1e-3;
    if (onFloor) ent.fy = Math.round(ent.fy);
    if (onFloor && ent.fy === tf) {
      const dx = tx - ent.x;
      if (Math.abs(dx) <= budget) { ent.x = tx; return true; }
      ent.x += Math.sign(dx) * budget; ent.dir = Math.sign(dx); ent.moving = true;
      return false;
    }
    // 엘리베이터 선택 (층 사이에 있으면 지금 있는 통로 유지)
    const ex = onFloor
      ? L.elevators.reduce((best, e) => (Math.abs(ent.x - e) + Math.abs(tx - e) < Math.abs(ent.x - best) + Math.abs(tx - best) ? e : best))
      : L.elevators.reduce((best, e) => (Math.abs(ent.x - e) < Math.abs(ent.x - best) ? e : best));
    const dx = ex - ent.x;
    if (Math.abs(dx) > 0.5) {
      const step = Math.min(Math.abs(dx), budget);
      ent.x += Math.sign(dx) * step; ent.dir = Math.sign(dx); ent.moving = true;
      budget -= step;
      continue;
    }
    ent.x = ex;
    const vy = 1.4 * dt;
    const d = tf - ent.fy;
    ent.fy = Math.abs(d) <= vy ? tf : ent.fy + Math.sign(d) * vy;
    ent.moving = true;
    return false;
  }
  return false;
}

// ---------- 상태 ----------
export function newGame() {
  nextStaffId = 1;
  const state = {
    version: SAVE_VERSION,
    phase: "day", // day | dayEnd | gameover
    day: 1,
    quota: BALANCE.startingQuota,
    dayData: 0,
    currency: 0,
    time: 0,
    speed: 1,
    staff: [],
    cells: [],
    pool: ENTITIES.map((e) => e.id),
    choices: [],
    log: [],
    events: [],
    gameOverReason: "",
  };
  for (let i = 0; i < BALANCE.startingStaff; i++) state.staff.push(makeStaff(state));
  const minGrade = Math.min(...ENTITIES.map((e) => e.grade));
  addEntity(state, pick(ENTITIES.filter((e) => e.grade === minGrade)).id);
  log(state, `${state.day}일차 업무를 시작합니다.`, "info");
  return state;
}

export function addEntity(state, id) {
  state.pool = state.pool.filter((p) => p !== id);
  const e = getEntity(id);
  state.cells.push({
    entityId: id,
    stability: e.stability,
    workCount: 0,
    lastWorkedAt: state.time,
    busy: null,
    breached: false,
    breachHp: 0,
    breachCooldown: 0,
    b: null, // 탈출 시 위치 {x, fy, dir, moving, target, retarget}
  });
}

export function log(state, text, kind = "") {
  state.log.unshift({ day: state.day, t: Math.floor(state.time), text, kind });
  if (state.log.length > 80) state.log.length = 80;
}

function fx(state, x, fy, text, kind = "") {
  state.events.push({ type: "float", x, fy, text, kind });
}

// ---------- 행동 ----------
export function successChance(staff, entity, workType) {
  let p = PREFERENCE_CHANCE[entity.prefs[workType] ?? "none"];
  p += (staff.stats.focus - 1) * 0.03;
  if (entity.traits?.includes("mirror") && staff.san < maxSan(staff) / 2) p -= 0.25;
  return clamp(p, 0.05, 0.97);
}

export function startWork(state, staffId, cellIdx, workType) {
  const s = state.staff.find((x) => x.id === staffId);
  const cell = state.cells[cellIdx];
  if (state.phase !== "day" || !s || !cell || !isAvailable(s) || cell.busy != null || cell.breached) return false;
  const e = getEntity(cell.entityId);
  s.status = "working";
  s.task = { kind: "work", phase: "move", cellIdx, workType, units: e.dataPerWork, done: 0, success: 0, timer: 0 };
  cell.busy = s.id;
  log(state, `${s.name} → ${e.code} '${WORK_TYPES[workType].label}' 작업 지시`);
  return true;
}

export function startSuppress(state, staffId, cellIdx) {
  const s = state.staff.find((x) => x.id === staffId);
  const cell = state.cells[cellIdx];
  if (!s || !cell || !cell.breached || !isAvailable(s)) return false;
  s.status = "fighting";
  s.task = { kind: "fight", cellIdx };
  return true;
}

export function recall(state, staffId) {
  const s = state.staff.find((x) => x.id === staffId);
  if (s?.status === "fighting") { s.status = "idle"; s.task = null; s.goalX = homeX(); }
}

// ---------- 시뮬레이션 ----------
export function tick(state, dt) {
  if (state.phase !== "day" || state.speed === 0) return;
  dt *= state.speed;
  state.time += dt;

  for (const s of state.staff) updateStaff(state, s, dt);
  state.cells.forEach((cell, i) => updateCell(state, cell, i, dt));

  const alive = state.staff.filter((s) => s.status !== "dead");
  if (!alive.length) return gameOver(state, "모든 직원이 사망했습니다.");
  const breaches = state.cells.filter((c) => c.breached).length;
  if (breaches >= BALANCE.breachLimit) return gameOver(state, `동시 격리 실패 ${breaches}건. 시설이 붕괴했습니다.`);
  if (state.time >= BALANCE.timePerDay) {
    if (state.dayData >= state.quota) endDay(state);
    else gameOver(state, "업무 시간 내에 할당량을 채우지 못했습니다.");
  }
}

function updateStaff(state, s, dt) {
  s.moving = false;
  if (s.status === "dead") return;
  if (s.status === "bound") {
    if (state.time >= s.boundUntil) { s.status = "idle"; s.goalX = homeX(); log(state, `${s.name}의 구속이 풀렸습니다.`); }
    return;
  }
  if (s.status === "panic") {
    if (state.time >= s.panicUntil) {
      s.status = "idle"; s.goalX = homeX(); s.san = Math.ceil(maxSan(s) / 2);
      log(state, `${s.name}이(가) 정신을 되찾았습니다.`);
    } else {
      // 패닉: 근처를 허둥지둥 오감
      if (s.goalX == null || Math.abs(s.goalX - s.x) < 2) s.goalX = clamp(s.x + rand(-120, 120), 90, layoutOf().width - 90);
      moveTo(s, Math.round(s.fy), s.goalX, dt, walkSpeed(s) * 0.7);
    }
    return;
  }
  if (s.status === "idle") {
    s.san = Math.min(maxSan(s), s.san + 0.6 * dt);
    s.hp = Math.min(maxHp(s), s.hp + 0.25 * dt);
    const m = layoutOf().main;
    const inMain = s.fy === 0 && s.x > m.x + 20 && s.x < m.x + m.w - 20;
    if (!inMain && s.goalX == null) s.goalX = homeX();
    if (s.goalX != null && moveTo(s, 0, s.goalX, dt, walkSpeed(s))) s.goalX = null;
    return;
  }
  if (s.status === "working") return updateWork(state, s, dt);
  if (s.status === "fighting") {
    const cell = state.cells[s.task.cellIdx];
    if (!cell.breached) { s.status = "idle"; s.task = null; s.goalX = homeX(); return; }
    const b = cell.b;
    const side = s.x < b.x ? -1 : 1;
    const near = Math.abs(s.fy - b.fy) < 0.05 && Math.abs(s.x - b.x) < 60;
    if (!near) moveTo(s, Math.round(b.fy), b.x + side * 40, dt, walkSpeed(s));
    else {
      s.dir = -side;
      cell.breachHp -= (2 + s.stats.grit * 0.8 + s.stats.agility * 0.6) * dt;
      if (cell.breachHp <= 0) suppressed(state, s.task.cellIdx);
    }
  }
}

function updateWork(state, s, dt) {
  const t = s.task;
  const cell = state.cells[t.cellIdx];
  const e = getEntity(cell.entityId);
  const room = roomOf(t.cellIdx);
  if (t.phase === "move") {
    const spot = workerSpot(room);
    if (moveTo(s, spot.floor, spot.x, dt, walkSpeed(s))) { t.phase = "work"; s.dir = 1; }
    return;
  }
  const unitTime = BALANCE.workTickSeconds * (1 - (s.stats.agility - 1) * 0.06);
  t.timer += dt;
  while (t.timer >= unitTime && t.done < t.units && s.status === "working") {
    t.timer -= unitTime;
    t.done++;
    if (Math.random() < successChance(s, e, t.workType)) {
      t.success++;
    } else {
      const dmg = randInt(e.damage.amount[0], e.damage.amount[1]);
      if (e.damage.type === "body") s.hp -= dmg; else s.san -= dmg;
      fx(state, s.x, s.fy, `-${dmg}`, e.damage.type === "body" ? "hp" : "san");
      if (checkStaffBreak(state, s)) { finishWork(state, s, true); return; }
    }
  }
  if (t.done >= t.units) finishWork(state, s, false);
}

function checkStaffBreak(state, s) {
  if (s.hp <= 0) { kill(state, s, `${s.name} 사망.`); return true; }
  if (s.san <= 0) {
    s.san = 0; s.status = "panic"; s.panicUntil = state.time + 25; s.goalX = null;
    log(state, `${s.name}이(가) 패닉에 빠졌습니다.`, "bad");
    fx(state, s.x, s.fy, "패닉!", "san");
    return true;
  }
  return false;
}

function kill(state, s, msg) {
  s.hp = 0; s.status = "dead"; s.moving = false;
  log(state, msg, "bad");
  fx(state, s.x, s.fy, "사망", "hp");
}

function finishWork(state, s, interrupted) {
  const t = s.task;
  const cell = state.cells[t.cellIdx];
  const e = getEntity(cell.entityId);
  const room = roomOf(t.cellIdx);
  const ratio = t.success / t.units;
  const result = interrupted ? "bad" : ratio >= 0.7 ? "good" : ratio >= 0.4 ? "normal" : "bad";

  state.dayData += t.success;
  state.currency += t.success;
  cell.busy = null;
  cell.workCount++;
  cell.lastWorkedAt = state.time;
  s.works++;

  const label = { good: "좋음", normal: "보통", bad: "나쁨" }[result];
  const flavor = e.flavor?.[result] ? ` ${e.flavor[result]}` : "";
  log(state, `${e.code} 작업 결과: ${label} (+${t.success}).${flavor}`, result === "bad" ? "bad" : result === "good" ? "good" : "");
  fx(state, room.x + room.w / 2, room.floor, `${label} +${t.success}`, result);

  if (result === "good") {
    cell.stability = Math.min(e.stability, cell.stability + 1);
    if (e.traits?.includes("healer") && s.status === "working") s.san = maxSan(s);
  } else if (result === "bad" || (result === "normal" && e.traits?.includes("hungry"))) {
    cell.stability--;
  }

  if (s.status === "working") {
    s.status = "idle";
    s.goalX = homeX();
    if (result === "bad" && e.traits?.includes("binding")) {
      s.status = "bound"; s.boundUntil = state.time + 20;
      log(state, `${e.name}이(가) ${s.name}을(를) 붙잡았습니다.`, "bad");
    }
  }
  s.task = null;
  if (cell.stability <= 0) breach(state, t.cellIdx);
}

function updateCell(state, cell, idx, dt) {
  const e = getEntity(cell.entityId);
  if (!cell.breached) {
    if (e.traits?.includes("lonely") && cell.busy == null && state.time - cell.lastWorkedAt > 60) {
      cell.lastWorkedAt = state.time;
      cell.stability--;
      log(state, `${e.code}이(가) 외로움을 느낍니다. 안정도 감소.`, "bad");
      if (cell.stability <= 0) breach(state, idx);
    }
    return;
  }
  // 탈출한 개체: 목표 직원을 쫓아다니며 공격
  const b = cell.b;
  const alive = state.staff.filter((s) => s.status !== "dead");
  const fighters = alive.filter((s) => s.status === "fighting" && s.task?.cellIdx === idx);
  b.retarget -= dt;
  let target = alive.find((s) => s.id === b.target);
  if (!target || b.retarget <= 0) {
    const pool = fighters.length ? fighters : alive;
    target = pool.length ? pool.reduce((a, c) => (dist(c, b) < dist(a, b) ? c : a)) : null;
    b.target = target?.id ?? null;
    b.retarget = 6;
  }
  if (target && dist(target, b) > 45) moveTo(b, Math.round(target.fy), target.x, dt, 45 + e.grade * 6);
  else b.moving = false;
  if (target) b.dir = target.x < b.x ? -1 : 1;

  cell.breachCooldown -= dt;
  if (cell.breachCooldown > 0) return;
  const inRange = alive.filter((s) => Math.abs(s.fy - b.fy) < 0.05 && Math.abs(s.x - b.x) < 70);
  if (!inRange.length) return;
  cell.breachCooldown = e.breach.interval;
  const victim = pick(inRange);
  victim.hp -= e.breach.attack;
  fx(state, victim.x, victim.fy, `-${e.breach.attack}`, "hp");
  if (victim.hp <= 0) {
    if (victim.task?.kind === "work") state.cells[victim.task.cellIdx].busy = null;
    victim.task = null;
    kill(state, victim, `${e.name}에게 ${victim.name}이(가) 사망했습니다.`);
  }
}

const dist = (a, b) => Math.abs(a.fy - b.fy) * 400 + Math.abs(a.x - b.x);

function breach(state, idx) {
  const cell = state.cells[idx];
  const e = getEntity(cell.entityId);
  const spot = entitySpot(roomOf(idx));
  cell.breached = true;
  cell.stability = 0;
  cell.breachHp = e.breach.hp;
  cell.breachCooldown = e.breach.interval;
  cell.b = { x: spot.x, fy: spot.floor, dir: -1, moving: false, target: null, retarget: 0 };
  log(state, `⚠ 격리 실패: ${e.code} ${e.name}`, "alert");
  fx(state, spot.x, spot.floor, "격리 실패!", "bad");
}

function suppressed(state, idx) {
  const cell = state.cells[idx];
  const e = getEntity(cell.entityId);
  fx(state, cell.b.x, cell.b.fy, "진압 완료", "good");
  cell.breached = false;
  cell.b = null;
  cell.stability = Math.ceil(e.stability / 2);
  cell.lastWorkedAt = state.time;
  for (const s of state.staff) {
    if (s.status === "fighting" && s.task?.cellIdx === idx) { s.status = "idle"; s.task = null; s.goalX = homeX(); }
  }
  const reward = 10 * e.grade;
  state.currency += reward;
  log(state, `${e.code} 재격리 완료. (+${reward})`, "good");
}

// ---------- 하루 종료 / 관리 ----------
export function canEndDay(state) {
  return state.phase === "day" && state.dayData >= state.quota && !state.cells.some((c) => c.breached);
}

export function endDay(state) {
  for (const s of state.staff) {
    if (s.status === "dead") continue;
    s.status = "idle"; s.task = null; s.hp = maxHp(s); s.san = maxSan(s);
    s.fy = 0; s.x = homeX(); s.goalX = null;
  }
  for (const c of state.cells) { c.busy = null; c.breached = false; c.b = null; c.stability = Math.max(c.stability, 1); }
  const bonus = Math.max(0, state.dayData - state.quota);
  log(state, `${state.day}일차 종료. 할당량 초과분 ${bonus}.`, "good");
  state.phase = "dayEnd";
  state.choices = [...state.pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

export function chooseEntity(state, id) {
  if (state.phase !== "dayEnd" || !state.choices.includes(id)) return;
  addEntity(state, id);
  state.choices = [];
  log(state, `신규 개체 ${getEntity(id).code} ${getEntity(id).name} 격리 수용.`, "info");
}

export function startNextDay(state) {
  if (state.phase !== "dayEnd") return;
  state.day++;
  state.quota = BALANCE.startingQuota + (state.day - 1) * BALANCE.quotaGrowth + (state.cells.length - 1) * 6;
  state.dayData = 0;
  state.time = 0;
  state.choices = [];
  state.phase = "day";
  for (const c of state.cells) c.lastWorkedAt = 0;
  log(state, `${state.day}일차 업무를 시작합니다.`, "info");
}

export function hire(state) {
  const alive = state.staff.filter((s) => s.status !== "dead");
  if (state.currency < BALANCE.hireCost || alive.length >= BALANCE.maxStaff) return false;
  state.currency -= BALANCE.hireCost;
  const s = makeStaff(state);
  state.staff.push(s);
  log(state, `신규 직원 ${s.name} 채용.`, "info");
  return true;
}

export function upgradeStat(state, staffId, stat) {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s || s.status === "dead" || s.stats[stat] >= 10) return false;
  const cost = BALANCE.statUpCost(s.stats[stat]);
  if (state.currency < cost) return false;
  state.currency -= cost;
  s.stats[stat]++;
  s.hp = maxHp(s); s.san = maxSan(s);
  return true;
}

function gameOver(state, reason) {
  state.phase = "gameover";
  state.gameOverReason = reason;
  log(state, `게임 오버: ${reason}`, "alert");
}

// ---------- 저장 ----------
const SAVE_KEY = "ttakspice-save";
export function save(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, events: [], nextStaffId })); } catch {}
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    if (data.cells.some((c) => !getEntity(c.entityId))) return null; // 개체 데이터가 바뀐 경우
    nextStaffId = data.nextStaffId ?? 100;
    delete data.nextStaffId;
    data.events = [];
    return data;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export { GRADES };
