// ===== 화면 / 입력 =====
import * as G from "./game.js";
import * as L from "./layout.js";
import {
  BALANCE, GRADES, STAT_LABELS, WORK_TYPES, WORLD, DEFAULT_STAFF_IMAGE, DEFAULT_ENTITY_IMAGE,
  STAFF_IMAGE_PRESETS, NAMETAG_COLORS,
} from "./data/config.js";
import { resolveImage, listImages, addImageFromFile, deleteImage } from "./images.js";
import { TRAITS } from "./data/entities.js";

let state = G.load() ?? G.newGame();
const ui = { staff: null, cell: null, doc: null, edit: null };
// ui.edit = { mode: "edit" | "hire", staffId, cand, draft: {name, image, color, memo}, prevSpeed, error }
let lastPhase = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
const fmtTime = (t) => { const r = Math.max(0, BALANCE.timePerDay - t); return `${Math.floor(r / 60)}:${String(Math.floor(r % 60)).padStart(2, "0")}`; };
const staffImg = (s) => resolveImage(s.image, DEFAULT_STAFF_IMAGE);
const entImg = (e) => resolveImage(e.image, DEFAULT_ENTITY_IMAGE);
const tagColor = (s) => s.color || "";
const PREF_LABEL = { high: "높음", mid: "보통", low: "낮음", none: "최악" };
const STATUS_LABEL = { idle: "대기", working: "작업 중", fighting: "진압 중", bound: "구속됨", panic: "패닉", dead: "사망" };
const REVEAL_PREFS_AT = 2;
const STAFF_H = 78;
const ENT_H = 120;

function setHTML(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }

