/* ============================================================
   ui.js — shared UI factories
   pageTitle() · openModal() (focus-trapped) · tableGrid() (DataTable)
   ============================================================ */
import { html, setHTML, on, qsa } from "./dom.js";
import { icon } from "./icons.js";
import { hourOptions, minOptions, clampMin } from "./util/date.js";

/* ── 주문 목록 행 색 범례 ────────────────────────────────
   색만 깔아 두면 "이 분홍은 뭐죠"를 매번 묻는다(시인성 우선 규약).
   견본은 행과 **같은 `ordrow--*` 클래스**를 쓴다 — 색을 따로 적으면 언젠가
   행과 어긋난다. 톤 클래스가 넘겨 주는 `--row-tone` 을 그대로 받아 칠한다.
   `cancel:false` 는 취소 상태가 없는 화면(거래처 포털)용. */
export const rowToneLegend = ({ cancel = true } = {}) => html`
  <span class="rt-leg">
    <span class="rt-leg__i"><i class="rt-sw ordrow--wait"></i>접수대기</span>
    <span class="rt-leg__i"><i class="rt-sw ordrow--today"></i>당일·지연</span>
    <span class="rt-leg__i"><i class="rt-sw ordrow--booked"></i>예약</span>
    <span class="rt-leg__i"><i class="rt-sw"></i>배송완료</span>
    ${cancel ? html`<span class="rt-leg__i"><i class="rt-sw ordrow--void"></i>취소</span>` : ""}
  </span>`;

/* ── PageTitle (ports PageTitle.tsx) ────────────────────── */
export function pageTitle({ icon, imgSrc, title, action } = {}) {
  return html`
    <div class="page-title">
      <div class="page-title__main">
        ${imgSrc
          ? html`<img class="page-title__img" src="${imgSrc}" alt="" />`
          : icon
          ? html`<span class="page-title__emoji">${icon}</span>`
          : ""}
        <h1>${title}</h1>
      </div>
      ${action ? html`<div>${action}</div>` : ""}
    </div>
  `;
}

/* ── 리모델 시안 머리글 ──────────────────────────────────
   28px 제목 + 32px 아이콘 + 17px 부제(+ 선택적 아래 구분선).
   공용 `pageTitle()` 은 22px bold 에 부제 슬롯이 없다 — 그걸 고치면 옛 화면 15개가
   전부 따라 바뀌므로 새 규격을 옆에 둔다. claude.ai/design 리모델 시안을 이식한
   화면들이 쓴다(상품 규격 안내·프로필 저장공간…). 페이지마다 복제하지 말 것. */
export function pageHead({ imgSrc, title, desc, rule = false, action } = {}) {
  return html`
    <div class="page-hd ${rule ? "page-hd--rule" : ""}">
      <div class="page-hd__l">
        <h1>${imgSrc ? html`<img src="${imgSrc}" alt="" />` : ""}${title}</h1>
        ${desc ? html`<p>${desc}</p>` : ""}
      </div>
      ${action ? html`<div class="page-hd__r">${action}</div>` : ""}
    </div>
  `;
}

/* ── DataTable grid (ports DataTable.tsx) ───────────────── */
/* rowClass(row, idx) → 행에 추가할 클래스. 그룹 접기처럼 같은 그리드 위에서 행 종류를
   구분해야 할 때 쓴다(미전달 시 기존과 동일). */
export function tableGrid({ columns, rows, rowKey, rowClass, compact = false, fit = false }) {
  const cols = columns.map((c) => c.width ?? "1fr").join(" ");
  const acls = (a) => (a === "center" ? "is-center" : a === "right" ? "is-right" : "");
  return html`
    <div
      class="table-grid ${compact ? "table-grid--compact" : ""} ${fit ? "table-grid--fit" : ""}"
    >
      <div class="table-grid__head" style="grid-template-columns:${cols}">
        ${columns.map(
          (c) => html`<div class="table-grid__cell ${acls(c.align)}">${c.headerLabel ?? c.label}</div>`
        )}
      </div>
      ${rows.map(
        (row, idx) => html`
          <div
            class="table-grid__row ${rowClass ? rowClass(row, idx) : ""}"
            data-rowkey="${rowKey(row, idx)}"
            style="grid-template-columns:${cols}"
          >
            ${columns.map(
              (c) => html`<div class="table-grid__cell ${acls(c.align)}">${c.render(row, idx)}</div>`
            )}
          </div>
        `
      )}
    </div>
  `;
}

