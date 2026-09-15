/* ============================================================
   order-create.js — 주문서 등록 위저드 셸 (시안 '주문서 등록 모달')

   ⚠️ **주문 상세 모달(order-screen.js)과 다른 모달이다.** 서로 import 하지 않는다.
   공유하는 폼 프리미티브는 order-fields.js 를 경유한다. 시안의 주장이 그대로
   구조다 — "같은 폼이 아닙니다. 주문의 성질이 다릅니다. 그래서 진입점부터
   다른 두 개의 모달입니다."

   이 셸은 B2C/B2B 를 **모른다**. 2단계 기계·다크 레일·푸터·필수 카운트만 갖고,
   각 단계의 본문·레일 내용·저장 규칙은 호출부(페이지 모듈)의 스펙이 준다.
   채번·upsert 를 셸이 갖지 않는 이유: 데이터 계약이 갈린다(b2cUpsert/b2bUpsert,
   receivedAt/date). order-screen.js 가 그은 선과 같다.

   짝이 되는 스타일은 css/components.css 의 `.ordnew-*` 블록.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { openModal } from "../ui.js";

/**
 * @param {object} spec
 *  - title, subtitle       헤더 문구
 *  - autofill              true 면 헤더에 '자동작성' pill (호출부가 [data-action=autofill] 을 받는다)
 *  - steps[2]              { key, title, cap, render() → Html, bind(stepEl) → disposers[],
 *                            required() → string[] , hint() → string }
 *  - rail(stepIdx)         288px 레일 본문(마크업만)
 *  - submitLabel           마지막 버튼 문구
 *  - onSubmit()            등록. 채번·upsert·이력·목록 갱신은 호출부 책임
 *  - onClose(), toast
 * @returns {{ panel, close, goStep, rerenderStep, rerenderRail, syncFooter }}
 */
