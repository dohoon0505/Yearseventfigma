/* ============================================================
   intake-rules.js — 배송지(주소) 지역 규칙 단일 엔진.

   구 시스템 '지역별 반입 리스트(503)' 25건과 기존 배송비 할증 14건을 한 테이블에
   합쳤다. 성격이 다른 세 가지를 type 으로 구분한다.

     blocked   … 배송 불가 지역 (주문 차단)
     allowlist … 그 지역·장소에서 **이 상품만** 반입 가능 (선택지 제한)
     surcharge … 도서·산간 추가 배송비 (금액 가산)

   ⚠️ 평가 순서가 곧 정책이다 — blocked → 장소 지정 allowlist → 지역 전역
      allowlist → surcharge. 밀양은 두 행이 경쟁한다(전역: 쌀화환만 / 밀양농협:
      3종). 장소 규칙을 먼저 보지 않으면 밀양농협 주문이 전부 반려된다.

   ⚠️ 상품 조건은 **접두사 패턴**이다. 구 시스템은 "근조 오브제"처럼 묶어서
      적었고 신규 카탈로그는 "근조오브제(1단형)"처럼 규격이 나뉘어 있다.
      allow 에는 규격을 뺀 접두사를 넣고 matchesProduct 로 비교한다.

   출처: flowerdel.pe.kr/adm2 (2026-09-15 이관). 운영 정책이 바뀌면 이 표만 고친다.
   ============================================================ */

/* kw 규칙: 주소에 sidoKw 중 하나 && regionKw 중 하나가 있어야 매칭.
   placeKw 가 있으면 그것까지 있어야 한다(장소 한정 규칙). */
