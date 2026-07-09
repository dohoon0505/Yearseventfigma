/* ============================================================
   ui.js — shared UI factories
   pageTitle() · openModal() (focus-trapped) · tableGrid() (DataTable)
   ============================================================ */
import { html, raw, setHTML, qsa } from "./dom.js";
import { icon } from "./icons.js";

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

/* ── DataTable grid (ports DataTable.tsx) ───────────────── */
export function tableGrid({ columns, rows, rowKey, compact = false, fit = false }) {
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
            class="table-grid__row"
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

/* ── Modal chrome with ESC / backdrop / focus-trap ──────── */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * openModal({ panelClass, body, labelledBy, onClose }) → { panel, close, render }
 * - body: Html|string for the panel inner content
 * - render(newBody): swap panel content (state-driven modals) and re-focus-trap
 * - any element with [data-modal-close] (e.g. backdrop, X button) closes it
 */
export function openModal({ panelClass = "", body, labelledBy, onClose } = {}) {
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

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
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
    if (e.key === "Escape") {
      e.preventDefault();
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

/** Standard titled modal (ports Modal.tsx chrome): title bar + X + body slot.
 *  Any [data-action="close"] / [data-modal-close] element closes it. */
export function simpleModal({ title, subtitle, body, footer, size = "sm", panelClass = "", onClose } = {}) {
  const sizeClass = size ? `modal-panel--${size}` : "";
  const inner = html`
    <div class="hm__head">
      <div>
        <h3 id="modal-title">${title}</h3>
        ${subtitle ? html`<p>${subtitle}</p>` : ""}
      </div>
      <button class="hm__x" data-action="close" data-modal-close aria-label="닫기">${icon("x", { size: 14 })}</button>
    </div>
    <div class="hm__body">${body}</div>
    ${footer ? html`<div class="hm__foot">${footer}</div>` : ""}
  `;
  const m = openModal({ panelClass: `${sizeClass} ${panelClass}`.trim(), body: inner, labelledBy: "modal-title", onClose });
  m.panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='close']")) m.close();
  });
  return m;
}

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
  const renderTrigger = () => { trigger.textContent = fmt(get()); };
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
export function makeDatepicker(root, { get, set, min, max } = {}) {
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const trigger = root.querySelector(".dd-trigger");
  const title = root.querySelector(".cal-title");
  const grid = root.querySelector(".cal-grid");
  const prev = root.querySelector(".cal-prev");
  const next = root.querySelector(".cal-next");
  const view = { y: 0, m: 0 };
  const renderTrigger = () => {
    const d = new Date(get() + "T00:00:00");
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
    const d0 = new Date(get() + "T00:00:00");
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
