/* ============================================================
   phone.js — 연락처 포맷 · 검증 (순수 함수 · DOM 최소)

   같은 규칙이 네 곳에 복제돼 있었다(order.js·admin-b2c.js·admin-orders.js·
   admin-staff.js). 규칙이 갈리면 같은 번호가 화면마다 다르게 보인다.
   ⚠️ 사업자번호(10자리 3-2-5)는 **다른 규칙**이다 — util/biz.js 의
      `fmtBiz` 는 여기로 합치지 말 것.
   ============================================================ */

/** 숫자만 남겨 `010-0000-0000` 으로. 11자리를 넘기지 않는다.
 *  ⚠️ 그래서 이 정형을 쓰는 칸에는 12자리 번호(0505-…)를 적을 수 없고, 02 번호는 3-4-나머지로 찍힌다(021-2345-678 — 예전부터).
 *     받는분·보내는분·요청자 칸이 쓴다. **담당자 연락처 칸은 아래 `fmtContactPhone`** 이다(12자리를 받는 기준이라 자르면 안 된다). */
export const fmtPhone = (v) => {
  const d = String(v == null ? "" : v).replace(/\D/g, "").slice(0, 11);
  if (d.length > 7) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
};

/** 발송 가능한 번호인가 — 숫자 10자리 이상(지역번호 포함).
 *  ⚠️ 받는분·보내는분 번호와 알림 인원 세기의 기준이다. **담당자**(거래처 담당자 저장공간의 사람) 연락처는 아래
 *     `contactPhoneOk` 가 따로 본다 — 둘을 섞지 말 것. */
export const phoneOk = (v) => String(v == null ? "" : v).replace(/\D/g, "").length >= 10;

/* ── 담당자 연락처 기준 (2026-10-19 사용자 결정 ⓔ '010 이면 11자리로') ──────────────────────
   거래처 담당자는 주문 요청자·배송완료 알림·정산 알림(T3~T8)이 닿는 사람이라 번호가 틀리면 알림이 조용히 사라진다.
   그래서 받는분 번호(phoneOk — 10자리 이상)보다 한 칸 좁다: **하이픈·공백을 뺀 숫자가 10~12자리**이고, **010 으로
   시작하면 정확히 11자리**다(휴대폰 끝 한 자리를 지운 010-1234-567 같은 번호를 받지 않는다). 숫자·하이픈·공백 밖의
   글자가 섞이면 받지 않는다(가입 2단계는 칸이 정형하지 않아 'abc' 가 그대로 저장될 수 있었다).
   쓰는 곳 — 같은 기준이어야 한다(서버도 같은 판정 · 명세 5.8):
   담당자 등록·수정 창(util/contact-dialog.js) · 담당자 관리 창 인라인(util/contacts-modal.js) · 정산담당 '지정' 막기(그 창 · 포털
   profile.js) · 가입 2단계(register.js) · 관리자 신규 거래처 등록의 정산 담당 칸(admin-clients.js). */
const digitsOf = (v) => String(v == null ? "" : v).replace(/\D/g, "");
/** 담당자 연락처에 숫자·하이픈·공백 밖의 글자('+'·'내선'·점·괄호 등)가 섞였는가 — 그런 값은 자릿수와 상관없이 받지 않는다.
 *  막는 문구의 앞말을 고르는 데도 쓴다(그때 '끝까지 입력하세요' 라고 하면 이유를 잘못 짚는다). */
export const contactPhoneOdd = (v) => /[^\d\s-]/.test(String(v == null ? "" : v).trim());
/** 담당자 연락처로 받을 수 있는가 — 숫자 10~12자리(하이픈·공백은 빼고 센다) · 010 으로 시작하면 정확히 11자리. */
export function contactPhoneOk(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s || contactPhoneOdd(s)) return false;
  const d = digitsOf(s);
  return d.startsWith("010") ? d.length === 11 : d.length >= 10 && d.length <= 12;
}
/** 맞지 않는 담당자 연락처에 **무엇이 필요한지** 한 마디(막는 힌트 · 오류 문구 괄호 안) — 010 으로 시작하면 '010 번호는 숫자 11자리',
 *  아니면 기준 전체 '숫자 10~12자리, 010 번호는 11자리'(괄호 안에 들어가는 말이라 괄호를 겹치지 않는다). 숫자·하이픈·공백 밖의 글자가
 *  섞였으면 그것이 먼저다('숫자와 하이픈만' — 자릿수가 맞아도 받지 않으므로 자릿수를 말하면 이유를 잘못 짚는다).
 *  화면마다 문구를 손으로 적지 말 것 — 기준이 바뀌면 갈린다. */
