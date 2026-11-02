// ===== 시설 배치 (월드 좌표, px) =====
// 0층: 중앙 본부(직원 대기실). 1층부터: 층마다 격리실 3칸.
// 양 끝에 엘리베이터 통로가 모든 층을 잇는다.

export const ROOM_W = 260;
export const ROOM_H = 180;
export const HALL_W = 90;
export const ELEV_W = 70;
export const FLOOR_H = 250;
export const PAD = 60;
export const ROOMS_PER_FLOOR = 3;

const ROW_W = HALL_W * (ROOMS_PER_FLOOR + 1) + ROOM_W * ROOMS_PER_FLOOR;
export const MAIN_W = 440;
export const WORLD_W = ROW_W + ELEV_W * 2;

export const floorTop = (fy) => PAD + fy * FLOOR_H;
export const feetY = (fy) => floorTop(fy) + ROOM_H - 12;

const cache = new Map();

/** totalSlots: 화면에 그릴 격리실 칸 수 (보유 개체 + 빈 칸) */
export function getLayout(totalSlots) {
  if (cache.has(totalSlots)) return cache.get(totalSlots);
  const floors = 1 + Math.max(1, Math.ceil(totalSlots / ROOMS_PER_FLOOR));
  const segs = [];
  const rooms = [];
  const left = ELEV_W;

  // 0층
  const sideHall = (ROW_W - MAIN_W) / 2;
  segs.push({ kind: "hall", floor: 0, x: left, w: sideHall });
  const main = { kind: "main", floor: 0, x: left + sideHall, w: MAIN_W };
  segs.push(main);
  segs.push({ kind: "hall", floor: 0, x: left + sideHall + MAIN_W, w: sideHall });

  // 격리 층
  for (let f = 1; f < floors; f++) {
    let x = left;
    for (let k = 0; k < ROOMS_PER_FLOOR; k++) {
      segs.push({ kind: "hall", floor: f, x, w: HALL_W });
      x += HALL_W;
      const slot = (f - 1) * ROOMS_PER_FLOOR + k;
      const room = { kind: "room", floor: f, x, w: ROOM_W, slot };
      segs.push(room);
      rooms.push(room);
      x += ROOM_W;
    }
    segs.push({ kind: "hall", floor: f, x, w: HALL_W });
  }

  const layout = {
    key: totalSlots,
    floors,
    segs,
    rooms,
    main,
    elevators: [ELEV_W / 2, WORLD_W - ELEV_W / 2],
    width: WORLD_W,
    height: PAD * 2 + (floors - 1) * FLOOR_H + ROOM_H,
  };
  cache.set(totalSlots, layout);
  return layout;
}

/** 격리실 안에서 직원이 서는 위치 / 개체가 있는 위치 */
export const workerSpot = (room) => ({ floor: room.floor, x: room.x + room.w * 0.28 });
export const entitySpot = (room) => ({ floor: room.floor, x: room.x + room.w * 0.68 });
