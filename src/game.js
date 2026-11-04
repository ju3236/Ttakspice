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
    color: preset?.color ?? null,
    memo: preset?.memo ?? "",
    stats: { grit: randInt(1, 3), calm: randInt(1, 3), focus: randInt(1, 3), agility: randInt(1, 3) },
    status: "idle",
    task: null,
    works: 0,
    exp: { grit: 0, calm: 0, focus: 0, agility: 0 },
    weapon: null,
    suit: null,
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
    alertStage: 0,
    support: { ...BALANCE.support },
    armory: [],
    nextItemId: 1,
    dayStats: newDayStats(),
  };
  for (let i = 0; i < BALANCE.startingStaff; i++) state.staff.push(makeStaff(state));
  const minGrade = Math.min(...ENTITIES.map((e) => e.grade));
  addEntity(state, pick(ENTITIES.filter((e) => e.grade === minGrade)).id);
  log(state, `${state.day}일차 업무를 시작합니다.`, "info");
  banner(state, `${state.day}일차 업무 개시`, "info");
  return state;
}

const newDayStats = () => ({ works: 0, good: 0, deaths: 0, breaches: 0, alertsMissed: 0 });

function banner(state, text, kind = "info") { state.events.push({ type: "banner", text, kind }); }

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
    energy: 0,        // 이 개체에서 얻은 에너지 (장비 추출에 사용)
    alertUntil: null, // 긴급 작업 경보 마감 시각
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

// ---------- 연구 / 장비 ----------
export const researchMax = (e) => Math.max(1, ...e.docs.map((d) => d.need));
export const isResearched = (cell) => cell.workCount >= researchMax(getEntity(cell.entityId));

/** 개체의 장비. entities.js 에 gear 가 없으면 등급으로 자동 생성 */
export function gearOf(e) {
  const g = e.gear ?? {};
  const k = e.grade;
  const bodyMain = e.damage.type === "body";
  return {
    weapon: {
      name: g.weapon?.name ?? `${e.name}의 파편`,
      cost: g.weapon?.cost ?? 15 + k * 15,
      atk: g.weapon?.atk ?? 1 + k * 1.5,
    },
    suit: {
      name: g.suit?.name ?? `${e.name}의 외피`,
      cost: g.suit?.cost ?? 20 + k * 15,
      body: g.suit?.body ?? +(bodyMain ? 0.12 + k * 0.06 : 0.04 + k * 0.03).toFixed(2),
      mind: g.suit?.mind ?? +(bodyMain ? 0.04 + k * 0.03 : 0.12 + k * 0.06).toFixed(2),
    },
  };
}

export const itemOf = (state, id) => state.armory.find((it) => it.id === id) ?? null;
const resist = (state, s, type) => itemOf(state, s.suit)?.[type] ?? 0;
export const attackPower = (state, s) => 2 + s.stats.grit * 0.8 + s.stats.agility * 0.6 + (itemOf(state, s.weapon)?.atk ?? 0) * 1.5;

export function buyGear(state, cellIdx, kind) {
  const cell = state.cells[cellIdx];
  if (!cell) return false;
  const e = getEntity(cell.entityId);
  const g = gearOf(e)[kind];
  if (cell.energy < g.cost) return false;
  cell.energy -= g.cost;
  state.armory.push({ id: state.nextItemId++, kind, entityId: e.id, ...g });
  log(state, `장비 추출: ${g.name}`, "info");
  return true;
}

export function equip(state, staffId, kind, itemId) {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s || s.status === "dead") return false;
  if (itemId != null) for (const o of state.staff) if (o[kind] === itemId) o[kind] = null;
  s[kind] = itemId;
  return true;
}

// ---------- 관리자 지원 ----------
export function useSupport(state, kind, staffId) {
  const s = state.staff.find((x) => x.id === staffId);
  if (state.phase !== "day" || !s || s.status === "dead" || !(state.support[kind] > 0)) return false;
  state.support[kind]--;
  if (kind === "heal") {
    s.hp = Math.min(maxHp(s), s.hp + maxHp(s) * 0.6);
    fx(state, s.x, s.fy, "응급 치료", "good");
  } else {
    s.san = Math.min(maxSan(s), s.san + maxSan(s) * 0.6);
    if (s.status === "panic") { s.status = "idle"; s.goalX = homeX(); }
    fx(state, s.x, s.fy, "진정 처치", "san");
  }
  log(state, `지원 조치: ${s.name}에게 ${kind === "heal" ? "응급 치료" : "진정 처치"}`, "info");
  return true;
}

