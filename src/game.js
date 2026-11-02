// ===== 게임 로직 (DOM 없음) =====
import { BALANCE, GRADES, PREFERENCE_CHANCE, STAFF_NAMES, WORK_TYPES } from "./data/config.js";
import { ENTITIES } from "./data/entities.js";

const byId = Object.fromEntries(ENTITIES.map((e) => [e.id, e]));
export const getEntity = (id) => byId[id];

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let nextStaffId = 1;

// ---------- 직원 ----------
export function maxHp(s) { return 20 + s.stats.grit * 5; }
export function maxSan(s) { return 20 + s.stats.calm * 5; }

export function makeStaff(usedNames = []) {
  const free = STAFF_NAMES.filter((n) => !usedNames.includes(n));
  const s = {
    id: nextStaffId++,
    name: free.length ? pick(free) : `직원 ${nextStaffId}`,
    stats: { grit: randInt(1, 3), calm: randInt(1, 3), focus: randInt(1, 3), agility: randInt(1, 3) },
    status: "idle",
    task: null,
    works: 0,
    boundUntil: 0,
    panicUntil: 0,
  };
  s.hp = maxHp(s);
  s.san = maxSan(s);
  return s;
}

export function isAvailable(s) { return s.status === "idle"; }
export function statLevel(s) { return Object.values(s.stats).reduce((a, b) => a + b, 0); }

// ---------- 상태 ----------
export function newGame() {
  nextStaffId = 1;
  const state = {
    version: 1,
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
    gameOverReason: "",
  };
  for (let i = 0; i < BALANCE.startingStaff; i++) {
    state.staff.push(makeStaff(state.staff.map((s) => s.name)));
  }
  // 첫 개체: 가장 낮은 등급 중 하나
  const minGrade = Math.min(...ENTITIES.map((e) => e.grade));
  addEntity(state, pick(ENTITIES.filter((e) => e.grade === minGrade)).id);
  log(state, `${state.day}일차 업무를 시작합니다.`, "info");
  return state;
}

export function addEntity(state, id) {
  const e = getEntity(id);
  state.pool = state.pool.filter((p) => p !== id);
  state.cells.push({
    entityId: id,
    stability: e.stability,
    workCount: 0,
    lastWorkedAt: state.time,
    busy: null,
    breached: false,
    breachHp: 0,
    breachCooldown: 0,
  });
}

export function log(state, text, kind = "") {
  state.log.unshift({ day: state.day, t: Math.floor(state.time), text, kind });
  if (state.log.length > 80) state.log.length = 80;
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
  if (!s || !cell || !isAvailable(s) || cell.busy != null || cell.breached) return false;
  const e = getEntity(cell.entityId);
  s.status = "working";
  s.task = { kind: "work", cellIdx, workType, units: e.dataPerWork, done: 0, success: 0, timer: 0 };
  cell.busy = s.id;
  log(state, `${s.name} → ${e.code} '${WORK_TYPES[workType].label}' 작업 시작`);
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
  if (s.status === "dead") return;
  if (s.status === "bound" && state.time >= s.boundUntil) { s.status = "idle"; log(state, `${s.name}의 구속이 풀렸습니다.`); }
  if (s.status === "panic" && state.time >= s.panicUntil) {
    s.status = "idle"; s.san = Math.ceil(maxSan(s) / 2); log(state, `${s.name}이(가) 정신을 되찾았습니다.`);
  }
  if (s.status === "idle") {
    s.san = Math.min(maxSan(s), s.san + 0.6 * dt);
    s.hp = Math.min(maxHp(s), s.hp + 0.25 * dt);
  }
  if (s.status === "working") updateWork(state, s, dt);
  if (s.status === "fighting") {
    const cell = state.cells[s.task.cellIdx];
    if (!cell.breached) { s.status = "idle"; s.task = null; return; }
    cell.breachHp -= (2 + s.stats.grit * 0.8 + s.stats.agility * 0.6) * dt;
    if (cell.breachHp <= 0) suppressed(state, s.task.cellIdx);
  }
}

function updateWork(state, s, dt) {
  const t = s.task;
  const cell = state.cells[t.cellIdx];
  const e = getEntity(cell.entityId);
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
      if (checkStaffBreak(state, s)) { finishWork(state, s, true); return; }
    }
  }
  if (t.done >= t.units) finishWork(state, s, false);
}

function checkStaffBreak(state, s) {
  if (s.hp <= 0) {
    s.hp = 0; s.status = "dead"; log(state, `${s.name} 사망.`, "bad"); return true;
  }
  if (s.san <= 0) {
    s.san = 0; s.status = "panic"; s.panicUntil = state.time + 25;
    log(state, `${s.name}이(가) 패닉에 빠졌습니다.`, "bad"); return true;
  }
  return false;
}

function finishWork(state, s, interrupted) {
  const t = s.task;
  const cell = state.cells[t.cellIdx];
  const e = getEntity(cell.entityId);
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

  if (result === "good") {
    cell.stability = Math.min(e.stability, cell.stability + 1);
    if (e.traits?.includes("healer") && s.status === "working") s.san = maxSan(s);
  } else if (result === "bad" || (result === "normal" && e.traits?.includes("hungry"))) {
    cell.stability--;
  }

  if (s.status === "working") {
    s.status = "idle";
    if (result === "bad" && e.traits?.includes("binding")) {
      s.status = "bound"; s.boundUntil = state.time + 20;
      log(state, `붉은 실이 ${s.name}을(를) 휘감았습니다.`, "bad");
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
  cell.breachCooldown -= dt;
  if (cell.breachCooldown > 0) return;
  cell.breachCooldown = e.breach.interval;
  const fighters = state.staff.filter((s) => s.status === "fighting" && s.task?.cellIdx === idx);
  const targets = fighters.length ? fighters : state.staff.filter((s) => ["idle", "working", "bound"].includes(s.status));
  if (!targets.length) return;
  const victim = pick(targets);
  victim.hp -= e.breach.attack;
  if (victim.hp <= 0) {
    if (victim.status === "working") {
      const c = state.cells[victim.task.cellIdx]; c.busy = null;
    }
    victim.task = null;
    victim.hp = 0; victim.status = "dead";
    log(state, `${e.name}에게 ${victim.name}이(가) 사망했습니다.`, "bad");
  }
}

function breach(state, idx) {
  const cell = state.cells[idx];
  const e = getEntity(cell.entityId);
  cell.breached = true;
  cell.stability = 0;
  cell.breachHp = e.breach.hp;
  cell.breachCooldown = e.breach.interval;
  log(state, `⚠ 격리 실패: ${e.code} ${e.name}`, "alert");
}

function suppressed(state, idx) {
  const cell = state.cells[idx];
  const e = getEntity(cell.entityId);
  cell.breached = false;
  cell.stability = Math.ceil(e.stability / 2);
  cell.lastWorkedAt = state.time;
  for (const s of state.staff) {
    if (s.status === "fighting" && s.task?.cellIdx === idx) { s.status = "idle"; s.task = null; }
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
    if (s.task?.kind === "work") state.cells[s.task.cellIdx].busy = null;
    s.status = "idle"; s.task = null; s.hp = maxHp(s); s.san = maxSan(s);
  }
  for (const c of state.cells) { c.busy = null; c.breached = false; c.stability = Math.max(c.stability, 1); }
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
  const s = makeStaff(state.staff.map((x) => x.name));
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, nextStaffId })); } catch {}
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    nextStaffId = data.nextStaffId ?? 100;
    delete data.nextStaffId;
    return data;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export { GRADES };
