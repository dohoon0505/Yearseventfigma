/* ============================================================
   cancel-modal.js — 주문취소 사유·수수료 입력 모달 (B2C·B2B 공용).

   구 시스템 주문 모달에는 취소수수료·취소사유가 필수 필드였는데 신규는
   「주문취소」 버튼만 있고 입력란이 없었다. 데이터 필드(cancelFee·
   cancelReason)와 저장 로직은 이미 있었고 **입력 UI 만 없어서** 값이 영원히
   0·빈문자열이었다.

   사유는 코드값으로 받는다 — 자유 텍스트로 두면 통계도 정산 근거도 안 된다.
   '기타'만 직접 입력을 연다.

   수수료는 B2B 에서 그 달 정산에 가산되므로 금액이 걸린 입력이다.
   되돌릴 수 없는 동작이라 한 번 더 확인받는다(주문 접수 확인과 같은 패턴).
   ============================================================ */
import { html, on, qs, qsa } from "../dom.js";
import { simpleModal } from "../ui.js";

export const CANCEL_REASONS = [
  "고객 단순 변심",
  "중복 주문",
  "배송지 오류",
  "상품 품절",
  "업체 사정",
  "기타",
];

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const numOnly = (v) => String(v).replace(/[^0-9]/g, "");

/**
 * @param {{orderNo:string, amount:number, settle?:boolean,
 *          onConfirm:(r:{reason:string, fee:number}) => void}} opts
 *   settle=true 면 "그 달 정산에 가산된다"는 안내를 띄운다(B2B).
 * @returns 모달 인스턴스(호출부가 닫기 책임을 진다)
 */
export function openCancelModal({ orderNo, amount, settle = false, onConfirm }) {
  const form = { reason: CANCEL_REASONS[0], etc: "", fee: "" };

  const body = html`
    <div class="cx-box">
      <span><b>취소는 되돌릴 수 없습니다.</b> 주문금액 ${won(amount)} 건입니다.</span>
    </div>
    <div class="hm-field">
      <label>취소 사유<span class="req">*</span></label>
      <div class="cx-grid" role="radiogroup" aria-label="취소 사유">
        ${CANCEL_REASONS.map((r) => html`<button type="button" class="cx-opt ${r === CANCEL_REASONS[0] ? "is-sel" : ""}"
          data-cx-reason="${r}" role="radio" aria-checked="${r === CANCEL_REASONS[0] ? "true" : "false"}">${r}</button>`)}
      </div>
    </div>
    <div class="hm-field" data-etc-wrap hidden>
      <label for="cx-etc">사유 직접 입력<span class="req">*</span></label>
      <input class="hm-input" id="cx-etc" data-cx="etc" type="text" maxlength="60" placeholder="예) 상주 요청으로 다른 업체 발주" />
    </div>
    <div class="hm-field">
      <label for="cx-fee">취소 수수료</label>
      <input class="hm-input" id="cx-fee" data-cx="fee" type="text" inputmode="numeric" placeholder="0" />
      <p class="hm-help">${settle
        ? "입력한 금액은 해당 거래처의 그 달 정산에 가산됩니다."
        : "제작 착수 전이면 0원으로 두세요."}</p>
    </div>
  `;

  const footer = html`
    <button class="hm-btn hm-btn--secondary" data-action="close">돌아가기</button>
    <button class="hm-btn hm-btn--danger" data-cx-go>주문 취소하기</button>
  `;

  const m = simpleModal({
    title: "주문을 취소할까요?",
    subtitle: orderNo,
    body, footer, size: "",
    panelClass: "modal-panel--ordcancel", // 시안 460px — 사유 2열 그리드가 들어간다
  });

  const etcWrap = qs(m.panel, "[data-etc-wrap]");
  const goBtn = qs(m.panel, "[data-cx-go]");
  const syncGo = () => { goBtn.disabled = form.reason === "기타" && !form.etc.trim(); };

  /* 사유는 버튼 그리드 — 6개뿐이라 한눈에 보이는 편이 낫다(시안) */
  on(m.panel, "click", "[data-cx-reason]", (e, t) => {
    form.reason = t.dataset.cxReason;
    qsa(m.panel, "[data-cx-reason]").forEach((b) => {
      const on_ = b.dataset.cxReason === form.reason;
      b.classList.toggle("is-sel", on_);
      b.setAttribute("aria-checked", on_ ? "true" : "false");
    });
    etcWrap.hidden = form.reason !== "기타";
    syncGo();
  });

  on(m.panel, "input", "[data-cx]", (e, t) => {
    if (t.dataset.cx === "fee") {
      const n = numOnly(t.value);
      t.value = n ? Number(n).toLocaleString("ko-KR") : "";
      form.fee = n;
    } else {
      form.etc = t.value;
    }
    syncGo();
  });

  on(m.panel, "click", "[data-cx-go]", () => {
    const reason = form.reason === "기타" ? form.etc.trim() : form.reason;
    if (!reason) return;
    onConfirm({ reason, fee: Number(form.fee) || 0 });
    m.close();
  });

  return m;
}