export function openOrderCreate(spec) {
  const steps = spec.steps || [];
  let step = 0;
  let touched = false;         /* ESC 이중 확인용 — 한 글자라도 쳤는가 */
  let escArmed = false;
  let disposers = [];

  const stepEl = (i) => qs(modal.panel, `[data-step="${i}"]`);
  const missing = () => (steps[step].required ? steps[step].required() : []);
  const isLast = () => step === steps.length - 1;

  /* ── 헤더 ── */
  const hdBody = () => html`
    <div class="ordnew-hd__l">
      <h3 id="modal-title">${spec.title}</h3>
      ${spec.subtitle ? html`<p class="ordnew-hd__sub">${spec.subtitle}</p>` : ""}
    </div>
    <div class="ordnew-hd__r">
      ${spec.autofill
        ? html`<button type="button" class="ordnew-auto" data-action="autofill">
            ${icon("file-text", { size: 14 })} 자동작성</button>`
        : ""}
      <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
    </div>`;

  /* ── 레일: 스텝 표시 + 스펙 본문 ── */
  const stepsBody = () => html`
    <ol class="ordnew-steps">
      ${steps.map((s, i) => html`
        <li class="ordnew-step ${i === step ? "is-now" : ""} ${i < step ? "is-done" : ""}">
          <span class="ordnew-step__n">${i < step ? icon("check", { size: 12 }) : String(i + 1)}</span>
          <span class="ordnew-step__t">${s.title}</span>
          ${s.cap ? html`<span class="ordnew-step__c">${s.cap}</span>` : ""}
        </li>`)}
    </ol>`;

  /* ── 푸터: 색이 상태를 말한다 ── */
  const ftBody = () => {
    const m = missing();
    const stat = m.length
      ? `필수 ${m.length}건 — ${m.join(" · ")}`
      : (steps[step].hint ? steps[step].hint() : "");
    return html`
      <span class="ord-ft__stat ${m.length ? "is-dirty" : "is-saved"}" data-slot="ftstat">${stat}</span>
      <button class="hm-btn hm-btn--secondary" data-action="${step === 0 ? "close" : "back"}">
        ${step === 0 ? "취소" : "이전"}</button>
      <button class="hm-btn hm-btn--primary" data-action="${isLast() ? "submit" : "next"}" ${m.length ? "disabled" : ""}>
        ${isLast() ? (spec.submitLabel || "주문 등록") : "다음"}</button>`;
  };

  const body = () => html`
    <div class="hm__head ordnew-hd" data-slot="hd">${hdBody()}</div>
    <div class="ordnew-grid">
      <aside class="ord-side ordnew-rail">
        <div data-slot="railsteps">${stepsBody()}</div>
        <div class="ordnew-railbody" data-slot="railbody">${spec.rail ? spec.rail(step) : ""}</div>
      </aside>
      <div class="ord-pane">
        ${steps.map((s, i) => html`
          <section class="ordnew-pane" data-step="${i}" ${i === 0 ? "" : "hidden"}>${s.render()}</section>`)}
      </div>
    </div>
    <div class="hm__foot ord-ft" data-slot="ft">${ftBody()}</div>`;

  const modal = openModal({
    panelClass: "modal-panel--ordnew",
    labelledBy: "modal-title",
    body: body(),
    onEsc: () => onEscHook(),
    onClose: () => {
      dispose();
      spec.onClose && spec.onClose();
    },
  });

  /* ── 부분 갱신 ──
     `modal.render()` 는 패널을 통째로 갈아 헤더까지 날린다 — 쓰지 않는다. */
  const put = (slot, inner) => {
    const e = qs(modal.panel, `[data-slot='${slot}']`);
    if (e) setHTML(e, typeof inner === "string" ? html`${inner}` : inner);
  };
  const syncFooter = () => put("ft", ftBody());
  const rerenderRail = () => { put("railsteps", stepsBody()); put("railbody", spec.rail ? spec.rail(step) : ""); };
  const rerenderStep = (key) => {
    const i = steps.findIndex((s) => s.key === key);
    if (i < 0) return;
    disposeStep(i);
    const el = stepEl(i);
    if (!el) return;
    setHTML(el, steps[i].render());
    bindStep(i);
    if (i === step) setDisabled(i, false);
    syncFooter();
  };

  /* ── 인스턴스 수명 ──
     makeDropdown/makeDateTimePicker 는 document 리스너를 건다 — 반드시 destroy. */
  function bindStep(i) {
    const el = stepEl(i);
    if (!el || !steps[i].bind) return;
    const d = steps[i].bind(el) || [];
    disposers[i] = Array.isArray(d) ? d : [d];
  }
  function disposeStep(i) {
    (disposers[i] || []).forEach((d) => { try { d && (d.destroy ? d.destroy() : d()); } catch (e) { /* noop */ } });
    disposers[i] = [];
  }
  function dispose() { steps.forEach((_, i) => disposeStep(i)); }

  /* 숨긴 스텝의 컨트롤은 `disabled` 로 막는다 — `openModal` 의 포커스 트랩이
     `hidden` 요소도 모으기 때문에, 안 그러면 Tab 이 보이지 않는 칸으로 빠진다.
     (`inert` 는 그 쿼리가 모른다.) */
  function setDisabled(i, off) {
    const el = stepEl(i);
    if (!el) return;
    qsa(el, "input,select,textarea,button").forEach((c) => { c.disabled = off; });
  }

  function goStep(next) {
    if (next === step || next < 0 || next >= steps.length) return;
    if (next > step && missing().length) return; /* 게이트 */
    const prev = step;
    step = next;
    stepEl(prev).hidden = true;
    setDisabled(prev, true);
    const el = stepEl(step);
    el.hidden = false;
    setDisabled(step, false);
    rerenderRail();
    syncFooter();
    const first = qs(el, "input:not([disabled]),textarea,.dd-trigger,button:not([disabled])");
    if (first) first.focus();
  }

  /* ── ESC 이중 확인 ──
     2단계를 채우다 ESC 한 번에 전부 날아가는 경로를 막는다.
     ⚠️ 자기 capture 리스너로는 막을 수 없다 — `openModal` 의 핸들러가 먼저 등록돼
        같은 단계에서 이긴다. `onEsc` 훅으로 넘겨 **닫기 직전에** 끼어든다.
     최상위 오버레이 판정·배송일시 피커 양보는 `openModal` 이 이미 끝낸 뒤라 여기선 안 본다. */
  function onEscHook() {
    if (!touched || escArmed) return true;
    escArmed = true;
    /* 토스트가 떠 있는 동안만 유효하다 — 안내가 사라진 뒤의 ESC 는 다시 첫 번째다.
       (toast.js 의 DURATION 2600ms 에 맞춘다. 2초로 두면 문구를 읽는 사이 창이 닫혔다.) */
    setTimeout(() => { escArmed = false; }, 2600);
    spec.toast && spec.toast("작성 중인 내용이 있습니다 · 한 번 더 누르면 닫힙니다", "warn");
    return false;
  }

  /* ── 이벤트(위임 1회 — 부분 갱신에도 생존) ── */
  on(modal.panel, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "next") return goStep(step + 1);
    if (a === "back") return goStep(step - 1);
    if (a === "close") return modal.close();
    if (a === "submit") {
      if (missing().length) return;
      spec.onSubmit && spec.onSubmit();
    }
  });
  /* 한 글자라도 치면 ESC 가드가 켜진다. 필수 카운터는 매 입력마다 다시 센다 —
     푸터 텍스트/버튼만 건드리고 본문은 재렌더하지 않는다(커서 유지).
     ⚠️ 세는 시점을 **마이크로태스크로 미룬다.** 이 위임은 셸이 먼저 걸므로 호출부의
        write-through(`draft[k] = t.value`)보다 **앞서** 실행된다 — 그대로 세면 푸터가
        항상 한 입력 늦고, 마지막 필수 칸을 채워도 등록 버튼이 비활성인 채 남는다
        (B2C 에서 리본문구를 다 적고도 등록이 막혔다). */
  on(modal.panel, "input", "input,textarea", () => { touched = true; queueMicrotask(syncFooter); });
  on(modal.panel, "click", ".ordnew-pane [data-action], .ordnew-pane button", () => { touched = true; });

  steps.forEach((_, i) => { bindStep(i); if (i !== 0) setDisabled(i, true); });
  syncFooter();

  return {
    panel: modal.panel,
    close: () => modal.close(),
    goStep,
    rerenderStep,
    rerenderRail,
    syncFooter,
    markTouched: () => { touched = true; },
  };
}
