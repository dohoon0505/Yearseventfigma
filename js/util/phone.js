/* ============================================================
   phone.js — 연락처 포맷 · 검증 (순수 함수 · DOM 최소)

   같은 규칙이 네 곳에 복제돼 있었다(order.js·admin-b2c.js·admin-orders.js·
   admin-staff.js). 규칙이 갈리면 같은 번호가 화면마다 다르게 보인다.
   ⚠️ 사업자/대표번호(10자리 3-3-4)는 **다른 규칙**이다 — admin-clients.js 의
      `fmtBiz` 는 여기로 합치지 말 것.
   ============================================================ */

/** 숫자만 남겨 `010-0000-0000` 으로. 11자리를 넘기지 않는다. */
export const fmtPhone = (v) => {
  const d = String(v == null ? "" : v).replace(/\D/g, "").slice(0, 11);
  if (d.length > 7) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
};

/** 발송 가능한 번호인가 — 숫자 10자리 이상(지역번호 포함). */
export const phoneOk = (v) => String(v == null ? "" : v).replace(/\D/g, "").length >= 10;

/** input 엘리먼트에 write-through. 반환값은 정형된 문자열(호출부가 state 에 담는다).
 *  커서는 끝으로 간다 — 중간 편집은 드물고, 캐럿 보존은 IME 와 부딪힌다(의도적 타협). */
export function onPhoneInput(el) {
  el.value = fmtPhone(el.value);
  return el.value;
}
