/* ============================================================
   order-dialogs.js — 주문 화면의 보조 선택 다이얼로그

   시안의 보조 다이얼로그 4종 중 3종(주문 담당자 · 주문 요청자 · 발송 프로필)이
   같은 형태다 — 단일 선택 행 리스트 + [취소][확인]. 세 벌로 적으면 고아 행 처리·
   확인 버튼 게이트 같은 규칙이 곧 갈린다. 하나로 두고 행 데이터만 바꾼다.

   `openStaffPicker`(order-screen.js)도 이 함수에 위임한다 — 담당자 모달의 동작과
   픽셀이 그대로 유지되는 것이 이 구조의 조건이다.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { openModal } from "../ui.js";
import { onPhoneInput } from "./phone.js";
import { parseOrderUrl, AUTOFILL_HINT } from "../data/order-autofill.js";

export const MANUAL = "__manual";

/**
 * 단일 선택 행 리스트 다이얼로그.
 * @param {object} o
 *  - title, desc, width      (width 는 px 숫자 — 폭만 다른 클래스를 세 개 만들지 않는다)
 *  - rows[]                  { v, name, sub, meta, orphan }  v = 선택값
 *  - current                 현재 값
 *  - confirmLabel            확인 버튼 문구
 *  - confirmIcon             확인 버튼 아이콘 이름(선택)
 *  - onPick(v, manual)       false 를 돌려주면 토스트 없이 닫기만 한다.
 *                            직접 입력을 고르면 v === MANUAL 이고 manual = { name, phone }
 *  - pickedMsg(v, manual)    성공 토스트 문구
 *  - empty                   행이 없을 때 보여줄 문구
 *  - manual                  { label, hint } — 목록에 없는 사람을 직접 적는 경로.
 *                            ⚠️ 이 경로가 없으면 담당자가 0명인 거래처에서 **등록 자체가
 *                            막힌다**. 구 시스템에 담당자 필드가 없어 이관 거래처 19곳 중
 *                            18곳이 담당자 0명이다 — 목록만으로는 막다른 길이다.
 *  - toast
 */
export function openRowPicker(o) {
  const rows = o.rows || [];
  let pick = o.current || "";

  const man = o.manual || null;
  const manVal = { name: "", phone: "" };

  const manualBlock = () => {
    if (!man) return "";
    return html`
      <div class="odlg-manual">
        <button type="button" class="odlg-row ${pick === MANUAL ? "is-sel" : ""}" role="radio"
          aria-checked="${pick === MANUAL ? "true" : "false"}" data-pickrow="${MANUAL}">
          <span class="odlg-row__main">
            <span class="odlg-row__name">${man.label || "직접 입력"}</span>
            <span class="odlg-row__dept">${man.hint || "목록에 없는 사람"}</span>
          </span>
        </button>
        <div class="odlg-manual__f" data-slot="manf" ${pick === MANUAL ? "" : "hidden"}>
          <input type="text" class="ord-in" data-mf="name" placeholder="이름" aria-label="이름"
            value="${manVal.name}" ${pick === MANUAL ? "" : "disabled"} />
          <input type="text" class="ord-in" data-mf="phone" placeholder="연락처" inputmode="numeric"
            aria-label="연락처" value="${manVal.phone}" ${pick === MANUAL ? "" : "disabled"} />
        </div>
      </div>`;
  };

  /* 확인 가능 여부 — 직접 입력은 이름이 있어야 한다(연락처는 없으면 알림만 못 간다). */
  const canOk = () => (pick === MANUAL ? !!manVal.name.trim() : !!pick);

  const listBody = () => {
    if (!rows.length) {
      return html`<p class="odlg-empty">${o.empty || "선택할 항목이 없습니다."}</p>${manualBlock()}`;
    }
    return html`${rows.map((r) => html`
      <button type="button" class="odlg-row ${pick === r.v ? "is-sel" : ""} ${r.orphan ? "odlg-row--orphan" : ""}"
        role="radio" aria-checked="${pick === r.v ? "true" : "false"}" data-pickrow="${r.v}">
        <span class="odlg-row__main">
          <span class="odlg-row__name">${r.name}</span>
          ${r.sub ? html`<span class="odlg-row__dept">${r.sub}</span>` : ""}
          ${r.orphan ? html`<span class="odlg-row__dept">목록에 없음</span>` : ""}
        </span>
        ${r.meta ? html`<span class="odlg-row__meta">${r.meta}</span>` : ""}
      </button>`)}${manualBlock()}`;
  };

  const m = openModal({
    panelClass: "modal-panel--ordconfirm",
    body: html`
      <div class="hm__head">
        <div>
          <h3 id="modal-title">${o.title}</h3>
          ${o.desc ? html`<p>${o.desc}</p>` : ""}
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="odlg-rows" role="radiogroup" aria-label="${o.title}" data-slot="rows">${listBody()}</div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="ok" ${canOk() ? "" : "disabled"}>${
          o.confirmIcon ? icon(o.confirmIcon, { size: 14 }) : ""}${o.confirmLabel || "선택"}</button>
      </div>`,
  });
  if (o.width) m.panel.style.width = `${o.width}px`;

  const syncOk = () => { const ok = qs(m.panel, "[data-action='ok']"); if (ok) ok.disabled = !canOk(); };

  on(m.panel, "click", "[data-pickrow]", (e, t) => {
    pick = t.dataset.pickrow;
    qsa(m.panel, "[data-pickrow]").forEach((b) => {
      const on2 = b.dataset.pickrow === pick;
      /* ⚠️ `is-sel` 이다 — `is-on` 을 칠하는 규칙은 없다(선택 표시가 통째로 안 보였다). */
      b.classList.toggle("is-sel", on2);
      b.setAttribute("aria-checked", on2 ? "true" : "false");
    });
    /* 직접 입력 칸은 그 행을 골랐을 때만 산다 — 숨은 채로 Tab 순서에 남으면
       포커스가 보이지 않는 칸으로 빠진다(openModal 의 트랩이 hidden 도 잡는다). */
    const box = qs(m.panel, "[data-slot='manf']");
    if (box) {
      const live = pick === MANUAL;
      box.hidden = !live;
      qsa(box, "input").forEach((el) => { el.disabled = !live; });
      if (live) { const n = qs(box, "[data-mf='name']"); if (n) n.focus(); }
    }
    syncOk();
  });
  on(m.panel, "input", "[data-mf]", (e, t) => {
    manVal[t.dataset.mf] = t.dataset.mf === "phone" ? onPhoneInput(t) : t.value;
    syncOk();
  });
  on(m.panel, "click", "[data-action='close']", () => m.close());
  on(m.panel, "click", "[data-action='ok']", () => {
    if (!canOk()) return;
    const mv = { name: manVal.name.trim(), phone: manVal.phone.trim() };
    const r = o.onPick ? o.onPick(pick, mv) : undefined;
    m.close();
    if (r === false) return;
    if (o.toast && o.pickedMsg) o.toast(o.pickedMsg(pick, mv), "ok");
  });
  return m;
}

