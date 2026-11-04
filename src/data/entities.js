// ===== 격리 개체 데이터 =====
// 너희 세계관의 개체(SCP 같은 것)를 여기에 추가하면 게임에 바로 등장함.
// 아래 예시 개체들은 전부 자리표시용이니 마음대로 지우거나 고쳐도 됨.
//
// 필드 설명
//  id           : 고유 ID (영문/숫자)
//  code         : 문서 번호 (예: "TK-001")
//  name         : 이름
//  grade        : 위험 등급 1~4 (config.js 의 GRADES)
//  dataPerWork  : 작업 1회당 최대 생산량(작업 단위 수)
//  damage       : { type: "body" | "mind", amount: [최소, 최대] } — 작업 실패 시 피해
//  stability    : 안정도 최대치. 0이 되면 격리 실패(탈출)
//  prefs        : 작업 종류별 선호도 (high/mid/low/none)
//  breach       : 탈출 시 전투 능력 { hp, attack, interval(초) }
//  gear         : 장비 (선택). { weapon: { name, cost, atk }, suit: { name, cost, body, mind } }
//                 빠진 값은 등급으로 자동 계산. body/mind 는 받는 피해 감소율(0~1)
//  traits       : 특수 규칙 (아래 'TRAITS' 참고, 선택)
//  image        : 이미지 경로 (선택, 없으면 config.js 의 DEFAULT_ENTITY_IMAGE)
//  docs         : 연구 단계별로 공개되는 문서. 작업 횟수가 need 이상이면 해금
//  flavor       : 작업 결과별 대사(선택)

export const ENTITIES = [
  {
    id: "lantern",
    code: "TK-001",
    name: "꺼지지 않는 등불",
    grade: 1,
    dataPerWork: 10,
    damage: { type: "mind", amount: [1, 3] },
    stability: 3,
    prefs: { observe: "high", maintain: "mid", commune: "mid", restrain: "low" },
    breach: { hp: 40, attack: 3, interval: 2 },
    gear: { weapon: { name: "기다림의 심지" }, suit: { name: "황동 갓 외투" } },
    traits: [],
    docs: [
      { need: 0, text: "구식 황동 등불. 연료 없이 3년째 타오르고 있다." },
      { need: 3, text: "등불을 오래 바라본 직원은 '누군가를 기다리는 느낌'을 보고한다." },
      { need: 6, text: "불빛을 가리면 안정도가 떨어진다. 통제 작업 비권장." },
    ],
    flavor: {
      good: "불빛이 따뜻하게 일렁인다.",
      bad: "불꽃이 직원 쪽으로 몸을 기울였다.",
    },
  },
  {
    id: "choir",
    code: "TK-014",
    name: "빈 교실의 합창",
    grade: 2,
    dataPerWork: 14,
    damage: { type: "mind", amount: [2, 5] },
    stability: 3,
    prefs: { observe: "mid", maintain: "low", commune: "high", restrain: "none" },
    breach: { hp: 70, attack: 5, interval: 2 },
    gear: { weapon: { name: "음표 지휘봉" }, suit: { name: "합창단 교복" } },
    traits: ["lonely"],
    docs: [
      { need: 0, text: "아무도 없는 교실 모형에서 아이들의 노랫소리가 들린다." },
      { need: 3, text: "같은 직원이 연속으로 교감하면 노래가 밝아진다." },
      { need: 6, text: "[lonely] 오랫동안 아무도 작업하지 않으면 안정도가 저절로 떨어진다." },
    ],
  },
  {
    id: "stitched",
    code: "TK-027",
    name: "꿰매진 손님",
    grade: 3,
    dataPerWork: 18,
    damage: { type: "body", amount: [4, 8] },
    stability: 2,
    prefs: { observe: "low", maintain: "high", commune: "none", restrain: "mid" },
    breach: { hp: 140, attack: 9, interval: 1.6 },
    gear: { weapon: { name: "재봉 가위" }, suit: { name: "누빈 앞치마" } },
    traits: ["hungry"],
    docs: [
      { need: 0, text: "천 조각을 이어 붙인 인간형 개체. 항상 식탁에 앉아 있다." },
      { need: 3, text: "관리 작업 시 '식사'를 제공하면 얌전해진다." },
      { need: 6, text: "[hungry] 작업 결과가 '보통'이어도 안정도가 떨어진다. 반드시 '좋음'을 노릴 것." },
    ],
  },
  {
    id: "mirrorwell",
    code: "TK-033",
    name: "거울 우물",
    grade: 2,
    dataPerWork: 12,
    damage: { type: "mind", amount: [2, 4] },
    stability: 4,
    prefs: { observe: "high", maintain: "low", commune: "mid", restrain: "mid" },
    breach: { hp: 60, attack: 4, interval: 1.5 },
    gear: { weapon: { name: "물거울 단도" }, suit: { name: "반사 망토" } },
    traits: ["mirror"],
    docs: [
      { need: 0, text: "들여다보면 바닥 대신 자기 얼굴만 보이는 우물." },
      { need: 4, text: "[mirror] 정신력이 절반 이하인 직원이 작업하면 실패 확률이 크게 오른다." },
    ],
  },
  {
    id: "redthread",
    code: "TK-048",
    name: "붉은 실타래",
    grade: 4,
    dataPerWork: 24,
    damage: { type: "body", amount: [6, 12] },
    stability: 2,
    prefs: { observe: "mid", maintain: "none", commune: "low", restrain: "high" },
    breach: { hp: 220, attack: 14, interval: 1.4 },
    gear: { weapon: { name: "붉은 인연" }, suit: { name: "실타래 코트" } },
    traits: ["binding"],
    docs: [
      { need: 0, text: "스스로 풀리고 감기는 붉은 실. 끝이 어디에도 묶여 있지 않다." },
      { need: 4, text: "[binding] 작업이 '나쁨'이면 해당 직원이 일정 시간 움직이지 못한다." },
      { need: 8, text: "실은 격리 구역 밖 누군가와 연결되어 있다는 가설이 있다." },
    ],
  },
  {
    id: "rainclerk",
    code: "TK-052",
    name: "비 오는 날의 접수원",
    grade: 1,
    dataPerWork: 8,
    damage: { type: "body", amount: [1, 2] },
    stability: 4,
    prefs: { observe: "mid", maintain: "high", commune: "high", restrain: "low" },
    breach: { hp: 30, attack: 2, interval: 2.5 },
    gear: { weapon: { name: "젖은 도장" }, suit: { name: "투명 우비" } },
    traits: ["healer"],
    docs: [
      { need: 0, text: "젖은 우비를 입은 접수원. '예약하셨나요?'라고만 묻는다." },
      { need: 3, text: "[healer] '좋음' 결과 시 작업 직원의 정신력이 회복된다." },
    ],
  },
];

// 특수 규칙 설명 (게임 로직은 src/game.js 의 applyTraits 참고)
export const TRAITS = {
  lonely: "오래 방치하면 안정도가 저절로 감소",
  hungry: "'보통' 결과에도 안정도 감소",
  mirror: "정신력이 낮은 직원은 실패 확률 증가",
  binding: "'나쁨' 결과 시 직원이 묶임",
  healer: "'좋음' 결과 시 직원 정신력 회복",
};
