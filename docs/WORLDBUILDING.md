# 세계관 설정

> 여기에 세계관을 자유롭게 정리하세요. 게임 코드와는 별개 문서입니다.

## 조직

- 이름:
- 목적:
- 시설 구조:

## 위험 등급 체계

게임 기본값은 `청록 / 황색 / 적색 / 흑색` 4단계. `src/data/config.js` 의 `GRADES` 에서 바꿀 수 있음.

| 등급 | 의미 |
|---|---|
| 1 | |
| 2 | |
| 3 | |
| 4 | |

## 개체 작성 템플릿

`src/data/entities.js` 의 `ENTITIES` 배열에 아래 블록을 복사해서 추가:

```js
{
  id: "my_entity",            // 영문 고유 ID
  code: "TK-100",             // 문서 번호
  name: "개체 이름",
  grade: 2,                   // 1~4
  dataPerWork: 12,            // 작업 1회 최대 데이터 (높을수록 작업 시간도 김)
  damage: { type: "mind", amount: [2, 4] },   // "body" 신체 / "mind" 정신
  stability: 3,               // 안정도 최대치
  prefs: { observe: "mid", maintain: "low", commune: "high", restrain: "none" },
  breach: { hp: 80, attack: 5, interval: 2 }, // 탈출 시 능력치
  traits: [],                 // "lonely" "hungry" "mirror" "binding" "healer"
  docs: [
    { need: 0, text: "처음부터 보이는 설명" },
    { need: 3, text: "작업 3회 후 해금" },
    { need: 6, text: "작업 6회 후 해금" },
  ],
  flavor: { good: "좋음일 때 대사", bad: "나쁨일 때 대사" },
},
```

새 특수 규칙(trait)이 필요하면 `src/game.js` 에서 `traits?.includes(` 로 검색해서 비슷하게 추가하면 됨.

## 개체 목록 (기획 메모)

| 코드 | 이름 | 등급 | 한 줄 설명 | 작성자 |
|---|---|---|---|---|
| | | | | |
