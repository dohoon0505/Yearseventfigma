/* ============================================================
   toast.js — 공용 토스트 (ADMIN 4개 페이지 공통).

   페이지 계약: mount 에서 makeToast() → cleanup 에서 destroy().
   makeDropdown/makeDatepicker 와 같은 "인스턴스 + destroy" 수명주기다.
   반환값이 호출 가능한 함수라 기존 `toast(msg, kind)` 호출부는 손대지 않는다.

   ⚠️ **토스트는 화면에서 2.6초 만에 사라지는 유일한 통보다** — 저장·복사·상태 전환의 결과를 이것만
      말하는 자리가 많다. 그래서 눈에 보이는 노드와 **별도로** 지속형 live-region 에 같은 문구를 넣어
      스크린리더가 읽게 한다. 노드 자체에 aria-live 를 걸고 그때그때 DOM 에 꽂는 방식은 읽히지 않는
      브라우저·리더 조합이 있다(live-region 은 **미리 있어야** 변화를 감지한다).
   ============================================================ */
import { html, el } from "./dom.js";
import { icon } from "./icons.js";

const DURATION = 2600;

/** makeToast() → toast(msg, kind="ok"|"warn") · toast.dismiss() · toast.destroy() */
export function makeToast({ duration = DURATION } = {}) {
  let node = null;
  let live = null;
  let timer = null;
  let lastRead = "";

  /** 보이지 않는 안내 영역. **미리 붙여 두고** 글자만 갈아 끼운다(아래 주석 참조). */
  function ensureLive() {
    if (!live || !live.isConnected) {
      live = el(html`<div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`);
      document.body.appendChild(live);
    }
    return live;
  }

  /** 타이머 해제 + 노드 제거. cleanup 계약이자 연속 호출 시의 교체 수단. */
  function dismiss() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (node) { node.remove(); node = null; }
    if (live) live.textContent = "";
  }

  function show(msg, kind = "ok") {
    dismiss(); // 직전 토스트를 즉시 교체(기존 동작과 동일)
    /* 보이는 쪽은 aria-hidden — 같은 문구를 두 번 읽지 않게 한다. */
    node = el(html`<div class="toast toast--${kind}" aria-hidden="true">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(node);
    const lr = ensureLive();
    /* 경고는 하던 일을 끊고 알려야 한다(assertive), 성공 통보는 끼어들지 않는다(polite). */
    lr.setAttribute("aria-live", kind === "warn" ? "assertive" : "polite");
    /* ⚠️ 같은 문구를 연달아 띄우면 내용이 안 바뀌어 리더가 건너뛴다 — 그때만 보이지 않는 문자를 하나
       덧붙여 '달라진 것'으로 만든다. (비우고 다음 프레임에 넣는 수법은 rAF 가 늦거나 안 도는 환경에서
       빈 문자열로 남는다 — 실측으로 그렇게 죽었다.) */
    const read = msg === lastRead ? `${msg}\u200B` : msg;
    lastRead = read;
    lr.textContent = read;
    timer = setTimeout(() => { timer = null; dismiss(); }, duration);
  }

  show.dismiss = dismiss;
  show.destroy = () => {
    dismiss();
    if (live) { live.remove(); live = null; }
  };
  return show;
}
