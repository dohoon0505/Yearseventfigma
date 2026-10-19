/* ============================================================
   order-rules.js — 주문 불변식 (B2B·B2C 공통 · import 0)

   지금은 **취소 수수료 규칙** 하나다. 명세 5.3 불변식 `cancel_fee ≤ amount` · 6.4 `400 CANCEL_FEE_INVALID`
   (2026-10-04 2차 답 N22 ① · 2026-10-19 사용자 결정 ⓓ): 수수료는 **0원부터 그 주문의 금액까지의 정수**다(금액 0원 주문 —
   가입 혜택 등 — 은 0원만). 기준 금액은 취소하는 순간의 저장값이다(두 상세 창의 취소는 작성 중인 수정을 함께 저장하므로 창에 보인
   금액이 곧 그 값이다). 불변식은 취소한 뒤에도 지킨다 — 취소한 주문의 금액을 수수료보다 작게 고칠 수 없다.

   쓰는 곳 — 같은 함수여야 한다(창과 쓰기 함수가 다른 기준이면 '주문 취소하기' 는 열렸는데 저장이 막힌다):
   · 주문취소 창(util/cancel-modal.js) — '주문 취소하기' 를 잠그고 푸터가 이유를 말한다
   · 두 상세 창(admin-orders.js · admin-b2c.js) — 취소한 주문의 금액 < 수수료면 저장 줄이 이유를 말하고 저장을 잠근다
   · 쓰기 함수(b2b-mock `b2bUpsert`·`b2bCancel` · b2c-mock `b2cUpsert`·`b2cCancel`) — 서버 400 의 데모 대역으로 한 번 더 막는다.
     ⚠️ 쓰기 함수는 막을 때 **거짓 값**을 돌려준다(저장 실패와 같은 모양 — 예전 호출부가 성공으로 읽지 않게). 이유를 따로 말하려면
     호출부가 쓰기 **전에** 이 두 함수로 판정한다.

   왜 따로 떼었나 — 예전엔 B2C 목데이터 모듈(b2c-mock.js)에 있어서 b2b-mock 이 b2c-mock 을 import 했다(포털 주문 화면·정산 시험도
   B2C 시드를 함께 띄웠다). 규칙은 어느 한쪽 데이터의 것이 아니다. billing-entries.js 처럼 **import 0** 으로 두어 데이터 모듈·화면
   어디서 가져가도 순환이 생기지 않게 한다. b2c-mock 은 예전 호출부 호환으로 재수출만 한다(tools/test-billing.mjs ⑧).
   ============================================================ */

export const CANCEL_FEE_INVALID = "CANCEL_FEE_INVALID";

const wonText = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

/** 수수료 `fee` 를 금액 `amount` 인 주문의 취소에 받을 수 있는가 — 받으면 null, 아니면 `{ code, field: "fee", max, message }`
 *  (message 는 명세 6.4 응답 문구 그대로). 숫자 문자열("10000")·빈 값(0원)은 받고, 음수·소수·숫자 아님·금액 초과는 거부한다. */
export function cancelFeeError(amount, fee) {
  const max = Math.max(0, Number(amount) || 0);
  const n = Number(fee ?? 0);
  if (Number.isSafeInteger(n) && n >= 0 && n <= max) return null;
  return { code: CANCEL_FEE_INVALID, field: "fee", max, message: `취소 수수료는 0원부터 주문금액(${wonText(max)})까지 적을 수 있습니다` };
}

/** 저장하려는 레코드 `next` 가 불변식을 깨는가(취소한 주문의 금액을 수수료보다 작게 고침 등) — 깨면 이유, 아니면 null.
 *  금액이 원인이면 `{ code, field: "amount", min, message }`. `prev`(저장본)와 금액·수수료가 같으면 보지 않는다 — 규칙 전에 저장된
 *  틀린 값 하나 때문에 그 주문의 다른 칸(메모·인수자)까지 영영 저장하지 못하게 되지 않게. */
export function orderFeeError(next, prev = null) {
  if (!next) return null;
  const fee = Number(next.cancelFee ?? 0);
  if (prev && Number(prev.amount) === Number(next.amount) && Number(prev.cancelFee ?? 0) === fee) return null;
  const err = cancelFeeError(next.amount, next.cancelFee);
  if (!err || !Number.isSafeInteger(fee) || fee < 0) return err;
  return { code: CANCEL_FEE_INVALID, field: "amount", min: fee, message: `주문금액은 취소 수수료 ${wonText(fee)}보다 작을 수 없습니다` };
}
