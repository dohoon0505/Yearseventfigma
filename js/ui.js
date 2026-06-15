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

/** Standard titled modal (ports Modal.tsx chrome): title bar + X + body slot.
 *  Any [data-action="close"] / [data-modal-close] element closes it. */
export function simpleModal({ title, body, panelClass = "", onClose } = {}) {
  const inner = html`
    <div class="modal-head">
      <h2 class="modal-title" id="modal-title">${title}</h2>
      <button class="modal-close" data-action="close" data-modal-close aria-label="닫기">
        ${icon("x", { size: 18 })}
      </button>
    </div>
    <div class="modal-body">${body}</div>
  `;
  const m = openModal({ panelClass, body: inner, labelledBy: "modal-title", onClose });
  m.panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='close']")) m.close();
  });
  return m;
}