/* 행 아무 데나 눌러 그 행을 여는 표 — tableGrid 가 찍는 `data-rowkey` 위에서만 돈다.
   주문 3화면(#/admin/b2c · #/admin/orders · #/app/orders)과 상품 규격 안내가 함께 쓴다.
   ⚠️ 가드 둘이 핵심이다.
     1) 안쪽 컨트롤은 비켜 간다 — 안 그러면 셀 안 연필/별을 눌렀을 때 그 버튼의 동작과
        행 열기가 **둘 다** 터진다.
     2) 드래그 선택 중이면 열지 않는다 — 표 본문을 긁어 복사하는 흐름이 흔하다.
   ⚠️ `tableGrid` 옆에 산다(예전엔 util/order-screen.js). 상품 화면이 그 모듈을 import 하면
      드롭다운·데이트피커·모달 그래프가 통째로 딸려 오는데, 이 함수는 순수 DOM 플러밍이라
      그럴 이유가 없다. order-screen.js 가 기존 호출부 호환으로 재수출한다. */
export const onRowOpen = (root, open) =>
  on(root, "click", ".table-grid__row[data-rowkey]", (e, t) => {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (!window.getSelection().isCollapsed) return;
    open(t.dataset.rowkey);
  });

/* ── Modal chrome with ESC / backdrop / focus-trap ──────── */
/* 열려 있는 모달 전부 — 라우트가 바뀔 때 일괄 정리한다.
   페이지 cleanup 은 **자기가 연 것만** 안다. 주문 모달 위에 스택되는 담당자 피커처럼
   컴포넌트가 스스로 연 모달은 페이지가 모르므로 남아서 다음 화면을 덮는다. */
const OPEN_MODALS = new Set();

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * openModal({ panelClass, body, labelledBy, onClose }) → { panel, close, render }
 * - body: Html|string for the panel inner content
 * - render(newBody): swap panel content (state-driven modals) and re-focus-trap
 * - any element with [data-modal-close] (e.g. backdrop, X button) closes it
 */
export function openModal({ panelClass = "", body, labelledBy, onClose, onEsc } = {}) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    `<div class="modal-overlay__backdrop" data-modal-close></div>` +
    `<div class="modal-panel ${panelClass}" role="dialog" aria-modal="true"${
      labelledBy ? ` aria-labelledby="${labelledBy}"` : ""
    } tabindex="-1"></div>`;
  const panel = overlay.querySelector(".modal-panel");
  setHTML(panel, body);
  document.body.appendChild(overlay);
  OPEN_MODALS.add(close); /* function 선언이라 호이스팅된다 */

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    OPEN_MODALS.delete(close);
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose();
  }
  function focusFirst() {
    const f = qsa(panel, FOCUSABLE);
    (f[0] || panel).focus();
  }
  function onKey(e) {
    if (document.querySelector(".lightbox")) return; /* 라이트박스 우선 */
    /* 배송일시 피커가 열려 있으면 ESC 는 피커 몫이다. 상시 편집 모달에서 ESC 한 번에
       미저장 편집이 통째로 날아가는 것을 막는다. capture 등록 순서상 이 가드가 아니면
       피커 쪽 stopPropagation 이 늦어 소용이 없다. */
    const dtp = document.querySelector(".ord-dtp.is-open");
    if (dtp && overlay.contains(dtp)) return;
    /* 스택된 모달 지원: 최상위(마지막에 열린) 오버레이만 ESC/Tab 처리 —
       오버레이가 1개뿐인 기존 사용처는 항상 최상위라 무영향. */
    const overlays = document.querySelectorAll(".modal-overlay");
    if (overlay !== overlays[overlays.length - 1]) return;
    if (e.key === "Escape") {
      e.preventDefault();
      /* 닫기 전에 한 번 물어볼 기회 — `false` 를 돌려주면 닫지 않는다.
         ⚠️ 호출부가 자기 capture 리스너로 ESC 를 가로채는 것은 소용이 없다.
            이 핸들러가 `openModal` 안에서 **먼저** 등록되므로 같은 단계에서는
            등록 순서가 이긴다(등록 위저드의 이중 확인이 실제로 죽어 있었다). */
      if (onEsc && onEsc() === false) return;
      close();
    } else if (e.key === "Tab") {
      const f = qsa(panel, FOCUSABLE);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-modal-close]")) close();
  });
  document.addEventListener("keydown", onKey, true);
  focusFirst();

  return {
    panel,
    close,
    render(newBody) {
      setHTML(panel, newBody);
      focusFirst();
    },
  };
}