export const REGION_RULES = [
  /* ── 배송 불가 ─────────────────────────────────────────── */
  { type: "blocked", sido: "전남", sidoKw: ["전남", "전라남도"], regionKw: ["신안"], notice: "배송이 불가한 지역입니다." },
  { type: "blocked", sido: "충남", sidoKw: ["충남", "충청남도"], regionKw: ["계룡"], notice: "배송이 불가한 지역입니다." },

  /* ── 반입 가능 상품 제한 · 장소 지정(먼저 평가) ─────────── */
  { type: "allowlist", sido: "서울",      sidoKw: ["서울"],            regionKw: ["노원"],          placeKw: ["더조은요양병원"], allow: ["근조오브제"], notice: "더조은요양병원은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["창녕"],          placeKw: ["공설장례식장"],   allow: ["근조바구니"], notice: "창녕 공설장례식장은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["거제"],          placeKw: ["거붕백병원"],     allow: ["근조오브제"], notice: "거붕백병원은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["함안"],          placeKw: ["하늘공원"],       allow: ["근조바구니"], notice: "함안 하늘공원은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["사천"],          placeKw: ["공설장례식장"],   allow: ["근조바구니"], notice: "사천 공설장례식장은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["밀양"],          placeKw: ["밀양농협"],       allow: ["3단화환", "근조바구니", "쌀화환"], notice: "밀양농협은 3단화환·근조바구니·쌀화환만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["양산"],          placeKw: ["양산장례", "시민장례", "신세계병원"], allow: ["근조오브제"], notice: "이 장례식장은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남",      sidoKw: ["경남", "경상남도"], regionKw: ["창원", "마산"],   placeKw: ["상복고", "마산의료원", "동마산병원"], allow: ["근조바구니"], notice: "이 장례식장은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "충남",      sidoKw: ["충남", "충청남도"], regionKw: ["예산"],          placeKw: ["중앙장례식장"],   allow: ["쌀화환"],     notice: "예산 중앙장례식장은 쌀화환만 반입할 수 있어요." },
  { type: "allowlist", sido: "경기/인천", sidoKw: ["경기", "인천"],     regionKw: ["수원"],          placeKw: ["연화장"],         allow: ["근조오브제"], notice: "수원 연화장은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "세종",      sidoKw: ["세종"],            regionKw: ["세종"],          placeKw: ["은하수공원"],     allow: ["근조오브제"], notice: "세종 은하수공원은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "울산",      sidoKw: ["울산"],            regionKw: ["울주"],          placeKw: ["하늘공원"],       allow: ["근조오브제"], notice: "울주 하늘공원은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "대구",      sidoKw: ["대구"],            regionKw: ["북구"],          placeKw: ["가톨릭병원", "경북요양병원"], allow: ["근조바구니"], notice: "이 장례식장은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "부산",      sidoKw: ["부산"],            regionKw: ["부산"],          placeKw: ["영락공원", "원자력병원", "착한전문장례식장", "빌리브세웅병원", "좌천봉생병원", "중앙U병원", "중앙 U병원"], allow: ["근조오브제"], notice: "이 장례식장은 근조오브제만 반입할 수 있어요." },

  /* ── 반입 가능 상품 제한 · 지역 전역 ────────────────────── */
  { type: "allowlist", sido: "경북", sidoKw: ["경북", "경상북도"],                 regionKw: ["청도"],        allow: ["쌀화환"],     notice: "청도 지역은 쌀화환만 제작·반입할 수 있어요." },
  { type: "allowlist", sido: "경북", sidoKw: ["경북", "경상북도"],                 regionKw: ["고령"],        allow: ["근조바구니"], notice: "고령 지역은 근조바구니만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남", sidoKw: ["경남", "경상남도"],                 regionKw: ["거창"],        allow: ["근조오브제"], notice: "거창 지역은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남", sidoKw: ["경남", "경상남도"],                 regionKw: ["산청"],        allow: ["쌀화환"],     notice: "산청 지역은 쌀화환만 반입할 수 있어요." },
  { type: "allowlist", sido: "경남", sidoKw: ["경남", "경상남도"],                 regionKw: ["밀양"],        allow: ["쌀화환"],     notice: "밀양농협 외 장례식장은 쌀화환만 반입할 수 있어요." },
  { type: "allowlist", sido: "전북", sidoKw: ["전북", "전라북도", "전북특별자치도"], regionKw: ["부안"],        allow: ["근조오브제"], notice: "부안 지역은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "전북", sidoKw: ["전북", "전라북도", "전북특별자치도"], regionKw: ["정읍", "남원"], allow: ["근조오브제"], notice: "이 지역은 근조오브제만 반입할 수 있어요." },
  { type: "allowlist", sido: "전남", sidoKw: ["전남", "전라남도"],                 regionKw: ["완도"],        allow: ["쌀화환"],     notice: "완도 지역은 쌀화환만 반입할 수 있어요." },
  { type: "allowlist", sido: "전남", sidoKw: ["전남", "전라남도"],                 regionKw: ["여수"],        allow: ["근조오브제"], notice: "여수 지역은 근조오브제만 반입할 수 있어요." },

  /* ── 추가 배송비(도서·산간) ─────────────────────────────
     신안군은 위 blocked 로 대체됐다(구 시스템 정책이 정본). 완도군은 성격이
     다른 두 규칙(할증 + 반입제한)이 함께 걸린다. */
  { type: "surcharge", sido: "제주도",   sidoKw: ["제주"],             regionKw: ["제주시"],   fee: 10000, region: "제주시" },
  { type: "surcharge", sido: "제주도",   sidoKw: ["제주"],             regionKw: ["서귀포시"], fee: 20000, region: "서귀포시" },
  { type: "surcharge", sido: "경상북도", sidoKw: ["경북", "경상북도"], regionKw: ["울릉군"],   fee: 20000, region: "울릉군" },
  { type: "surcharge", sido: "전라남도", sidoKw: ["전남", "전라남도"], regionKw: ["진도군"],   fee: 10000, region: "진도군" },
  { type: "surcharge", sido: "전라남도", sidoKw: ["전남", "전라남도"], regionKw: ["완도군"],   fee: 10000, region: "완도군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["철원군"],   fee: 10000, region: "철원군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["화천군"],   fee: 20000, region: "화천군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["양구군"],   fee: 10000, region: "양구군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["인제군"],   fee: 10000, region: "인제군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["평창군"],   fee: 20000, region: "평창군" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["태백시"],   fee: 20000, region: "태백시" },
  { type: "surcharge", sido: "강원도",   sidoKw: ["강원"],             regionKw: ["고성군"],   fee: 20000, region: "고성군" },
  { type: "surcharge", sido: "경기도",   sidoKw: ["경기"],             regionKw: ["연천군"],   fee: 10000, region: "연천군" },
];

const has = (addr, list) => !list || list.length === 0 || list.some((k) => addr.includes(k));
const matchesRule = (addr, r) => has(addr, r.sidoKw) && has(addr, r.regionKw) && has(addr, r.placeKw);
const isPlaceRule = (r) => Array.isArray(r.placeKw) && r.placeKw.length > 0;

/** 카탈로그 상품명이 allow 접두사 목록에 해당하는가. allow 가 비면 제한 없음. */
export function matchesProduct(allow, productName) {
  if (!allow || allow.length === 0) return true;
  const n = String(productName || "").replace(/\s/g, "");
  return allow.some((a) => n.includes(String(a).replace(/\s/g, "")));
}

/**
 * 주소 한 건에 대한 최종 판정.
 * @returns {{blocked:boolean, notice:string, fee:number, region:string, allowOnly:string[]}}
 */
export function evaluateAddress(address) {
  const out = { blocked: false, notice: "", fee: 0, region: "", allowOnly: [] };
  if (!address) return out;
  const a = String(address);

  const blocked = REGION_RULES.find((r) => r.type === "blocked" && matchesRule(a, r));
  if (blocked) return { ...out, blocked: true, notice: blocked.notice, region: blocked.regionKw[0] };

  // 장소 지정 규칙이 지역 전역 규칙을 이긴다(밀양농협 ↔ 밀양).
  const allow =
    REGION_RULES.find((r) => r.type === "allowlist" && isPlaceRule(r) && matchesRule(a, r)) ||
    REGION_RULES.find((r) => r.type === "allowlist" && !isPlaceRule(r) && matchesRule(a, r));
  if (allow) { out.allowOnly = allow.allow; out.notice = allow.notice; out.region = allow.regionKw[0]; }

  const fee = REGION_RULES.find((r) => r.type === "surcharge" && matchesRule(a, r));
  if (fee) { out.fee = fee.fee; out.region = fee.region; }
  return out;
}