export const contactPhoneNeed = (v) => {
  if (contactPhoneOdd(v)) return "숫자와 하이픈만";
  return digitsOf(v).startsWith("010") ? "010 번호는 숫자 11자리" : "숫자 10~12자리, 010 번호는 11자리";
};
/** 담당자 연락처의 숫자가 기준보다 **많은가**(010 이면 11자리 초과 · 아니면 12자리 초과). 막는 문구의 앞말을 고르는 데 쓴다 —
 *  담당자 칸은 이제 자르지 않아(fmtContactPhone) 긴 번호가 칸에 남는데, 그때 '끝까지 입력하세요' 라고 하면 거짓말이다. */
export const contactPhoneLong = (v) => {
  const d = digitsOf(v);
  return d.length > (d.startsWith("010") ? 11 : 12);
};

/** 담당자 연락처 칸의 하이픈 — 숫자만 남기되 **자르지 않는다**(2026-10-19 · 결정 ⓔ 는 12자리까지 받는다).
 *  예전엔 담당자 칸도 `fmtPhone` 이라 0505-1234-5678 을 치면 050-5123-4567(다른 번호)로 잘려 저장됐다 — 정형하지 않는 가입
 *  2단계와 같은 사람이 화면마다 다른 번호가 됐다. 기준보다 긴 번호는 그대로 두고 `contactPhoneOk`/`contactPhoneNeed` 가
 *  막는 이유를 말한다(조용히 자르면 맞는 모양의 다른 번호가 된다).
 *  자리: 앞 번호는 02 = 2자리 · 050X = 4자리 · 그 밖 3자리, 가운데는 010 이면 늘 4자리(fmtPhone 과 한 글자도 다르지 않다),
 *  아니면 뒤가 8자리 이상일 때 4자리 · 그보다 짧으면 3자리(02-1234-5678 · 031-123-4567 · 0505-1234-5678). 남는 숫자는 끝 묶음에 붙는다.
 *  ⚠️ 숫자·하이픈·공백 밖의 글자가 섞인 값은 **손대지 않고 그대로 돌려준다**(2026-10-19 2차 후속). 그 글자를 지우면 맞는 모양의 다른
 *     번호가 된다 — '+82-10-1234-5678' 이 821-0123-45678(12자리라 기준을 지난다), '031-123-4567 내선 1' 이 031-1234-5671 이 되어
 *     정산 담당 번호로 저장됐다. 그대로 두면 `contactPhoneOk` 가 막고 `contactPhoneNeed` 가 '숫자와 하이픈만' 이라고 말한다(정형하지
 *     않는 가입 2단계와 같은 결과). 그래서 이 정형은 판정을 바꾸지 않는다 — `contactPhoneOk(fmtContactPhone(v)) === contactPhoneOk(v)`. */
export const fmtContactPhone = (v) => {
  if (contactPhoneOdd(v)) return String(v);
  const d = digitsOf(v);
  const head = d.startsWith("02") ? 2 : d.startsWith("050") ? 4 : 3;
  if (d.length <= head) return d;
  const rest = d.length - head;
  const mid = d.startsWith("010") || rest >= 8 ? 4 : 3;
  if (rest <= mid) return `${d.slice(0, head)}-${d.slice(head)}`;
  return `${d.slice(0, head)}-${d.slice(head, head + mid)}-${d.slice(head + mid)}`;
};

/** input 엘리먼트에 write-through. 반환값은 정형된 문자열(호출부가 state 에 담는다).
 *  커서는 끝으로 간다 — 중간 편집은 드물고, 캐럿 보존은 IME 와 부딪힌다(의도적 타협). */
export function onPhoneInput(el) {
  el.value = fmtPhone(el.value);
  return el.value;
}
/** 담당자 연락처 칸용 — `onPhoneInput` 과 같되 `fmtContactPhone`(자르지 않는다). 담당자 등록·수정 창 · 담당자 관리 창 인라인 ·
 *  관리자 신규 거래처 등록의 정산 담당 칸이 쓴다(가입 2단계는 칸을 정형하지 않는다 — 숫자 수는 어느 쪽이든 같다).
 *  값이 그대로면 칸에 다시 쓰지 않는다 — 글자가 섞여 정형하지 않는 동안(위 fmtContactPhone) 커서가 그 자리에 남는다. */
export function onContactPhoneInput(el) {
  const next = fmtContactPhone(el.value);
  if (next !== el.value) el.value = next;
  return el.value;
}