/** 열려 있는 모달을 전부 닫는다(최근에 연 것부터). 라우터가 화면 전환 때 호출한다. */
export function closeAllModals() {
  [...OPEN_MODALS].reverse().forEach((close) => {
    try {
      close();
    } catch (e) {
      console.error("[modal] close failed", e);
    }
  });
  OPEN_MODALS.clear();
}

/** openLightbox({ src, alt, caption }) — 이미지 원본 비율 확대 보기.
 *  세로형(2:3) 사진을 화면 높이에 맞춰 크게 보여준다. ESC/클릭으로 닫힘. */
export function openLightbox({ src, alt = "", caption = "" } = {}) {
  const prevFocus = document.activeElement;
  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", caption || alt || "이미지 크게 보기");

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  el.appendChild(img);

  const btn = document.createElement("button");
  btn.className = "lightbox__close";
  btn.setAttribute("aria-label", "닫기");
  btn.innerHTML = icon("x", { size: 20 });
  el.appendChild(btn);

  if (caption) {
    const cap = document.createElement("p");
    cap.className = "lightbox__cap";
    cap.textContent = caption;
    el.appendChild(cap);
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    el.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); /* 아래 모달의 ESC 핸들러보다 먼저 소비 */
      close();
    }
  }
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest(".lightbox__close")) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(el);
  btn.focus();

  return { close };
}

/* simpleModal(구 Modal.tsx 크롬 — `.hm__head`/`.hm__foot` 를 손으로 조립하던 작은 모달)은 2026-09-26 에 지웠다.
   마지막 호출부 다섯(가입 거부 · 리본 문구 · 보내는분 · 주문 접수 확인 · 회사정보 수정)을 공용 다이얼로그
   (`js/util/dialog.js` openDialog)로 옮겼다. 작은 창은 그 규격 하나다 — 이 헬퍼를 되살리지 말 것. */

/* ── Custom dropdown (harim mob 스타일 · 선택 행 블루) ─────────
   makeDropdown(rootEl, { unit, options, get, set }) → { renderTrigger, open, close, destroy }
   rootEl 은 .dd-trigger + .dd-panel 을 포함해야 한다. 값 목록은 options() 로 지연 평가.
   문서 click/ESC 로 바깥 닫힘을 등록하며, 한 번에 하나의 .dd 만 열린다. destroy() 로
   모든 리스너 해제(페이지 cleanup 에서 호출). 거래명세서 등 다른 페이지 재사용 예정. */
