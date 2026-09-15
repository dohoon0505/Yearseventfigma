/* ============================================================
   ui.js — shared UI factories
   pageTitle() · openModal() (focus-trapped) · tableGrid() (DataTable)
   ============================================================ */
import { html, raw, setHTML, qsa } from "./dom.js";
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
    /* 배송일시 피커가 열려 있으면 ESC 는 피커 몫이다. 상시 편집 모달에서 ESC 한 번에
       미저장 편집이 통째로 날아가는 것을 막는다. capture 등록 순서상 이 가드가 아니면
       피커 쪽 stopPropagation 이 늦어 소용이 없다. */
    if (document.querySelector(".ord-dtp.is-open")) return;
    /* 스택된 모달 지원: 최상위(마지막에 열린) 오버레이만 ESC/Tab 처리 —
       오버레이가 1개뿐인 기존 사용처는 항상 최상위라 무영향. */
    const overlays = document.querySelectorAll(".modal-overlay");
    if (overlay !== overlays[overlays.length - 1]) return;
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
   .ord-dtp__fval · [data-dtp-done]  — 마크업 팩토리는 util/order-screen.js 의 dtpMarkup(). */
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
  const doneBtn = root.querySelector("[data-dtp-done]");
  const view = { y: 0, m: 0 };
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return fmtD(d); })();
  /* 기존 주문의 배송일이 과거일 수 있다(배송완료 건). min 을 오늘로 고정하면 그 달로
     이동조차 못 하고 현재 값 셀이 잠긴다 → 값이 min 보다 이르면 min 을 넓힌다. */
  const lo = () => {
    const v = (get() || "").split("T")[0];
    if (!v) return min;
    const d = new Date(v + "T00:00:00");
    return d < min ? d : min;
  };

  /* 값이 비었으면 min 날짜 09:00 을 기준으로 삼는다(빈 문자열을 쪼개면 NaN). */
  const parts = () => {
    const v = get() || "";
    const [d, t] = String(v).split("T");
    return { d: d || fmtD(min), t: (t || "09:00").slice(0, 5) };
  };
  const emit = (d, t) => { set(`${d}T${t}`); renderTrigger(); renderFoot(); };

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
    const sel = parts().d;
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
    const m0 = lo();
    prev.disabled = new Date(view.y, view.m, 1) <= new Date(m0.getFullYear(), m0.getMonth(), 1);
    next.disabled = new Date(view.y, view.m + 1, 1) > new Date(max.getFullYear(), max.getMonth(), 1);
  }

  function open() {
    /* 다른 드롭다운은 닫고 연다 — 이 피커 자신은 .dd 가 아니라 영향을 받지 않는다 */
    document.querySelectorAll(".dd.open").forEach((d) => d.classList.remove("open"));
    const d0 = new Date(parts().d + "T00:00:00");
    view.y = d0.getFullYear();
    view.m = d0.getMonth();
    renderGrid();
    renderFoot();
    root.classList.add("is-open");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
  }

  const onTrigger = () => (root.classList.contains("is-open") ? close() : open());
  const onPrev = () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderGrid(); };
  const onNext = () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderGrid(); };
  const onGrid = (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    emit(b.dataset.d, parts().t);
    renderGrid();
  };
  const onDone = () => close();
  const onDoc = (e) => { if (!root.contains(e.target)) close(); };
  /* capture 단계에서 먼저 먹어 모달이 아니라 피커가 닫히게 한다 */
  const onKey = (e) => {
    if (e.key !== "Escape" || !root.classList.contains("is-open")) return;
    e.stopPropagation();
    close();
  };

  if (trigger) trigger.addEventListener("click", onTrigger);
  prev.addEventListener("click", onPrev);
  next.addEventListener("click", onNext);
  grid.addEventListener("click", onGrid);
  if (doneBtn) doneBtn.addEventListener("click", onDone);
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey, true);

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
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey, true);
      hDd.destroy();
      mDd.destroy();
    },
  };
}
