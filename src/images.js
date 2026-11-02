// ===== 업로드한 이미지 보관함 =====
// 플레이어가 게임 안에서 올린 이미지는 브라우저(localStorage)에 저장된다.
// 새 게임을 시작해도 지워지지 않는다. 직원/개체의 image 값이 "img:<id>" 이면 여기서 찾는다.

const KEY = "ttakspice-images";
const MAX_H = 360;
let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { store = {}; }
const urls = new Map(); // id -> blob URL (긴 dataURL을 매번 DOM에 넣지 않으려고)

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}

function dataUrlToBlobUrl(d) {
  const [head, b64] = d.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

/** image 값 → <img src> 로 쓸 수 있는 주소 */
export function resolveImage(src, fallback) {
  if (!src) return fallback;
  if (!src.startsWith("img:")) return src;
  const id = src.slice(4);
  if (!store[id]) return fallback;
  if (!urls.has(id)) urls.set(id, dataUrlToBlobUrl(store[id]));
  return urls.get(id);
}

export function listImages() { return Object.keys(store).map((id) => `img:${id}`); }

export function deleteImage(ref) {
  const id = ref.slice(4);
  delete store[id];
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  persist();
}

/** 파일 → 투명 여백 자르기 → 크기 줄이기 → 저장. "img:<id>" 반환 */
export async function addImageFromFile(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("이미지를 읽을 수 없습니다."));
      i.src = src;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    // 투명 여백 자르기
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = width - 1; y1 = height - 1; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const scale = Math.min(1, MAX_H / ch);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cw * scale));
    out.height = Math.max(1, Math.round(ch * scale));
    out.getContext("2d").drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL("image/png");
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    store[id] = dataUrl;
    if (!persist()) { delete store[id]; throw new Error("저장 공간이 부족합니다. 안 쓰는 이미지를 지워주세요."); }
    return `img:${id}`;
  } finally {
    URL.revokeObjectURL(src);
  }
}