export function makeDropdown(root, { unit = "", options, get, set, label } = {}) {
  const trigger = root.querySelector(".dd-trigger");
  const panel = root.querySelector(".dd-panel");
  /* 표시 텍스트: label 이 있으면 값→라벨 매핑(값≠표시, 예: 담당자 index→"이름 · 직위"),
     없으면 기존처럼 값+단위. label 미전달 시 완전 하위호환. */
  const fmt = (v) => (label ? label(v) : v + unit);
  /* title 도 같이 채운다 — 좁은 칸(주문 모달 상품)에서 말줄임되면 전문을 볼 길이 없다 */
  const renderTrigger = () => { const t = fmt(get()); trigger.textContent = t; trigger.title = t; };
  const close = () => {
    if (!root.classList.contains("open")) return;
    root.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };
  function open() {
    document.querySelectorAll(".dd.open").forEach((d) => { if (d !== root) d.classList.remove("open"); });
    panel.innerHTML = options()
      .map((v) => `<button type="button" class="dd-opt ${v === get() ? "sel" : ""}" role="option" aria-selected="${v === get()}" data-v="${v}">${fmt(v)}</button>`)
      .join("");
    root.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    const sel = panel.querySelector(".dd-opt.sel");
    if (sel) panel.scrollTop = sel.offsetTop - panel.clientHeight / 2 + sel.offsetHeight / 2;
  }
  const onTrigger = () => (root.classList.contains("open") ? close() : open());
  const onPanel = (e) => {
    const o = e.target.closest("[data-v]");
    if (!o) return;
    set(o.dataset.v);
    renderTrigger();
    close();
  };
  const onDoc = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  trigger.addEventListener("click", onTrigger);
  panel.addEventListener("click", onPanel);
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey);
  renderTrigger();
  return {
    renderTrigger,
    open,
    close,
    destroy() {
      trigger.removeEventListener("click", onTrigger);
      panel.removeEventListener("click", onPanel);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    },
  };
}

/* ── Custom datepicker (드롭다운과 동일한 트리거/패널 디자인) ───
   makeDatepicker(rootEl, { get, set, min, max }) → { renderTrigger, close, destroy }
   rootEl: .dd-trigger + .cal-panel(.cal-title/.cal-prev/.cal-next/.cal-grid).
   get()/set(v) 는 "YYYY-MM-DD" 문자열. min/max 는 00:00 기준 Date (선택 범위).
   범위 밖 날짜·월이동 화살표는 자동 비활성. 드롭다운과 .dd/.open 을 공유해 상호 배타적. */
export function makeDatepicker(root, { get, set, min, max, placeholder } = {}) {
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const trigger = root.querySelector(".dd-trigger");
  const title = root.querySelector(".cal-title");
  const grid = root.querySelector(".cal-grid");
  const prev = root.querySelector(".cal-prev");
  const next = root.querySelector(".cal-next");
  const view = { y: 0, m: 0 };
  const renderTrigger = () => {
    const v = get();
    if (!v) { trigger.textContent = placeholder || "날짜 선택"; return; } // 미선택 시 플레이스홀더
    const d = new Date(v + "T00:00:00");
    trigger.textContent = `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")} (${DOW[d.getDay()]})`;
  };
  const close = () => {
    if (!root.classList.contains("open")) return;
    root.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };
  function renderGrid() {
    title.textContent = `${view.y}년 ${view.m + 1}월`;
    const first = new Date(view.y, view.m, 1);
    const last = new Date(view.y, view.m + 1, 0);
    let h = DOW.map((w) => `<span class="cal-dow">${w}</span>`).join("");
    for (let i = 0; i < first.getDay(); i++) h += "<span></span>";
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(view.y, view.m, day);
      const ymd = fmt(d);
      const dis = d < min || d > max;
      const cls = "cal-day" + (dis ? " dis" : "") + (ymd === get() ? " sel" : "") + (ymd === fmt(min) ? " today" : "");
      h += `<button type="button" class="${cls}" ${dis ? "disabled" : `data-d="${ymd}"`}>${day}</button>`;
    }
    grid.innerHTML = h;
    prev.disabled = new Date(view.y, view.m, 1) <= new Date(min.getFullYear(), min.getMonth(), 1);
    next.disabled = new Date(view.y, view.m + 1, 1) > new Date(max.getFullYear(), max.getMonth(), 1);
  }
  function open() {
    document.querySelectorAll(".dd.open").forEach((d) => { if (d !== root) d.classList.remove("open"); });
    const v = get();
    const d0 = v ? new Date(v + "T00:00:00") : new Date(); // 미선택이면 오늘 기준 월 표시
    view.y = d0.getFullYear();
    view.m = d0.getMonth();
    renderGrid();
    root.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }
  const onTrigger = () => (root.classList.contains("open") ? close() : open());
  const onPrev = () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderGrid(); };
  const onNext = () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderGrid(); };
  const onGrid = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; set(b.dataset.d); renderTrigger(); close(); };
  const onDoc = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  trigger.addEventListener("click", onTrigger);
  prev.addEventListener("click", onPrev);
  next.addEventListener("click", onNext);
  grid.addEventListener("click", onGrid);
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey);
  renderTrigger();
  return {
    renderTrigger,
    close,
    destroy() {
      trigger.removeEventListener("click", onTrigger);
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      grid.removeEventListener("click", onGrid);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    },
  };
}

