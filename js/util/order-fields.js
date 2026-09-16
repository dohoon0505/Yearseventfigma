/* ============================================================
   order-fields.js — 주문 폼 조각 (모달 중립)

   **주문 상세 모달과 주문서 등록 모달은 다른 모달이다**(서로 import 하지 않는다).
   그런데 "같은 픽셀을 그리는 코드"는 공유해야 한다 — 값 타이포 17px semibold,
   96px 라벨 + 1fr 값의 행, 잠금 칸 톤, 배송일시 피커 마크업. 둘로 나눠 적으면
   한 화면 안에서 두 모달이 갈린다.

   그래서 이 파일이 **중립 지대**다: 여기 있는 것은 어느 모달에도 속하지 않는
   폼 프리미티브뿐이고, 상세 셸(스테퍼·처리 레일·이력·요약)은 order-screen.js,
   등록 위저드 셸은 order-create.js 가 각자 갖는다.

   짝이 되는 스타일은 css/components.css 의 `.ord-card*`·`.ord-row`·`.ord-in*`.
   ============================================================ */
import { html } from "../dom.js";
import { BIZ } from "./date.js";

/* ── 표기 ──────────────────────────────────────────────── */
export const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pad2 = (n) => String(n).padStart(2, "0");
export const dash = (v) => (v != null && String(v).trim() ? v : "-");

/* 이 프로젝트에는 주문 날짜 포맷이 셋이다 —
     B2C 접수 "2026-09-15 15:20" · B2B 주문 "2026/09/15 09:10"
     배송희망 "2026-09-16T11:00"(datetime-local)
   한 셀에 둘이 같이 들어가므로(접수/배송 2행) 표시 단계에서 모양을 맞춘다.
   ⚠️ 저장 포맷은 건드리지 말 것 — util/date.js 의 parseOrderDate 는
      슬래시로만 쪼갠다. 바꾸면 기간 필터가 통째로 NaN 이 된다. */