// ================= 카메라 =================
const vp = $("viewport");
const world = $("world");
const cam = { x: 0, y: 0, s: 1 };
function applyCam() { world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`; }
function fitCam() {
  const lay = G.layoutOf();
  const narrow = innerWidth < 860;
  const w = innerWidth - (narrow ? 20 : 40);
  const h = innerHeight - (narrow ? 260 : 200);
  // 좁은 화면에서는 가로를 다 넣으면 글씨가 안 보이므로 세로 기준으로 맞추고 가로는 드래그로 이동
  cam.s = narrow
    ? Math.max(0.4, Math.min(0.56, h / lay.height))
    : Math.max(0.3, Math.min(1.2, w / lay.width, h / lay.height));
  cam.x = (innerWidth - lay.width * cam.s) / 2;
  if (narrow) {
    // 본부와 사용 중인 격리실이 함께 보이도록 가로 중심을 잡음
    const xs = [lay.main.x, lay.main.x + lay.main.w];
    state.cells.forEach((_, i) => { const r = lay.rooms[i]; if (r) xs.push(r.x, r.x + r.w); });
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    cam.x = (x1 - x0) * cam.s <= innerWidth - 24
      ? innerWidth / 2 - ((x0 + x1) / 2) * cam.s
      : 12 - x0 * cam.s;
  }
  cam.y = (narrow ? 112 : 110) + Math.max(0, (h - lay.height * cam.s) / 2);
  applyCam();
}
function zoomAt(f, px, py) {
  const ns = Math.max(0.3, Math.min(2.2, cam.s * f));
  cam.x = px - (px - cam.x) * (ns / cam.s);
  cam.y = py - (py - cam.y) * (ns / cam.s);
  cam.s = ns;
  applyCam();
}

// ================= 월드 =================
function buildWorld() {
  const lay = G.layoutOf();
  world.style.width = `${lay.width}px`;
  world.style.height = `${lay.height}px`;
  let html = "";
  const shaftTop = L.floorTop(0) + L.ROOM_H * 0.35;
  const shaftH = (lay.floors - 1) * L.FLOOR_H + L.ROOM_H * 0.65;
  for (const ex of lay.elevators) {
    html += `<div class="elev" style="left:${ex - L.ELEV_W / 2}px;top:${shaftTop}px;width:${L.ELEV_W}px;height:${shaftH}px"></div>`;
  }
  for (const seg of lay.segs) {
    const top = L.floorTop(seg.floor);
    if (seg.kind === "hall") {
      const h = L.ROOM_H * 0.62;
      html += `<div class="hall" style="left:${seg.x}px;top:${top + L.ROOM_H - h}px;width:${seg.w}px;height:${h}px"></div>`;
    } else if (seg.kind === "main") {
      html += `<div class="main-room" style="left:${seg.x}px;top:${top}px;width:${seg.w}px;height:${L.ROOM_H}px">
        <div class="label">${esc(WORLD.organizationName)} · 중앙 통제실</div>
        <div class="monitors"><i></i><i></i><i></i><i></i></div></div>`;
    } else {
      html += `<div class="room empty" data-slot="${seg.slot}" style="left:${seg.x}px;top:${top}px;width:${seg.w}px;height:${L.ROOM_H}px"></div>`;
    }
  }
  html += `<div id="actors"></div><div id="fx"></div>`;
  world.innerHTML = html;
  roomEls = [...world.querySelectorAll(".room")];
  actorEls.clear();
}
let roomEls = [];
const actorEls = new Map();

function renderRooms() {
  roomEls.forEach((el) => {
    const slot = Number(el.dataset.slot);
    const c = state.cells[slot];
    if (!c) {
      if (el.dataset.ent) { delete el.dataset.ent; delete el.dataset.act; el._h = null; }
      el.className = "room empty";
      setHTML(el, `<div class="seal"><b>봉인 구획</b><span>C-${String(slot + 1).padStart(2, "0")}</span></div>`);
      return;
    }
    const e = G.getEntity(c.entityId);
    const g = GRADES[e.grade];
    const room = G.roomOf(slot);
    if (el.dataset.ent !== e.id) {
      el.dataset.ent = e.id;
      el.dataset.act = "cell";
      el.dataset.cell = slot;
      el.style.setProperty("--grade", g.color);
      el.innerHTML = `<div class="glass"></div>
        <img class="ent" src="${esc(entImg(e))}" alt="" style="left:${L.entitySpot(room).x - room.x}px">
        <div class="plate"><span class="code">${esc(e.code)}</span><span class="rn">${esc(e.name)}</span><span class="gr">${esc(g.label)}</span></div>
        <div class="rfoot"><span class="stab"></span><span class="rstat"></span></div><div class="rprog"><i></i></div>`;
      el._h = null;
    }
    const worker = state.staff.find((s) => s.id === c.busy);
    el.className = `room${c.breached ? " breached" : ""}${worker?.task?.phase === "work" ? " busy" : ""}${ui.cell === slot ? " sel" : ""}`;
    el.querySelector(".ent").style.visibility = c.breached ? "hidden" : "";
    const stab = el.querySelector(".stab");
    stab.className = `stab${c.stability <= 1 ? " low" : ""}`;
    setHTML(stab, `<em>안정</em>${Array.from({ length: e.stability }, (_, k) => `<i class="${k < c.stability ? "f" : ""}"></i>`).join("")}`);
    let st = "";
    const t = worker?.task;
    if (c.breached) st = "격리 실패";
    else if (t?.phase === "work") st = `${WORK_TYPES[t.workType].label} ${t.done}/${t.units}`;
    else if (worker) st = `${worker.name} 이동 중`;
    setHTML(el.querySelector(".rstat"), esc(st));
    el.querySelector(".rprog i").style.width = t?.phase === "work" ? pct(t.done, t.units) : "0%";
  });
}

function actorEl(key, make) {
  let el = actorEls.get(key);
  if (!el) { el = make(); $("actors").appendChild(el); actorEls.set(key, el); }
  el._seen = true;
  return el;
}

function renderActors() {
  for (const el of actorEls.values()) el._seen = false;
  const aspect = 353 / 607;

  for (const s of state.staff) {
    const el = actorEl(`s${s.id}`, () => {
      const d = document.createElement("div");
      d.className = "actor staff";
      d.dataset.act = "staff"; d.dataset.id = s.id;
      d.style.width = `${Math.round(STAFF_H * aspect) + 10}px`; d.style.height = `${STAFF_H}px`;
      d.innerHTML = `<div class="tag"><span class="ico"></span><span class="nm"></span><div class="mini"><div class="bar hp"><i></i></div><div class="bar san"><i></i></div></div></div>
        <img class="body" src="${esc(staffImg(s))}" alt=""><div class="shadow"></div>`;
      return d;
    });
    const w = el.offsetWidth || 55;
    el.style.transform = `translate(${s.x - w / 2}px, ${L.feetY(s.fy) - STAFF_H}px)`;
    el.style.zIndex = s.status === "dead" ? 1 : 3;
    el.className = `actor staff ${s.status}${s.moving ? " walk" : ""}${s.dir < 0 ? " flip" : ""}${ui.staff === s.id ? " sel" : ""}`;
    const ico = { working: s.task?.phase === "work" ? "작업" : "", fighting: "진압", panic: "패닉", bound: "구속" }[s.status] ?? "";
    const icoEl = el.querySelector(".ico");
    icoEl.hidden = !ico;
    setHTML(icoEl, ico);
    setHTML(el.querySelector(".nm"), esc(s.name));
    const src = staffImg(s);
    const body = el.querySelector(".body");
    if (body._src !== src) { body._src = src; body.src = src; }
    el.style.setProperty("--tag", tagColor(s) || "#000b");
    el.querySelector(".hp i").style.width = pct(s.hp, G.maxHp(s));
    el.querySelector(".san i").style.width = pct(s.san, G.maxSan(s));
  }

  state.cells.forEach((c, i) => {
    if (!c.breached || !c.b) return;
    const e = G.getEntity(c.entityId);
    const el = actorEl(`b${i}`, () => {
      const d = document.createElement("div");
      d.className = "actor breach";
      d.dataset.act = "cell"; d.dataset.cell = i;
      d.style.width = "90px"; d.style.height = `${ENT_H}px`;
      d.innerHTML = `<div class="tag"><span class="nm">${esc(e.name)}</span><div class="mini"><div class="bar hp"><i></i></div></div></div>
        <img class="body" src="${esc(entImg(e))}" alt=""><div class="shadow"></div>`;
      return d;
    });
    el.style.transform = `translate(${c.b.x - 45}px, ${L.feetY(c.b.fy) - ENT_H}px)`;
    el.style.zIndex = 4;
    el.className = `actor breach${c.b.moving ? " walk" : ""}${c.b.dir < 0 ? " flip" : ""}`;
    el.querySelector(".hp i").style.width = pct(c.breachHp, e.breach.hp);
  });

  for (const [k, el] of actorEls) if (!el._seen) { el.remove(); actorEls.delete(k); }
}

function renderFx() {
  const layer = $("fx");
  for (const ev of state.events.splice(0)) {
    if (ev.type !== "float") continue;
    const d = document.createElement("div");
    d.className = `float ${ev.kind}`;
    d.textContent = ev.text;
    d.style.left = `${ev.x}px`;
    d.style.top = `${L.feetY(ev.fy) - (ev.kind === "hp" || ev.kind === "san" ? 100 : 150)}px`;
    d.addEventListener("animationend", () => d.remove());
    layer.appendChild(d);
  }
}

// ================= UI =================
function renderHud() {
  const done = state.dayData >= state.quota;
  const breaches = state.cells.filter((c) => c.breached).length;
  const left = BALANCE.timePerDay - state.time;
  const canEnd = G.canEndDay(state);
  setHTML($("hud"), `
    <div class="top"><span class="day">${state.day}일차</span><span class="org">${esc(WORLD.organizationName)} · ${esc(WORLD.facilityName)}</span>
      <span class="clock${left < 60 && !done ? " urgent" : ""}" title="남은 업무 시간">${fmtTime(state.time)}</span></div>
    <div class="quota"><span class="ql">${esc(WORLD.currencyName)}</span><span class="qv"><b>${state.dayData}</b><small>/ ${state.quota}</small></span></div>
    <div class="qbar ${done ? "done" : ""}"><i style="width:${pct(state.dayData, state.quota)}"></i></div>
    <div class="row"><span>보유 <b>${state.currency}</b></span>
      ${breaches ? `<span class="alarm">격리 실패 ${breaches}/${BALANCE.breachLimit}</span>` : ""}
      <button class="end${canEnd ? " ready" : ""}" data-act="endDay" ${canEnd ? "" : "disabled"}
        title="${done && !canEnd ? "탈출한 개체를 먼저 진압해야 합니다" : ""}">${done ? "업무 종료" : `${Math.max(0, state.quota - state.dayData)} 남음`}</button></div>`);
  $("hud").className = "ui box";
}

function renderControls() {
  const sp = [[0, "❚❚"], [1, "▶"], [2, "▶▶"], [3, "▶▶▶"]].map(([v, t]) =>
    `<button data-act="speed" data-v="${v}" class="${state.speed === v ? "on" : ""}">${t}</button>`).join("");
  setHTML($("controls"), `<span class="seg" role="group" aria-label="속도">${sp}</span><span class="sp"></span>
    <span class="seg" role="group" aria-label="화면"><button class="zm" data-act="zoom" data-v="0.8" aria-label="축소">－</button><button data-act="fit" aria-label="화면 맞춤">맞춤</button><button class="zm" data-act="zoom" data-v="1.25" aria-label="확대">＋</button></span>
    <button class="ghost" data-act="restart">새 게임</button>`);
}

function renderLog() {
  $("bottom").className = "ui box";
  setHTML($("log"), state.log.slice(0, 30).map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join(""));
}

function renderRoster() {
  $("roster").className = "ui box";
  setHTML($("roster"), state.staff.map((s) => `
    <div class="rs st-${s.status}${ui.staff === s.id ? " sel" : ""}" data-act="staff" data-id="${s.id}">
      <div class="face"><img src="${esc(staffImg(s))}" alt=""></div>
      <div class="nm" style="color:${esc(tagColor(s) || "inherit")}">${esc(s.name)}</div><div class="st">${STATUS_LABEL[s.status]}</div>
      <div class="bar hp"><i style="width:${pct(s.hp, G.maxHp(s))}"></i></div>
      <div class="bar san"><i style="width:${pct(s.san, G.maxSan(s))}"></i></div>
    </div>`).join(""));
}

function chosenStaff() {
  const s = state.staff.find((x) => x.id === ui.staff);
  return s && G.isAvailable(s) ? s : null;
}

function cellPanel(i) {
  const c = state.cells[i];
  const e = G.getEntity(c.entityId);
  const g = GRADES[e.grade];
  const known = c.workCount >= REVEAL_PREFS_AT;
  const worker = state.staff.find((s) => s.id === c.busy);
  const sel = chosenStaff();
  const idle = state.staff.filter(G.isAvailable);
  const pips = Array.from({ length: e.stability }, (_, k) => `<i class="${k < c.stability ? "f" : ""}"></i>`).join("");

  let body;
  if (c.breached) {
    const fighters = state.staff.filter((s) => s.status === "fighting" && s.task?.cellIdx === i);
    body = `<div class="sec"><h4>진압</h4>
      <div class="vbar"><span>내구</span><div class="bar hp"><i style="width:${pct(c.breachHp, e.breach.hp)}"></i></div><span>${Math.ceil(c.breachHp)}/${e.breach.hp}</span></div>
      <p class="hint">투입 중: ${fighters.map((f) => esc(f.name)).join(", ") || "없음"}</p>
      <button data-act="suppress" data-cell="${i}" ${idle.length ? "" : "disabled"} style="width:100%;margin-top:6px">
        ${sel ? `${esc(sel.name)} 투입` : `대기 직원 전원 투입 (${idle.length})`}</button></div>`;
  } else if (worker) {
    const t = worker.task;
    body = `<div class="sec"><h4>진행 중</h4><div>${esc(worker.name)} · ${WORK_TYPES[t.workType].label}
      ${t.phase === "move" ? "(이동 중)" : `${t.done}/${t.units} · 성공 ${t.success}`}</div>
      <div class="bar prog" style="margin-top:6px"><i style="width:${pct(t.done, t.units)}"></i></div></div>`;
  } else {
    const chips = idle.map((s) => `<button data-act="pick" data-id="${s.id}" class="${sel?.id === s.id ? "on" : ""}">${esc(s.name)}</button>`).join("");
    const who = sel ?? idle[0];
    const works = Object.entries(WORK_TYPES).map(([k, w]) => {
      const pk = e.prefs[k] ?? "none";
      const ch = who ? Math.round(G.successChance(who, e, k) * 100) : 0;
      return `<button class="wk${known ? ` p-${pk}` : ""}" data-act="work" data-cell="${i}" data-w="${k}" title="${esc(w.desc)}" ${who ? "" : "disabled"}>
        <span class="wl">${w.label}</span><span class="wc">${known && who ? `${ch}%` : "??"}</span>
        <small>${known ? `선호 ${PREF_LABEL[pk]}` : "선호 미확인"}</small>
        <span class="wb"><i style="width:${known && who ? ch : 0}%"></i></span></button>`;
    }).join("");
    body = `<div class="sec"><h4>배정 직원</h4><div class="chips">${chips || '<span class="hint">대기 중인 직원 없음</span>'}</div>
      ${!sel && who ? `<p class="hint">선택 안 하면 ${esc(who.name)}이(가) 갑니다.</p>` : ""}</div>
      <div class="sec"><h4>작업</h4><div class="works">${works}</div>
      ${known ? "" : `<p class="hint">작업 ${REVEAL_PREFS_AT}회 후 선호도가 밝혀집니다.</p>`}</div>`;
  }
  return `<div class="ph" style="--grade:${g.color}">
      <div class="portrait"><img src="${esc(entImg(e))}" alt=""></div>
      <div><div class="sub">${esc(e.code)} · <b style="color:${g.color}">${esc(g.label)}</b></div><h3>${esc(e.name)}</h3>
        <div class="sub">피해 ${e.damage.type === "body" ? "신체" : "정신"} · 작업 ${c.workCount}회</div>
        <div class="pips">${pips}</div>
        <button data-act="doc" data-cell="${i}" style="margin-top:8px;padding:3px 10px">문서 열람</button></div>
      <button class="x" data-act="close">✕</button></div>${body}`;
}

function staffPanel(s) {
  const st = s.stats;
  let task = STATUS_LABEL[s.status];
  if (s.task?.kind === "work") task = `${G.getEntity(state.cells[s.task.cellIdx].entityId).code} ${WORK_TYPES[s.task.workType].label} ${s.task.phase === "move" ? "(이동 중)" : `${s.task.done}/${s.task.units}`}`;
  if (s.task?.kind === "fight") task = `${G.getEntity(state.cells[s.task.cellIdx].entityId).name} 진압 중`;
  return `<div class="ph"><div class="portrait face"><img src="${esc(staffImg(s))}" alt=""></div>
      <div><div class="sub">직원 #${s.id}</div><h3 style="color:${esc(tagColor(s) || "inherit")}">${esc(s.name)}</h3><div class="sub">${esc(task)}</div><div class="sub">작업 ${s.works}회</div>
        ${s.status !== "dead" ? `<button data-act="editStaff" data-id="${s.id}" style="margin-top:8px;padding:3px 10px">✎ 꾸미기</button>` : ""}</div>
      <button class="x" data-act="close">✕</button></div>
    <div class="sec">
      <div class="vbar"><span>체력</span><div class="bar hp"><i style="width:${pct(s.hp, G.maxHp(s))}"></i></div><span>${Math.ceil(s.hp)}/${G.maxHp(s)}</span></div>
      <div class="vbar"><span>정신력</span><div class="bar san"><i style="width:${pct(s.san, G.maxSan(s))}"></i></div><span>${Math.ceil(s.san)}/${G.maxSan(s)}</span></div></div>
    ${s.memo ? `<div class="sec"><h4>메모</h4><div style="white-space:pre-wrap">${esc(s.memo)}</div></div>` : ""}
    <div class="sec"><h4>능력치</h4><div class="stats">
      ${Object.keys(STAT_LABELS).map((k) => `<div title="${esc(STAT_LABELS[k])}"><span>${esc(STAT_LABELS[k].split(" ")[0])}</span><b>${st[k]}</b></div>`).join("")}</div></div>
    ${s.status === "fighting" ? `<div class="sec"><button data-act="recall" data-id="${s.id}" style="width:100%">후퇴</button></div>` : ""}
    ${G.isAvailable(s) ? `<div class="sec"><p class="hint" style="margin:0">격리실을 눌러 작업을 지시하세요.</p></div>` : ""}`;
}

function renderPanel() {
  const p = $("panel");
  let html = "";
  if (ui.cell != null && state.cells[ui.cell]) html = cellPanel(ui.cell);
  else if (ui.staff != null) {
    const s = state.staff.find((x) => x.id === ui.staff);
    if (s) html = staffPanel(s);
  }
  p.hidden = !html;
  p.className = "ui box";
  setHTML(p, html);
}

function editorHTML() {
  const ed = ui.edit;
  const d = ed.draft;
  const s = ed.mode === "hire" ? ed.cand : state.staff.find((x) => x.id === ed.staffId);
  const uploads = listImages();
  const imgs = [...STAFF_IMAGE_PRESETS, ...uploads];
  const gallery = imgs.map((ref) => `<div class="gi${(d.image || DEFAULT_STAFF_IMAGE) === ref ? " on" : ""}">
      <button data-act="edImg" data-ref="${esc(ref)}"><img src="${esc(resolveImage(ref, DEFAULT_STAFF_IMAGE))}" alt=""></button>
      ${ref.startsWith("img:") ? `<button class="del" data-act="edDel" data-ref="${esc(ref)}" title="보관함에서 삭제">✕</button>` : ""}</div>`).join("");
  const colors = ["", ...NAMETAG_COLORS].map((c) => `<button class="sw${(d.color || "") === c ? " on" : ""}" data-act="edColor" data-c="${c}"
      style="background:${c || "#000b"}" title="${c ? c : "기본"}"></button>`).join("");
  const stats = Object.keys(STAT_LABELS).map((k) => `<div><span>${esc(STAT_LABELS[k].split(" ")[0])}</span><b>${s.stats[k]}</b></div>`).join("");
  return `<div class="dialog editor">
    <h1>${ed.mode === "hire" ? "신규 직원 채용" : "직원 꾸미기"}</h1>
    <div class="ed-grid">
      <div class="ed-prev">
        <div class="stage"><span class="nm" style="--tag:${esc(d.color || "#000b")}">${esc(d.name || "이름 없음")}</span>
          <img src="${esc(resolveImage(d.image, DEFAULT_STAFF_IMAGE))}" alt=""></div>
        <div class="stats">${stats}</div>
        ${ed.mode === "hire" ? `<button data-act="edReroll" style="width:100%;margin-top:8px">능력치 다시 뽑기</button>` : ""}
      </div>
      <div>
        <label class="fl">이름<input id="ed-name" maxlength="12" value="${esc(d.name)}" autocomplete="off"></label>
        <h2>이미지</h2>
        <div class="gallery">${gallery}
          <label class="gi up" title="이미지 올리기">＋<br><small>업로드</small><input id="ed-file" type="file" accept="image/*" hidden></label></div>
        <p class="hint">투명 배경 PNG 추천. 여백은 자동으로 잘라줌. 올린 이미지는 이 브라우저에 보관됨.</p>
        ${ed.error ? `<p class="err">${esc(ed.error)}</p>` : ""}
        <h2>이름표 색</h2><div class="swatches">${colors}</div>
        <label class="fl">메모<textarea id="ed-memo" rows="3" maxlength="200" placeholder="설정, 성격, 특징 등">${esc(d.memo)}</textarea></label>
      </div>
    </div>
    <div class="ed-btns">
      <button data-act="edCancel">취소</button>
      <button class="on" data-act="edSave">${ed.mode === "hire" ? `채용 (${BALANCE.hireCost})` : "저장"}</button>
    </div></div>`;
}