// ---------- 행동 ----------
export function successChance(staff, entity, workType, cell = null) {
  let p = PREFERENCE_CHANCE[entity.prefs[workType] ?? "none"];
  p += (staff.stats.focus - 1) * 0.03;
  if (cell && isResearched(cell)) p += 0.05;
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
  const th = BALANCE.alertThresholds;
  while (state.alertStage < th.length && state.dayData >= state.quota * th[state.alertStage]) {
    state.alertStage++;
    triggerAlert(state);
  }

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
      cell.breachHp -= attackPower(state, s) * dt;
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
    const ok = Math.random() < successChance(s, e, t.workType, cell);
    state.events.push({ type: "unit", cellIdx: t.cellIdx, ok });
    if (ok) {
      t.success++;
    } else {
      const dmg = Math.max(1, Math.round(randInt(e.damage.amount[0], e.damage.amount[1]) * (1 - resist(state, s, e.damage.type))));
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
  state.dayStats.deaths++;
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
  cell.energy += t.success;
  cell.busy = null;
  const wasResearched = isResearched(cell);
  cell.workCount++;
  cell.lastWorkedAt = state.time;
  s.works++;
  state.dayStats.works++;
  if (result === "good") state.dayStats.good++;
  if (!wasResearched && isResearched(cell)) {
    log(state, `${e.code} 연구 완료. 이 개체의 작업 성공률 +5%`, "good");
    banner(state, `${e.code} 연구 완료`, "good");
  }

  // 능력치 성장: 작업 종류에 맞는 능력치 경험치
  if (s.status === "working") {
    const st = WORK_TYPES[t.workType].stat;
    s.exp[st] = (s.exp[st] ?? 0) + t.success;
    const need = BALANCE.expPerLevel(s.stats[st]);
    if (s.stats[st] < 10 && s.exp[st] >= need) {
      s.exp[st] -= need;
      s.stats[st]++;
      const lbl = { grit: "근성", calm: "침착", focus: "집중", agility: "기민" }[st];
      fx(state, s.x, s.fy, `${lbl} +1`, "lvl");
      log(state, `${s.name}의 ${lbl}이(가) ${s.stats[st]}(으)로 올랐습니다.`, "good");
    }
  }

  // 긴급 작업 경보 해소
  if (cell.alertUntil != null) {
    cell.alertUntil = null;
    const bonus = 5 * e.grade;
    state.currency += bonus;
    log(state, `${e.code} 긴급 작업 완료 (+${bonus})`, "good");
  }

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
  if (!cell.breached && cell.alertUntil != null) {
    if (cell.busy != null) cell.alertUntil += dt; // 작업하러 가는 중이면 시간 정지
    else if (state.time >= cell.alertUntil) {
      cell.alertUntil = null;
      const loss = state.alertStage >= 3 ? 2 : 1;
      cell.stability -= loss;
      state.dayStats.alertsMissed++;
      log(state, `${e.code} 긴급 작업 미이행. 안정도 -${loss}`, "bad");
      fx(state, entitySpot(roomOf(idx)).x, roomOf(idx).floor, `안정도 -${loss}`, "bad");
      if (cell.stability <= 0) { breach(state, idx); return; }
    }
  }
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
  const dmg = Math.max(1, Math.round(e.breach.attack * (1 - resist(state, victim, "body"))));
  victim.hp -= dmg;
  fx(state, victim.x, victim.fy, `-${dmg}`, "hp");
  if (victim.hp <= 0) {
    if (victim.task?.kind === "work") state.cells[victim.task.cellIdx].busy = null;
    victim.task = null;
    kill(state, victim, `${e.name}에게 ${victim.name}이(가) 사망했습니다.`);
  }
}

const dist = (a, b) => Math.abs(a.fy - b.fy) * 400 + Math.abs(a.x - b.x);

function triggerAlert(state) {
  const cand = state.cells.map((c, i) => i).filter((i) => !state.cells[i].breached && state.cells[i].alertUntil == null);
  if (!cand.length) return;
  cand.sort(() => Math.random() - 0.5);
  const picked = cand.slice(0, Math.min(state.alertStage, cand.length));
  for (const i of picked) state.cells[i].alertUntil = state.time + BALANCE.alertTime;
  const codes = picked.map((i) => getEntity(state.cells[i].entityId).code).join(", ");
  log(state, `⚠ 긴급 작업 경보 ${state.alertStage}단계: ${codes}`, "alert");
  banner(state, `긴급 작업 요청 · ${codes}`, "warn");
}

function breach(state, idx) {
  const cell = state.cells[idx];
  const e = getEntity(cell.entityId);
  const spot = entitySpot(roomOf(idx));
  cell.breached = true;
  cell.stability = 0;
  cell.alertUntil = null;
  state.dayStats.breaches++;
  banner(state, `격리 실패 — ${e.code} ${e.name}`, "alert");
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
  for (const c of state.cells) { c.busy = null; c.breached = false; c.b = null; c.alertUntil = null; c.stability = Math.max(c.stability, 1); }
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
  state.alertStage = 0;
  state.support = { ...BALANCE.support };
  state.dayStats = newDayStats();
  for (const c of state.cells) c.lastWorkedAt = 0;
  log(state, `${state.day}일차 업무를 시작합니다.`, "info");
  banner(state, `${state.day}일차 업무 개시`, "info");
}

export function canHire(state) {
  const alive = state.staff.filter((s) => s.status !== "dead");
  return state.currency >= BALANCE.hireCost && alive.length < BALANCE.maxStaff;
}

/** 채용 후보 생성 (아직 고용 안 함). 편집 화면에서 꾸민 뒤 hireStaff 로 확정 */
export function rollStaff(state) { return makeStaff(state); }

export function hireStaff(state, s) {
  if (!canHire(state)) return false;
  state.currency -= BALANCE.hireCost;
  state.staff.push(s);
  log(state, `신규 직원 ${s.name} 채용.`, "info");
  return true;
}

/** 이름/이미지/이름표 색/메모 수정 */
export function editStaff(state, staffId, patch) {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return false;
  for (const k of ["name", "image", "color", "memo"]) if (k in patch) s[k] = patch[k];
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
    // 예전 저장 파일 보정
    data.alertStage ??= 0;
    data.support ??= { ...BALANCE.support };
    data.armory ??= [];
    data.nextItemId ??= 1;
    data.dayStats ??= newDayStats();
    for (const st of data.staff) { st.exp ??= { grit: 0, calm: 0, focus: 0, agility: 0 }; st.weapon ??= null; st.suit ??= null; }
    for (const c of data.cells) { c.energy ??= 0; c.alertUntil ??= null; }
    return data;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export { GRADES };