/* ── 날짜 + 시각 통합 피커 (주문 모달 배송일시 전용) ────────────
   makeDateTimePicker(rootEl, { get, set, min, max }) → { renderTrigger, close, destroy }
   get()/set(v) 는 **"YYYY-MM-DDTHH:mm"** — datetime-local 과 같은 포맷이다.

   왜 makeDatepicker 를 확장하지 않았나
   - makeDatepicker 는 날짜만 다루고 필터 카드 2곳·주문 4단계가 쓴다. 시각을
     끼워 넣으면 그 세 곳의 값 포맷이 바뀐다.
   - 이 피커는 시/분을 **안쪽 .dd 드롭다운 두 개**로 갖는다. 그런데 makeDropdown 은
     열릴 때 `.dd.open` 을 전부 닫는다 — 바깥 껍데기가 .dd 면 시 드롭다운을 여는
     순간 달력이 닫힌다. 그래서 바깥은 `.ord-dtp.is-open` 이라는 독자 상태를 쓴다.
   - ESC 는 capture 단계에서 먼저 잡아 모달 대신 피커만 닫는다(openLightbox 와 같은 수법).

   rootEl 안에 있어야 할 것: .ord-dtp__trigger · .ord-dtp__panel ·
   (.cal-prev/.cal-title/.cal-next) · .cal-grid · [data-dtp-h] · [data-dtp-m] ·
   .ord-dtp__rule/.ord-dtp__tcap(영업시간 캡션) · .ord-dtp__fval ·
   [data-dtp-done] · [data-dtp-cancel](연 시점 값으로 되돌리고 닫는다)
   — 마크업 팩토리는 **util/order-fields.js** 의 dtpMarkup() 이다(order-screen.js 는 재수출만). */
