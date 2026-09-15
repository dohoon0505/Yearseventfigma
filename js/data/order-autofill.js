/* ============================================================
   order-autofill.js — 부고장·청첩장 링크 자동입력 (데모)

   ⚠️ **실제 파싱은 없다.** 도메인이 포함돼 있으면 미리 적어 둔 값을 돌려주는
   하드코딩 데모다. 실 API 가 붙으면 `parseOrderUrl` 의 **내부만** 갈아끼운다 —
   호출부(포털 주문 퍼널·관리자 주문서 등록 모달)는 이 계약만 안다.

   kind: "obit"(부고) — 장례식장 주소 · 고인명 · 즉시배송 전제
         "wed" (청첩) — 예식장 주소 · 혼주 · 예식 일시(dayOffset 일 뒤 hour:min)
   ============================================================ */

export const AUTOFILL_DB = {
  obit: {
    "kakao.com":    { addr: "서울특별시 종로구 대학로 101 서울대학교병원 장례식장 3호실", toName: "故 김영수", toPhone: "010-3921-4400" },
    "naeil.com":    { addr: "경기도 성남시 분당구 야탑로 59 분당차병원 장례식장 특2호실",  toName: "故 이정호", toPhone: "010-2277-8130" },
    "mobile.co.kr": { addr: "서울특별시 서초구 반포대로 222 서울성모병원 장례식장 7호실",  toName: "故 박순자", toPhone: "010-5540-9902" },
  },
  wed: {
    "wedding.me":      { addr: "서울특별시 서초구 강남대로 373 홀리데이인 서울 강남 3층 그랜드볼룸", toName: "혼주 최영호", toPhone: "010-8845-1120", dayOffset: 14, hour: "11", min: "00" },
    "weddingbook.com": { addr: "서울특별시 마포구 백범로 235 서울가든호텔 2층 다이아몬드홀",       toName: "혼주 정미경", toPhone: "010-6612-7788", dayOffset: 21, hour: "13", min: "30" },
  },
};

/** 인식 실패 안내에 쓰는 데모 도메인 목록 — 두 화면이 같은 문구를 쓰도록 여기서 만든다. */
export const AUTOFILL_HINT = Object.values(AUTOFILL_DB)
  .flatMap((m) => Object.keys(m))
  .join(" · ");

/**
 * 링크에서 배송 정보를 읽는다.
 * @returns {{kind:"obit"|"wed", addr, toName, toPhone, dayOffset?, hour?, min?}|null}
 *          인식하지 못하면 null — 호출부가 안내 문구를 띄운다.
 */
export function parseOrderUrl(raw) {
  const url = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!url) return null;
  for (const kind of ["obit", "wed"]) {
    const hit = Object.keys(AUTOFILL_DB[kind]).find((d) => url.includes(d));
    if (hit) return { kind, ...AUTOFILL_DB[kind][hit] };
  }
  return null;
}
