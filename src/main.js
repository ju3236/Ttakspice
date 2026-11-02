// ===== 화면 / 입력 =====
import * as G from "./game.js";
import { BALANCE, GRADES, STAT_LABELS, WORK_TYPES, WORLD } from "./data/config.js";
import { TRAITS } from "./data/entities.js";

let state = G.load() ?? G.newGame();
let selected = null;   // 선택된 직원 id
let docCell = null;    // 문서 열람 중인 격리실 index
let lastPhase = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const fmtTime = (t) => { const r = Math.max(0, BALANCE.timePerDay - t); return `${Math.floor(r / 60)}:${String(Math.floor(r % 60)).padStart(2, "0")}`; };
const PREF_LABEL = { high: "높음", mid: "보통", low: "낮음", none: "최악" };
const STATUS_LABEL = { idle: "대기", working: "작업 중", fighting: "진압 중", bound: "구속됨", panic: "패닉", dead: "사망" };
const REVEAL_PREFS_AT = 2;

// ---------- 렌더 ----------
function renderTop() {
  const speeds = [0, 1, 2, 3].map((s) =>
    `<button data-act="speed" data-v="${s}" class="${state.speed === s ? "on" : ""}">${s === 0 ? "❚❚" : "▶".repeat(s)}</button>`).join("");
  $("topbar").innerHTML = `
    <span class="title">${esc(WORLD.organizationName)} · ${esc(WORLD.facilityName)}</span>
    <span>${state.day}일차</span>
    <span>남은 시간 ${fmtTime(state.time)}</span>
    <div class="grow">
      <div style="font-size:12px">할당량 ${state.dayData} / ${state.quota}</div>
      <div class="bar"><i style="width:${pct(state.dayData, state.quota)}"></i></div>
    </div>
    <span>${esc(WORLD.currencyName)} <b>${state.currency}</b></span>
    <span>${speeds}</span>
    <button data-act="endDay" ${G.canEndDay(state) ? "" : "disabled"}>업무 종료</button>
    <button data-act="restart">새 게임</button>`;
}

function renderCells() {
  $("cells").innerHTML = state.cells.map((c, i) => {
    const e = G.getEntity(c.entityId);
    const grade = GRADES[e.grade];
    const known = c.workCount >= REVEAL_PREFS_AT;
    const worker = state.staff.find((s) => s.id === c.busy);
    const sel = state.staff.find((s) => s.id === selected);
    let status = "";
    if (c.breached) status = `⚠ 탈출! 남은 내구 ${Math.ceil(c.breachHp)} / ${e.breach.hp}`;
    else if (worker) status = `${worker.name} 작업 중 · ${worker.task.done}/${worker.task.units} (성공 ${worker.task.success})`;
    else status = `작업 ${c.workCount}회`;

    const works = c.breached
      ? `<button data-act="suppress" data-cell="${i}" style="grid-column:span 2">진압 투입${sel ? ` (${esc(sel.name)})` : " (대기 인원 전원)"}</button>`
      : Object.entries(WORK_TYPES).map(([k, w]) => {
          const pref = known ? PREF_LABEL[e.prefs[k] ?? "none"] : "???";
          const chance = known && sel ? ` · ${Math.round(G.successChance(sel, e, k) * 100)}%` : "";
          return `<button data-act="work" data-cell="${i}" data-w="${k}" title="${esc(w.desc)}" ${worker ? "disabled" : ""}>${w.label}<small>선호 ${pref}${chance}</small></button>`;
        }).join("");

    const pips = Array.from({ length: e.stability }, (_, k) => `<i class="${k < c.stability ? "f" : ""}"></i>`).join("");
    return `<article class="cell ${c.breached ? "breached" : ""}" style="--grade:${grade.color}">
      <header><span class="code">${esc(e.code)} · <span style="color:${grade.color}">${esc(grade.label)}</span></span>
        <button data-act="doc" data-cell="${i}" style="padding:2px 8px">문서</button></header>
      <div class="name">${esc(e.name)}</div>
      <div class="pips ${c.stability <= 1 ? "low" : ""}" title="안정도">${pips}</div>
      <div class="status">${esc(status)}</div>
      ${worker ? `<div class="bar prog"><i style="width:${pct(worker.task.done, worker.task.units)}"></i></div>` : ""}
      <div class="works">${works}</div>
    </article>`;
  }).join("");
}

