/* ============================================================
   delivery-fees.js — 배송지(주소)별 추가 배송비 어댑터.

   ⚠️ 요율 테이블은 더 이상 여기에 없다. 구 시스템 '지역별 반입 리스트(503)'를
      이관하면서 배송비 할증·배송불가·반입 제한을 한 엔진으로 합쳤다 →
      js/data/intake-rules.js 가 단일 소스다.

   이 파일은 기존 호출부(order.js 3곳)가 쓰던 계약만 유지하는 얇은 어댑터다.
   새 코드는 evaluateAddress() 를 직접 쓸 것 — 배송불가·반입 제한까지 함께
   판정해야 하고, 여기서는 금액만 돌려주므로 차단 여부를 알 수 없다.
   ============================================================ */
import { evaluateAddress } from "./intake-rules.js";

/** 주소 → { fee, region }. 해당 없으면 { fee: 0, region: "" }(전국 무료배송). */
export function deliveryFeeFor(address) {
  const r = evaluateAddress(address);
  return { fee: r.fee, region: r.fee > 0 ? r.region : "" };
}
