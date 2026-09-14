/* ============================================================
   toast.js — 공용 토스트 (ADMIN 4개 페이지 공통).

   페이지 계약: mount 에서 makeToast() → cleanup 에서 destroy().
   makeDropdown/makeDatepicker 와 같은 "인스턴스 + destroy" 수명주기다.
   반환값이 호출 가능한 함수라 기존 `toast(msg, kind)` 호출부는 손대지 않는다.
   ============================================================ */
import { html, el } from "./dom.js";
import { icon } from "./icons.js";

const DURATION = 2600;

/** makeToast() → toast(msg, kind="ok"|"warn") · toast.dismiss() · toast.destroy() */
export function makeToast({ duration = DURATION } = {}) {
  let node = null;
  let timer = null;

  /** 타이머 해제 + 노드 제거. cleanup 계약이자 연속 호출 시의 교체 수단. */
  function dismiss() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (node) { node.remove(); node = null; }
  }

  function show(msg, kind = "ok") {
    dismiss(); // 직전 토스트를 즉시 교체(기존 동작과 동일)
    node = el(html`<div class="toast toast--${kind}">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(node);
    timer = setTimeout(() => { timer = null; dismiss(); }, duration);
  }

  show.dismiss = dismiss;
  show.destroy = dismiss;
  return show;
}
