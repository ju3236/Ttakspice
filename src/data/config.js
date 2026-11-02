// ===== 세계관 / 밸런스 설정 =====
// 시설 이름, 등급 체계, 작업 종류 등을 여기서 자유롭게 바꾸세요.

export const WORLD = {
  facilityName: "제7 격리구역",
  organizationName: "TTAK 재단",          // ← 너희 세계관 조직 이름으로 교체
  currencyName: "관측 데이터",
};

// 위험 등급 (낮은 순서 → 높은 순서)
export const GRADES = {
  1: { label: "청록", color: "#3fb8a6", stabilityBonus: 2 },
  2: { label: "황색", color: "#e0b341", stabilityBonus: 1 },
  3: { label: "적색", color: "#e0573f", stabilityBonus: 0 },
  4: { label: "흑색", color: "#9b59d0", stabilityBonus: -1 },
};

// 작업 종류. 각 개체는 작업마다 선호도(high/mid/low/none)를 가짐.
export const WORK_TYPES = {
  observe:  { label: "관측", desc: "기록 장비로 개체를 관찰한다.", stat: "focus" },
  maintain: { label: "관리", desc: "격리실 환경과 개체 상태를 유지한다.", stat: "grit" },
  commune:  { label: "교감", desc: "개체와 직접 소통을 시도한다.", stat: "calm" },
  restrain: { label: "통제", desc: "물리적·의식적 억제 절차를 시행한다.", stat: "agility" },
};

export const PREFERENCE_CHANCE = { high: 0.85, mid: 0.6, low: 0.35, none: 0.12 };

export const STAT_LABELS = {
  grit: "근성 (최대 체력)",
  calm: "침착 (최대 정신력)",
  focus: "집중 (작업 성공률)",
  agility: "기민 (작업·이동 속도)",
};

export const BALANCE = {
  startingStaff: 4,
  startingQuota: 30,
  quotaGrowth: 12,          // 하루마다 할당량 증가
  tickMs: 100,              // 실제 시간 1틱
  workTickSeconds: 0.6,     // 작업 1단위 소요 (게임 시간)
  hireCost: 40,
  statUpCost: (level) => 10 + level * 8,
  maxStaff: 10,
  breachLimit: 3,           // 동시에 탈출한 개체가 이 수 이상이면 시설 붕괴(게임 오버)
  timePerDay: 300,          // 하루 제한 시간(게임 초)
};

// ===== 이미지 =====
// 투명 배경 PNG 권장. 캐릭터 주변 여백은 최대한 잘라낼 것 (발이 이미지 맨 아래에 오도록).
export const DEFAULT_STAFF_IMAGE = "assets/staff/default.png";
export const DEFAULT_ENTITY_IMAGE = "assets/entities/placeholder.png";

// 고정 직원 캐릭터. 여기 적은 순서대로 먼저 등장하고, 다 쓰면 아래 STAFF_NAMES 에서 랜덤 이름.
// 예: { name: "냥이", image: "assets/staff/nyang.png" }
export const STAFF_ROSTER = [
  // { name: "캐릭터 이름", image: "assets/staff/파일이름.png" },
];

export const STAFF_NAMES = [
  "한서윤", "도건우", "김하람", "이준", "박새벽", "최다온", "윤이든", "정로아",
  "강태오", "오세린", "임채운", "신우주", "배하늘", "류시안", "문가을", "남궁별",
];
