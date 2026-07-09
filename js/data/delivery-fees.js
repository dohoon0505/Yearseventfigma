/* ============================================================
   delivery-fees.js — 배송지(주소)별 추가 배송비.
   기본 정책: 별도 기재 지역 외 전국 무료배송, 도서·산간만 추가배송비.

   ⚠️ 아래 목록은 범용 샘플입니다. 서비스 운영 정책 확정 시 지역·요율을
   재작성하세요. 테넌트(기업)별 요율이 다른 경우 deliveryFeeFor 의 두 번째
   인자로 테넌트 전용 테이블을 주입해 오버라이드할 수 있습니다.
   ============================================================ */

/* kw: 주소 부분일치 키워드 · fee: 추가배송비(원) · region: 표시용 지역명 · sido: 시·도
   req: (선택) 동명 지역 오적용 방지 — 주소에 이 힌트 중 하나가 있어야 적용 */
export const DELIVERY_FEE_REGIONS = [
  /* 제주권 */
  { kw: "제주시", fee: 10000, region: "제주시", sido: "제주도" },
  { kw: "서귀포시", fee: 20000, region: "서귀포시", sido: "제주도" },
  /* 도서 지역 */
  { kw: "울릉군", fee: 20000, region: "울릉군", sido: "경상북도" },
  { kw: "진도군", fee: 10000, region: "진도군", sido: "전라남도" },
  { kw: "완도군", fee: 10000, region: "완도군", sido: "전라남도" },
  { kw: "신안군", fee: 20000, region: "신안군", sido: "전라남도" },
  /* 접경·산간 지역 */
  { kw: "철원군", fee: 10000, region: "철원군", sido: "강원도" },
  { kw: "화천군", fee: 20000, region: "화천군", sido: "강원도" },
  { kw: "양구군", fee: 10000, region: "양구군", sido: "강원도" },
  { kw: "인제군", fee: 10000, region: "인제군", sido: "강원도" },
  { kw: "평창군", fee: 20000, region: "평창군", sido: "강원도" },
  { kw: "태백시", fee: 20000, region: "태백시", sido: "강원도" },
  { kw: "고성군", fee: 20000, region: "고성군", sido: "강원도", req: ["강원"] },
  { kw: "연천군", fee: 10000, region: "연천군", sido: "경기도" },
];

/* 주소 → { fee, region }. 해당 없으면 { fee: 0, region: "" }(전국 무료배송).
   regions 인자로 테넌트별 요율 테이블을 주입할 수 있다(기본: 서비스 공통 테이블). */
export function deliveryFeeFor(address, regions = DELIVERY_FEE_REGIONS) {
  if (!address) return { fee: 0, region: "" };
  const a = String(address);
  for (const r of regions) {
    if (!a.includes(r.kw)) continue;
    if (r.req && !r.req.some((h) => a.includes(h))) continue;
    return { fee: r.fee, region: r.region };
  }
  return { fee: 0, region: "" };
}