function renderStaff() {
  $("staff").innerHTML = state.staff.map((s) => {
    const dead = s.status === "dead";
    const st = s.stats;
    return `<div class="staff ${selected === s.id ? "sel" : ""} ${dead ? "dead" : ""}" data-act="select" data-id="${s.id}">
      <div class="row"><b>${esc(s.name)}</b><span class="st">${STATUS_LABEL[s.status]}</span></div>
      <div class="st">근${st.grit} 침${st.calm} 집${st.focus} 기${st.agility} · 작업 ${s.works}회</div>
      <div class="bar hp" title="체력"><i style="width:${pct(s.hp, G.maxHp(s))}"></i></div>
      <div class="bar san" title="정신력"><i style="width:${pct(s.san, G.maxSan(s))}"></i></div>
    </div>`;
  }).join("");
}

function renderLog() {
  $("log").innerHTML = state.log.slice(0, 40).map((l) =>
    `<li class="${l.kind}">[${l.day}일 ${fmtTime(l.t)}] ${esc(l.text)}</li>`).join("");
}

function renderModal() {
  const m = $("modal");
  if (state.phase === "gameover") {
    m.hidden = false;
    m.innerHTML = `<div class="dialog"><h1>시설 폐쇄</h1><p>${esc(state.gameOverReason)}</p>
      <p>${state.day}일차까지 버텼습니다. 격리 개체 ${state.cells.length}종.</p>
      <button data-act="restart">처음부터</button></div>`;
  } else if (state.phase === "dayEnd") {
    m.hidden = false;
    const choices = state.choices.map((id) => {
      const e = G.getEntity(id); const g = GRADES[e.grade];
      return `<button class="choice" style="--grade:${g.color}" data-act="choose" data-id="${id}">
        <div class="code">${esc(e.code)} · <span style="color:${g.color}">${esc(g.label)}</span></div>
        <b>${esc(e.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(e.docs[0]?.text ?? "")}</div></button>`;
    }).join("");
    const alive = state.staff.filter((s) => s.status !== "dead");
    const upg = alive.map((s) => `<div class="upg"><span>${esc(s.name)}</span>${Object.keys(STAT_LABELS).map((k) =>
      `<button data-act="upgrade" data-id="${s.id}" data-stat="${k}" title="${esc(STAT_LABELS[k])}"
        ${state.currency < BALANCE.statUpCost(s.stats[k]) || s.stats[k] >= 10 ? "disabled" : ""}>
        ${STAT_LABELS[k][0]}${s.stats[k]}↑ (${BALANCE.statUpCost(s.stats[k])})</button>`).join("")}</div>`).join("");
    m.innerHTML = `<div class="dialog"><h1>${state.day}일차 업무 종료</h1>
      <p>보유 ${esc(WORLD.currencyName)}: <b>${state.currency}</b></p>
      ${choices ? `<h2>신규 수용 개체 선택</h2><div class="choices">${choices}</div>` : `<p style="color:var(--muted)">${state.pool.length ? "개체를 수용했습니다." : "더 이상 수용할 개체가 없습니다."}</p>`}
      <h2>직원 관리</h2>${upg}
      <p><button data-act="hire" ${state.currency < BALANCE.hireCost || alive.length >= BALANCE.maxStaff ? "disabled" : ""}>직원 채용 (${BALANCE.hireCost})</button></p>
      <p><button data-act="nextDay" ${choices ? "disabled title='먼저 개체를 선택하세요'" : ""}>다음 날 시작 ▶</button></p></div>`;
  } else if (docCell != null) {
    const c = state.cells[docCell]; const e = G.getEntity(c.entityId); const g = GRADES[e.grade];
    const docs = e.docs.map((d) => c.workCount >= d.need
      ? `<p>${esc(d.text)}</p>` : `<p class="locked">[기밀 — 작업 ${d.need}회 필요]</p>`).join("");
    const known = c.workCount >= REVEAL_PREFS_AT;
    const prefs = Object.entries(WORK_TYPES).map(([k, w]) => `${w.label}: ${known ? PREF_LABEL[e.prefs[k] ?? "none"] : "???"}`).join(" · ");
    const traits = (e.traits ?? []).map((t) => TRAITS[t]).filter(Boolean);
    m.hidden = false;
    m.innerHTML = `<div class="dialog doc"><h1>${esc(e.code)} ${esc(e.name)}</h1>
      <div>등급 <b style="color:${g.color}">${esc(g.label)}</b> · 피해 유형 ${e.damage.type === "body" ? "신체" : "정신"} · 작업 ${c.workCount}회</div>
      <h2>작업 선호</h2><div>${prefs}</div>
      <h2>기록</h2>${docs}
      ${traits.length && c.workCount >= 6 ? `<h2>특이사항</h2><ul>${traits.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <button data-act="closeDoc">닫기</button></div>`;
  } else {
    m.hidden = true; m.innerHTML = "";
  }
}

function renderAll() { renderTop(); renderCells(); renderStaff(); renderLog(); }

// ---------- 입력 ----------
function idleStaff() { return state.staff.filter(G.isAvailable); }

function act(el) {
  const a = el.dataset.act;
  const cell = el.dataset.cell != null ? Number(el.dataset.cell) : null;
  switch (a) {
    case "speed": state.speed = Number(el.dataset.v); break;
    case "select": {
      const id = Number(el.dataset.id);
      const s = state.staff.find((x) => x.id === id);
      if (s && s.status !== "dead") selected = selected === id ? null : id;
      break;
    }
    case "work": {
      let s = state.staff.find((x) => x.id === selected);
      if (!s || !G.isAvailable(s)) s = idleStaff()[0];
      if (s) G.startWork(state, s.id, cell, el.dataset.w);
      break;
    }
    case "suppress": {
      const s = state.staff.find((x) => x.id === selected);
      const team = s && G.isAvailable(s) ? [s] : idleStaff();
      team.forEach((x) => G.startSuppress(state, x.id, cell));
      break;
    }
    case "doc": docCell = cell; renderModal(); break;
    case "closeDoc": docCell = null; renderModal(); break;
    case "endDay": if (G.canEndDay(state)) { G.endDay(state); G.save(state); } break;
    case "choose": G.chooseEntity(state, el.dataset.id); G.save(state); renderModal(); break;
    case "hire": G.hire(state); renderModal(); break;
    case "upgrade": G.upgradeStat(state, Number(el.dataset.id), el.dataset.stat); renderModal(); break;
    case "nextDay": G.startNextDay(state); G.save(state); break;
    case "restart":
      if (state.phase === "gameover" || confirm("진행 상황을 지우고 새 게임을 시작할까요?")) {
        G.clearSave(); state = G.newGame(); selected = null; docCell = null;
      }
      break;
  }
  renderAll();
}

// 화면이 자주 다시 그려지므로 click 대신 pointerdown 으로 받음
document.body.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  const el = ev.target.closest("[data-act]");
  if (el && !el.disabled) { ev.preventDefault(); act(el); }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === " ") { ev.preventDefault(); state.speed = state.speed === 0 ? 1 : 0; }
  if (["1", "2", "3"].includes(ev.key)) state.speed = Number(ev.key);
  if (ev.key === "Escape" && docCell != null) { docCell = null; renderModal(); }
});

// ---------- 루프 ----------
let last = performance.now();
let acc = 0;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  G.tick(state, dt);
  if (state.phase !== lastPhase) { lastPhase = state.phase; renderModal(); }
  acc += dt;
  if (acc >= 0.15) { acc = 0; renderAll(); }
  requestAnimationFrame(loop);
}
renderAll();
renderModal();
setInterval(() => { if (state.phase === "day") G.save(state); }, 5000);
requestAnimationFrame(loop);

// 디버그용
window.__game = { get state() { return state; }, G };