function openEditor(mode, s) {
  ui.edit = {
    mode, staffId: s.id, cand: mode === "hire" ? s : null,
    draft: { name: s.name, image: s.image, color: s.color, memo: s.memo || "" },
    prevSpeed: state.speed, error: "",
  };
  if (state.phase === "day") state.speed = 0;
  renderModal();
}
function closeEditor() {
  if (state.phase === "day") state.speed = ui.edit.prevSpeed;
  ui.edit = null;
  renderModal();
}

function renderModal() {
  const m = $("modal");
  if (ui.edit && state.phase !== "gameover") {
    m.hidden = false;
    setHTML(m, editorHTML());
  } else if (state.phase === "gameover") {
    m.hidden = false;
    setHTML(m, `<div class="dialog"><h1>시설 폐쇄</h1><p>${esc(state.gameOverReason)}</p>
      <p>${state.day}일차까지 버텼습니다. 격리 개체 ${state.cells.length}종.</p>
      <button data-act="restart">처음부터</button></div>`);
  } else if (state.phase === "dayEnd") {
    m.hidden = false;
    const choices = state.choices.map((id) => {
      const e = G.getEntity(id); const g = GRADES[e.grade];
      return `<button class="choice" style="--grade:${g.color}" data-act="choose" data-id="${id}"><img src="${esc(entImg(e))}" alt="">
        <span><div class="sub">${esc(e.code)} · <span style="color:${g.color}">${esc(g.label)}</span></div>
        <b>${esc(e.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(e.docs[0]?.text ?? "")}</div></span></button>`;
    }).join("");
    const alive = state.staff.filter((s) => s.status !== "dead");
    const keys = Object.keys(STAT_LABELS);
    const head = keys.map((k) => `<th title="${esc(STAT_LABELS[k])}">${esc(STAT_LABELS[k].split(" ")[0])}</th>`).join("");
    const rows = alive.map((s) => `<tr><td class="who"><img src="${esc(staffImg(s))}" alt=""><span>${esc(s.name)}</span>
        <button class="ghost sm" data-act="editStaff" data-id="${s.id}">꾸미기</button></td>
      ${keys.map((k) => {
        const cost = BALANCE.statUpCost(s.stats[k]);
        const max = s.stats[k] >= 10;
        return `<td><b>${s.stats[k]}</b><button class="up" data-act="upgrade" data-id="${s.id}" data-stat="${k}"
          ${state.currency < cost || max ? "disabled" : ""} aria-label="${esc(s.name)} ${esc(STAT_LABELS[k])} 올리기">${max ? "최대" : `+ ${cost}`}</button></td>`;
      }).join("")}</tr>`).join("");
    const acc = ui.accepted ? G.getEntity(ui.accepted) : null;
    const accepted = acc ? `<div class="accepted" style="--grade:${GRADES[acc.grade].color}"><img src="${esc(entImg(acc))}" alt="">
        <span><span class="sub">수용 완료</span><b>${esc(acc.code)} ${esc(acc.name)}</b></span></div>` : "";
    setHTML(m, `<div class="dialog dayend"><div class="dh"><h1>${state.day}일차 업무 종료</h1>
        <span class="wallet">보유 ${esc(WORLD.currencyName)} <b>${state.currency}</b></span></div>
      ${choices ? `<h2>신규 수용 개체 · 하나를 고르세요</h2><div class="choices">${choices}</div>`
        : accepted || `<p class="hint">더 이상 수용할 개체가 없습니다.</p>`}
      <h2>직원 강화</h2>
      <div class="tbl"><table><thead><tr><th>직원</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="df">
        <button data-act="hire" ${G.canHire(state) ? "" : "disabled"}>직원 채용 · ${BALANCE.hireCost}</button>
        <span class="sp"></span>
        ${choices ? `<span class="hint">개체를 고르면 시작할 수 있어요</span>` : ""}
        <button class="primary" data-act="nextDay" ${choices ? "disabled" : ""}>${state.day + 1}일차 시작</button>
      </div></div>`);
  } else if (ui.doc != null) {
    const c = state.cells[ui.doc]; const e = G.getEntity(c.entityId); const g = GRADES[e.grade];
    const docs = e.docs.map((d) => c.workCount >= d.need
      ? `<p>${esc(d.text)}</p>` : `<p class="locked">[기밀 — 작업 ${d.need}회 필요]</p>`).join("");
    const known = c.workCount >= REVEAL_PREFS_AT;
    const prefs = Object.entries(WORK_TYPES).map(([k, w]) => `${w.label}: ${known ? PREF_LABEL[e.prefs[k] ?? "none"] : "???"}`).join(" · ");
    const traits = (e.traits ?? []).map((t) => TRAITS[t]).filter(Boolean);
    m.hidden = false;
    setHTML(m, `<div class="dialog doc"><div style="display:flex;gap:16px;align-items:flex-end">
        <img src="${esc(entImg(e))}" alt="" style="height:140px">
        <div><h1 style="margin:0">${esc(e.code)} ${esc(e.name)}</h1>
        <div>등급 <b style="color:${g.color}">${esc(g.label)}</b> · 피해 유형 ${e.damage.type === "body" ? "신체" : "정신"} · 작업 ${c.workCount}회</div></div></div>
      <h2>작업 선호</h2><div>${prefs}</div>
      <h2>기록</h2>${docs}
      ${traits.length && c.workCount >= 6 ? `<h2>특이사항</h2><ul>${traits.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <button data-act="closeDoc">닫기</button></div>`);
  } else {
    m.hidden = true; setHTML(m, "");
  }
}

function renderUI() { renderHud(); renderControls(); renderLog(); renderRoster(); renderPanel(); }

// ================= 입력 =================
function act(el) {
  const a = el.dataset.act;
  const cell = el.dataset.cell != null ? Number(el.dataset.cell) : null;
  const id = el.dataset.id != null ? Number(el.dataset.id) : null;
  switch (a) {
    case "speed": state.speed = Number(el.dataset.v); break;
    case "zoom": zoomAt(Number(el.dataset.v), innerWidth / 2, innerHeight / 2); break;
    case "fit": fitCam(); break;
    case "staff": {
      const s = state.staff.find((x) => x.id === id);
      if (!s) break;
      if (ui.staff === id && ui.cell == null) ui.staff = null;
      else { ui.staff = id; if (!(ui.cell != null && G.isAvailable(s))) ui.cell = null; }
      break;
    }
    case "pick": ui.staff = ui.staff === id ? null : id; break;
    case "cell": ui.cell = cell; break;
    case "close": ui.cell = null; ui.staff = null; break;
    case "work": {
      const s = chosenStaff() ?? state.staff.find(G.isAvailable);
      if (s && G.startWork(state, s.id, cell, el.dataset.w)) { ui.cell = null; ui.staff = null; }
      break;
    }
    case "suppress": {
      const s = chosenStaff();
      (s ? [s] : state.staff.filter(G.isAvailable)).forEach((x) => G.startSuppress(state, x.id, cell));
      break;
    }
    case "recall": G.recall(state, id); break;
    case "doc": ui.doc = cell; renderModal(); break;
    case "closeDoc": ui.doc = null; renderModal(); break;
    case "endDay": if (G.canEndDay(state)) { G.endDay(state); G.save(state); } break;
    case "choose": G.chooseEntity(state, el.dataset.id); ui.accepted = el.dataset.id; G.save(state); renderModal(); break;
    case "hire": if (G.canHire(state)) openEditor("hire", G.rollStaff(state)); break;
    case "editStaff": { const s = state.staff.find((x) => x.id === id); if (s) openEditor("edit", s); break; }
    case "edImg": ui.edit.draft.image = el.dataset.ref === DEFAULT_STAFF_IMAGE ? null : el.dataset.ref; renderModal(); break;
    case "edDel":
      if (confirm("이 이미지를 보관함에서 지울까요? 이 이미지를 쓰는 직원은 기본 이미지로 바뀝니다.")) {
        deleteImage(el.dataset.ref);
        if (ui.edit.draft.image === el.dataset.ref) ui.edit.draft.image = null;
        renderModal();
      }
      break;
    case "edColor": ui.edit.draft.color = el.dataset.c || null; renderModal(); break;
    case "edReroll": {
      const c = G.rollStaff(state);
      ui.edit.cand.stats = c.stats; ui.edit.cand.hp = c.hp; ui.edit.cand.san = c.san;
      renderModal(); break;
    }
    case "edCancel": closeEditor(); break;
    case "edSave": {
      const ed = ui.edit;
      const d = { ...ed.draft, name: ed.draft.name.trim() || "이름 없음" };
      if (ed.mode === "hire") { Object.assign(ed.cand, d); G.hireStaff(state, ed.cand); }
      else G.editStaff(state, ed.staffId, d);
      G.save(state);
      closeEditor();
      break;
    }
    case "upgrade": G.upgradeStat(state, id, el.dataset.stat); renderModal(); break;
    case "nextDay": G.startNextDay(state); ui.accepted = null; G.save(state); break;
    case "restart":
      if (state.phase === "gameover" || confirm("진행 상황을 지우고 새 게임을 시작할까요?")) {
        G.clearSave(); state = G.newGame(); ui.staff = ui.cell = ui.doc = null;
      }
      break;
  }
  renderUI(); renderRooms(); renderActors();
}

// UI 패널은 자주 다시 그려지므로 pointerdown 에서 바로 처리.
// 맵 위에서는 드래그(이동)와 클릭을 구분해서 pointerup 에서 처리.
const pointers = new Map();
let drag = null;
document.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest("#viewport")) {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) drag = { sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y, moved: false, target: ev.target };
    else { drag = null; pinch = null; }
    return;
  }
  if (ev.button !== 0) return;
  const el = ev.target.closest("[data-act]");
  if (el && !el.disabled) { ev.preventDefault(); act(el); }
});
let pinch = null;
document.addEventListener("pointermove", (ev) => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = d;
    return;
  }
  if (!drag) return;
  const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; vp.classList.add("drag"); }
  if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; applyCam(); }
});
function endPointer(ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && pointers.size === 0) {
    if (!drag.moved) {
      const el = drag.target.closest("[data-act]");
      if (el) act(el);
      else { ui.cell = null; renderUI(); renderRooms(); }
    }
    drag = null;
    vp.classList.remove("drag");
  }
}
document.addEventListener("pointerup", endPointer);
document.addEventListener("pointercancel", endPointer);
vp.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX, ev.clientY); }, { passive: false });
addEventListener("resize", fitCam);

// 편집기 입력칸
document.addEventListener("input", (ev) => {
  if (!ui.edit) return;
  if (ev.target.id === "ed-name") ui.edit.draft.name = ev.target.value;
  if (ev.target.id === "ed-memo") ui.edit.draft.memo = ev.target.value;
});
document.addEventListener("change", async (ev) => {
  if (ev.target.id !== "ed-file" || !ui.edit) return;
  const file = ev.target.files?.[0];
  if (!file) return;
  try { ui.edit.draft.image = await addImageFromFile(file); ui.edit.error = ""; }
  catch (e) { ui.edit.error = e.message; }
  renderModal();
});

document.addEventListener("keydown", (ev) => {
  if (ev.target.closest?.("input, textarea")) return;
  if (ev.key === " ") { ev.preventDefault(); state.speed = state.speed === 0 ? 1 : 0; }
  if (["1", "2", "3"].includes(ev.key)) state.speed = Number(ev.key);
  if (ev.key === "Escape") {
    if (ui.edit) closeEditor();
    else if (ui.doc != null) { ui.doc = null; renderModal(); } else { ui.cell = null; ui.staff = null; }
  }
});

// ================= 루프 =================
let last = performance.now();
let acc = 0;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  G.tick(state, dt);
  if (state.phase !== lastPhase) { lastPhase = state.phase; renderModal(); }
  renderActors();
  renderFx();
  acc += dt;
  if (acc >= 0.2) { acc = 0; renderUI(); renderRooms(); }
  requestAnimationFrame(loop);
}

buildWorld();
fitCam();
renderUI(); renderRooms(); renderActors(); renderModal();
setInterval(() => { if (state.phase === "day") G.save(state); }, 5000);
requestAnimationFrame(loop);

// 디버그용
window.__game = { get state() { return state; }, G, ui };