export function makeDateTimePicker(root, { get, set, min, max } = {}) {
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const p2 = (n) => String(n).padStart(2, "0");
  const fmtD = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const trigger = root.querySelector(".ord-dtp__trigger");
  const title = root.querySelector(".cal-title");
  const grid = root.querySelector(".cal-grid");
  const prev = root.querySelector(".cal-prev");
  const next = root.querySelector(".cal-next");
  const fval = root.querySelector(".ord-dtp__fval");
  const panel = root.querySelector(".ord-dtp__panel");
  const doneBtn = root.querySelector("[data-dtp-done]");
  const cancelBtn = root.querySelector("[data-dtp-cancel]");
  const view = { y: 0, m: 0 };
  /* 연 시점의 값 — '취소' 가 되돌릴 대상이다.
     ⚠️ 이 피커는 날짜·시·분을 누를 때마다 곧바로 set() 으로 write-through 한다
        (초안 개념이 없다). 스냅샷 없이 취소 버튼만 달면 '완료' 와 똑같이 동작하는
        거짓 버튼이 된다. */
  let snap = null;
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return fmtD(d); })();
  /* 기존 주문의 배송일이 과거일 수 있다(배송완료 건). min 을 오늘로 고정하면 그 달로
     이동조차 못 하고 현재 값 셀이 잠긴다 → 값이 min 보다 이르면 min 을 넓힌다. */
  const lo = () => {
    const v = (get() || "").split("T")[0];
    if (!v) return min;
    const d = new Date(v + "T00:00:00");
    return d < min ? d : min;
  };

  /* 값이 비었을 때의 기준일 — **오늘**이다(min 이 아니다).
     ⚠️ 주문서 등록 모달은 `deliverAt: ""` 로 시작한다. min 을 기준으로 삼으면 달력이
        DP_MIN(2000-01-01)의 달에서 열려 '이전' 은 잠기고 '다음' 을 삼백 번 넘게 눌러야
        올해에 닿는다 — 배송일시를 사실상 고를 수 없다. 범위 밖이면 범위 안으로 당긴다. */
  const base = () => {
    const n = new Date(); n.setHours(0, 0, 0, 0);
    return min && n < min ? min : max && n > max ? max : n;
  };
  /* 값이 비었으면 기준일 09:00 을 쓴다(빈 문자열을 쪼개면 NaN). */
  const parts = () => {
    const v = get() || "";
    const [d, t] = String(v).split("T");
    return { d: d || fmtD(base()), t: (t || "09:00").slice(0, 5) };
  };
  /* ⚠️ 달력이 열려 있으면 **확정된 날이 보이는 달로 옮기고 격자를 다시 그린다.**
     시·분만 골라도 emit 은 기준일(오늘)로 날짜를 확정하는데, 선택 표시(sel)는 실제
     값에서만 오므로 그냥 두면 "아무 날도 안 골랐는데 값은 오늘로 저장됨" 이 되고,
     다른 달을 보고 있었다면 무엇이 저장됐는지 화면에서 확인할 길이 아예 없다. */
  const emit = (d, t) => {
    set(`${d}T${t}`);
    renderTrigger(); renderFoot();
    if (!root.classList.contains("is-open")) return;
    const [y, mo] = String(d).split("-").map(Number);
    if (y && mo) { view.y = y; view.m = mo - 1; }
    renderGrid();
  };

  function label(v) {
    const { d, t } = (() => { const [a, b] = String(v || "").split("T"); return { d: a, t: (b || "").slice(0, 5) }; })();
    if (!d) return "배송일시 선택";
    const [y, mo, da] = d.split("-").map(Number);
    return `${p2(mo)}월 ${p2(da)}일 (${DOW[new Date(y, mo - 1, da).getDay()]}) ${t}`;
  }
  const renderTrigger = () => { if (trigger) trigger.textContent = label(get()); };
  const renderFoot = () => { if (fval) fval.textContent = label(get()); };

  const close = () => {
    if (!root.classList.contains("is-open")) return;
    root.classList.remove("is-open");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  };

  function renderGrid() {
    /* 선택 표시는 **실제 값**에서만 온다 — parts() 의 기본일(오늘)을 쓰면 값이 없는데도
       오늘 칸이 선택된 것처럼 검게 칠해져 '이미 골랐다'고 읽힌다. */
    const sel = (get() || "").split("T")[0];
    title.textContent = `${view.y}년 ${view.m + 1}월`;
    const first = new Date(view.y, view.m, 1);
    const last = new Date(view.y, view.m + 1, 0);
    let h = DOW.map((w, i) => `<span class="cal-dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</span>`).join("");
    for (let i = 0; i < first.getDay(); i++) h += "<span></span>";
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(view.y, view.m, day);
      const ymd = fmtD(d);
      const dis = d < lo() || d > max;
      const wk = d.getDay();
      const cls = "cal-day"
        + (dis ? " dis" : "")
        + (ymd === sel ? " sel" : "")
        + (ymd === today ? " today" : "")
        + (wk === 0 ? " sun" : wk === 6 ? " sat" : "");
      h += `<button type="button" class="${cls}" ${dis ? "disabled" : `data-d="${ymd}"`}>${day}</button>`;
    }
    grid.innerHTML = h;
    /* ⚠️ 달을 옮기면 주차 수가 바뀌어 패널이 42px 자란다(6주 → 7주 달).
       열 때 한 번만 배치하면 그 순간 '완료' 버튼이 다시 화면 밖으로 나간다 —
       실측으로 2027년 1·5·10월에서 19px 잘렸다. 그려 놓고 곧바로 다시 잡는다. */
    if (root.classList.contains("is-open")) place();
    const m0 = lo();
    prev.disabled = new Date(view.y, view.m, 1) <= new Date(m0.getFullYear(), m0.getMonth(), 1);
    next.disabled = new Date(view.y, view.m + 1, 1) > new Date(max.getFullYear(), max.getMonth(), 1);
  }

  /* 팝오버는 position:fixed 다(조상 `.ord-grid`(hidden)·`.ord-pane`(auto) 의 overflow 를
     탈출하려고 — auto 든 hidden 이든 클리핑은 똑같이 한다). 그래서 좌표를 직접 잡아 준다.
     우선순위: 아래 → 위 → 화면 안으로 당기기.
     세 번째가 있어야 세로가 짧은 화면에서도 '완료' 버튼까지 다 보인다 — 패널이
     441px 라 720 화면에는 위아래 어느 쪽도 그만큼 못 내주는 구간이 있다. */
  const GAP = 6, EDGE = 8;
  /* 트리거를 잘라 내는 스크롤 조상(`.ord-grid` 가 세로 짧을 때 스크롤된다).
     open() 에서 한 번만 찾는다 — place() 는 스크롤마다 도는데 거기서
     getComputedStyle 을 조상마다 부르면 스크롤이 눈에 띄게 끊긴다. */
  let clip = null;
  function findClip(el) {
    for (let p = el && el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowY;
      if (ov === "auto" || ov === "scroll") return p;
    }
    return null;
  }
  function place() {
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    /* 트리거가 떨어져 나갔거나 숨겨졌다(카드 재렌더 등) → 좌표가 0,0 이라
       팝오버가 좌상단에 유령처럼 뜬다. 떠 있을 이유가 없으니 닫는다. */
    if (!root.isConnected || (!t.width && !t.height)) { close(); return; }
    /* 스크롤로 트리거가 컨테이너 밖으로 밀려났다 → 패널만 허공에 남는다. 같이 닫는다. */
    if (clip) {
      const c = clip.getBoundingClientRect();
      if (t.bottom <= c.top || t.top >= c.bottom) { close(); return; }
    }
    const h = panel.offsetHeight, w = panel.offsetWidth;
    /* client* 는 스크롤바를 뺀 실제 가시영역 — innerWidth 로 재면 패널 오른쪽이
       스크롤바 밑으로 들어간다. */
    const vh = document.documentElement.clientHeight;
    const vw = document.documentElement.clientWidth;
    let top = t.bottom + GAP;
    if (top + h > vh - EDGE) {
      const up = t.top - GAP - h;
      top = up >= EDGE ? up : Math.max(EDGE, Math.min(top, vh - EDGE - h));
    }
    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(Math.max(EDGE, Math.min(t.left, vw - EDGE - w))) + "px";
  }

  function open() {
    /* 다른 드롭다운은 닫고 연다 — 이 피커 자신은 .dd 가 아니라 영향을 받지 않는다 */
    document.querySelectorAll(".dd.open").forEach((d) => d.classList.remove("open"));
    const d0 = new Date(parts().d + "T00:00:00");
    view.y = d0.getFullYear();
    view.m = d0.getMonth();
    renderGrid();
    renderFoot();
    snap = get();
    root.classList.add("is-open");
    clip = findClip(trigger);
    place(); // display:block 이 된 뒤라야 offsetHeight 가 나온다
    if (trigger) trigger.setAttribute("aria-expanded", "true");
  }

  const onTrigger = () => (root.classList.contains("is-open") ? close() : open());
  const onPrev = () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderGrid(); };
  const onNext = () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderGrid(); };
  const onGrid = (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    markGridClick(); // 이 클릭으로 격자가 새로 그려진다 — 바깥 클릭 판정에서 제외
    emit(b.dataset.d, parts().t);
    renderGrid();
  };
  const onDone = () => close();
  /* 되돌리고 닫는다. 값이 그대로면 set() 을 부르지 않는다 — 호출부가 set 에서
     '수정한 항목' 카운터를 다시 세므로 헛호출이 없어야 한다. */
  const revert = () => {
    if (snap == null || snap === get()) return;
    set(snap);
    renderTrigger(); renderFoot();
    /* 시·분은 **별도 makeDropdown 인스턴스**다 — 그 트리거 글자는 자기 set 때만 다시
       그려지므로 값만 되돌리면 '14시' 라고 적힌 채 값은 09시가 된다(화면과 저장값이
       갈린다). 되돌릴 때 두 트리거도 같이 다시 그린다. */
    hDd.renderTrigger(); mDd.renderTrigger();
  };
  const onCancel = () => { revert(); close(); };
  /* ⚠️ `contains(e.target)` 만으로는 안 된다 — 날짜를 고르면 `onGrid` 가 그 자리에서
     `renderGrid()` 로 격자를 새로 그려 **눌린 버튼이 DOM 에서 떨어진다**. 그 클릭이
     document 까지 올라올 때는 이미 `contains` 가 false 라 피커가 스스로 닫혔다
     (날짜 하나 고르면 닫혀 시·분을 이어서 못 고르고 '취소' 도 누를 새가 없었다).
     ⚠️ `composedPath()` 로도 못 고친다 — 크롬은 타깃이 분리되면 빈 배열을 돌려준다.
     그래서 격자 클릭임을 **그 자리에서 표시**하고 바로 뒤 document 핸들러가 한 번
     건너뛴다(다음 tick 에 반드시 풀어 바깥 클릭을 삼키지 않게 한다). */
  let skipDoc = false;
  const markGridClick = () => { skipDoc = true; setTimeout(() => { skipDoc = false; }, 0); };
  const onDoc = (e) => {
    if (skipDoc) { skipDoc = false; return; }
    if (!root.contains(e.target)) close();
  };
  /* 창 크기가 바뀌면 트리거가 움직인다 — fixed 라 따라가지 않으므로 다시 잡는다 */
  const onResize = () => { if (root.classList.contains("is-open")) place(); };
  /* 조상 스크롤도 마찬가지다(`.ord-pane` 은 세로가 짧으면 스크롤된다). scroll 은
     버블링하지 않으니 capture 로 받는다. 패널 안 시·분 목록 스크롤은 제외. */
  const onScroll = (e) => {
    if (!root.classList.contains("is-open")) return;
    if (panel && e.target.nodeType === 1 && panel.contains(e.target)) return;
    place();
  };
  /* capture 단계에서 먼저 먹어 모달이 아니라 피커가 닫히게 한다 */
  /* ESC 는 '취소' 와 같다 — 같은 '물러나기' 제스처가 두 결과를 내면 안 된다
     (버튼은 되돌리는데 ESC 는 고른 값을 확정하던 상태였다). */
  const onKey = (e) => {
    if (e.key !== "Escape" || !root.classList.contains("is-open")) return;
    e.stopPropagation();
    revert();
    close();
  };

  if (trigger) trigger.addEventListener("click", onTrigger);
  prev.addEventListener("click", onPrev);
  next.addEventListener("click", onNext);
  grid.addEventListener("click", onGrid);
  if (doneBtn) doneBtn.addEventListener("click", onDone);
  if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  document.addEventListener("scroll", onScroll, true);

  /* 시·분 드롭다운 — 값은 항상 현재 get() 에서 다시 읽는다(외부에서 바뀔 수 있다) */
  const hDd = makeDropdown(root.querySelector("[data-dtp-h]"), {
    options: hourOptions,
    get: () => parts().t.slice(0, 2),
    set: (v) => {
      const p = parts();
      emit(p.d, `${v}:${clampMin(v, p.t.slice(3, 5))}`); // 18시로 옮기면 40/50분은 30분으로 당겨진다
      mDd.renderTrigger();
    },
    label: (v) => `${v}시`,
  });
  const mDd = makeDropdown(root.querySelector("[data-dtp-m]"), {
    options: () => minOptions(parts().t.slice(0, 2)),
    get: () => parts().t.slice(3, 5),
    set: (v) => { const p = parts(); emit(p.d, `${p.t.slice(0, 2)}:${v}`); },
    label: (v) => `${v}분`,
  });

  renderTrigger();
  renderFoot();
  return {
    renderTrigger,
    close,
    destroy() {
      if (trigger) trigger.removeEventListener("click", onTrigger);
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      grid.removeEventListener("click", onGrid);
      if (doneBtn) doneBtn.removeEventListener("click", onDone);
      if (cancelBtn) cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, true);
      hDd.destroy();
      mDd.destroy();
    },
  };
}