export const fmtFull = (s) => (s ? String(s).replace(/\//g, "-").replace("T", " ") : "-");

/* 위 세 포맷을 전부 받는 파서 (없거나 깨지면 null) */
export function parseFlexDate(s) {
  if (!s) return null;
  const [datePart, timePart] = String(s).replace(/\//g, "-").replace("T", " ").split(" ");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  const [hh = 0, mm = 0] = (timePart || "00:00").split(":").map(Number);
  return y && m && d ? new Date(y, m - 1, d, hh, mm) : null;
}

/** 영업시간 캡션 — 문자열을 손으로 적지 않는다(BIZ 가 바뀌면 안내가 갈린다). */
const bizHours = () => `${pad2(BIZ.openH)}:00 ~ ${pad2(BIZ.closeH)}:${pad2(BIZ.closeM)}`;

/* 배송일시 피커 마크업 — ui.js 의 makeDateTimePicker 와 짝.
   ⚠️ 바깥 껍데기에 `.dd` 를 붙이지 말 것. makeDropdown 이 열릴 때 `.dd.open` 을
      전부 닫으므로, 안에 든 시/분 드롭다운을 여는 순간 달력이 스스로 닫힌다. */
export const dtpMarkup = () => html`
  <div class="ord-dtp" data-dtp>
    <button type="button" class="ord-dtp__trigger" aria-haspopup="dialog" aria-expanded="false"></button>
    <div class="ord-dtp__panel" role="dialog" aria-label="배송일시 선택">
      <div class="cal-head">
        <button type="button" class="cal-nav cal-prev" aria-label="이전 달">‹</button>
        <span class="cal-title"></span>
        <button type="button" class="cal-nav cal-next" aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid"></div>
      <div class="ord-dtp__time">
        <div class="ord-dtp__rule">
          <b class="ord-dtp__tlbl">배송 시간</b>
          <span class="ord-dtp__tcap">${bizHours()}</span>
        </div>
        <div class="ord-dtp__row">
          <div class="dd" data-dtp-h>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
          <span class="ord-dtp__colon">:</span>
          <div class="dd" data-dtp-m>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
        </div>
      </div>
      <div class="ord-dtp__foot">
        <span class="ord-dtp__fval"></span>
        <span class="ord-dtp__acts">
          <button type="button" class="ord-dtp__cancel" data-dtp-cancel>취소</button>
          <button type="button" class="ord-dtp__done" data-dtp-done>완료</button>
        </span>
      </div>
    </div>
  </div>`;

/* ── 카드 ─────────────────────────────────────────────────── */
export const card = ({ title, cap, body, slot, cls }) => html`
  <section class="ord-card ${cls || ""}">
    <div class="ord-card__head">
      <b class="ord-card__t">${title}</b>
      ${cap ? html`<span class="ord-card__cap">${cap}</span>` : ""}
    </div>
    <div data-slot="${slot || ""}">${body}</div>
  </section>`;

/* ── 상시 편집 필드 ───────────────────────────────────────────
   서술자: { k, label, type, full, lock, ph, options, fmt, value, onText, offText }
   type: text · tel · num · won · select · datetime · textarea · static · toggle · pick
   full:true 는 단독 행(96px + 1fr), 아니면 두 개씩 묶어 한 행(96/1fr/96/1fr). */
function fieldCell(d, order) {
  const v = d.value ? d.value(order) : (order[d.k] ?? "");
  if (d.type === "static" || d.lock) {
    const cls = "ord-in ord-in--lock" + (d.type === "won" ? " ord-in--won" : "");
    return html`<input class="${cls}" value="${d.type === "won" ? won(v) : v}" data-slot="${d.k || d.label}" disabled />`;
  }
  if (d.type === "select") {
    /* 셸(.ord-fdd)만 남기고 트리거는 클래스를 안 준다 — 공용 `.modal-panel .dd-trigger`
       (0,2,0)가 어차피 이기므로, 톤은 아래 .ord-fdd 스코프 규칙에서 되돌린다. */
    return html`<div class="dd ord-fdd" data-dd-f="${d.k}">
      <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="dd-panel" role="listbox"></div>
    </div>`;
  }
  if (d.type === "datetime") return dtpMarkup();
  /* 값을 다이얼로그로 고르는 칸(주문 요청자·발송 프로필). 값 자체는 읽기 전용이고
     버튼이 선택기를 연다 — 호출부가 `[data-pick]` 을 위임으로 받는다. */
  if (d.type === "pick") {
    return html`<div class="ord-pick">
      <span class="ord-pick__v ${v ? "" : "is-empty"}">${v || d.ph || "선택하세요"}</span>
      <button type="button" class="ord-pick__btn" data-pick="${d.k}">${v ? "변경" : "선택"}</button>
    </div>`;
  }
  /* 켜짐/꺼짐 — 상태의 유일한 소스는 `aria-checked` 다(클래스가 아니다). */
  if (d.type === "toggle") {
    const on = !!v;
    return html`<div class="ord-tgl">
      <button type="button" class="toggle" role="switch" data-tgl="${d.k}"
        aria-checked="${on ? "true" : "false"}" aria-label="${d.label}"><span class="toggle__knob"></span></button>
      <span class="ord-tgl__lbl">${on ? (d.onText ?? "켜짐") : (d.offText ?? "꺼짐")}</span>
    </div>`;
  }
  if (d.type === "textarea") {
    return html`<textarea class="ord-in" data-f="${d.k}" rows="1" placeholder="${d.ph ?? ""}">${v}</textarea>`;
  }
  const extra = d.type === "won" ? " ord-in--won" : d.type === "tel" || d.type === "num" ? " ord-in--num" : "";
  const numeric = d.type === "tel" || d.type === "num" || d.type === "won";
  return html`<input class="ord-in${extra}" data-f="${d.k}" value="${d.type === "won" ? won(v) : v}"
    inputmode="${numeric ? "numeric" : "text"}" placeholder="${d.ph ?? ""}" />`;
}

export function renderFields(defs, order) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const top = buf.some((d) => d.type === "textarea");
    out.push(html`<div class="ord-row ${buf.length === 1 ? "ord-row--full" : ""} ${top ? "ord-row--top" : ""}">
      ${buf.map((d) => html`<label class="ord-k">${d.label}</label>${fieldCell(d, order)}`)}
    </div>`);
    buf = [];
  };
  for (const d of defs) {
    if (d.full) { flush(); buf = [d]; flush(); continue; }
    buf.push(d);
    if (buf.length === 2) flush();
  }
  flush();
  return out;
}

/* 자동 높이 textarea — 붙여넣기로 줄이 늘어도 스크롤바가 생기지 않게 */
export const autosize = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.max(34, el.scrollHeight) + "px";
};