/* ── 자동작성 ───────────────────────────────────────────────
   부고장·청첩장 링크에서 배송 정보를 읽는다. **판정은 `parseOrderUrl` 몫**이고
   이 함수는 묻고 보여줄 뿐이다 — 실 API 가 붙어도 여기는 바뀌지 않는다.

   인식 실패를 조용히 넘기지 않는다: 어떤 링크를 아는지 그 자리에서 말해 준다.
   (모달을 닫고 토스트로 알리면 사용자가 방금 붙여 넣은 링크를 잃는다.)
   ────────────────────────────────────────────────────────── */
export function openAutofill({ toast, onApply }) {
  let err = "";
  const m = openModal({
    panelClass: "modal-panel--ordconfirm",
    labelledBy: "modal-title",
    body: html`
      <div class="hm__head">
        <div>
          <h3 id="modal-title">링크로 자동작성</h3>
          <p>부고장·청첩장 링크를 붙여 넣으면 배송지와 받는분을 채웁니다.</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="odlg-auto">
          <input type="url" class="ord-in" data-au placeholder="https://..." aria-label="부고장·청첩장 링크" />
          <p class="odlg-auto__err" data-slot="auerr" hidden>${err}</p>
          <p class="odlg-auto__hint">인식 가능한 링크 · ${AUTOFILL_HINT}</p>
        </div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="au-go">불러오기</button>
      </div>`,
  });
  m.panel.style.width = "520px";

  const showErr = (t) => {
    const box = qs(m.panel, "[data-slot='auerr']");
    if (!box) return;
    box.textContent = t;
    box.hidden = !t;
  };
  on(m.panel, "input", "[data-au]", () => showErr(""));
  on(m.panel, "click", "[data-action='close']", () => m.close());
  on(m.panel, "click", "[data-action='au-go']", () => {
    const raw = (qs(m.panel, "[data-au]") || {}).value || "";
    if (!String(raw).trim()) { showErr("링크를 붙여 넣으세요."); return; }
    const res = parseOrderUrl(raw);
    if (!res) { showErr("인식하지 못한 링크입니다. 아래 목록의 링크인지 확인하세요."); return; }
    m.close();
    onApply && onApply(res);
    toast && toast(res.kind === "obit" ? "부고장에서 배송 정보를 불러왔습니다" : "청첩장에서 배송 정보를 불러왔습니다", "ok");
  });
  const first = qs(m.panel, "[data-au]");
  if (first) first.focus();
  return m;
}
