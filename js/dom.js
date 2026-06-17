/* ============================================================
   dom.js — tiny DOM + templating helpers (no framework)
   ============================================================ */

/** Trusted-HTML wrapper. Coerces to its raw string via toString(),
 *  so `el.innerHTML = html`…`` works and nested templates compose. */
class Html {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mark a string as already-safe HTML (SVG, pre-built markup). */
export function raw(s) {
  return new Html(s == null ? "" : String(s));
}

function serialize(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Html) return v.s;
  if (Array.isArray(v)) return v.map(serialize).join("");
  return escapeHtml(v); // plain values are escaped by default (XSS-safe)
}

/** Tagged template. Interpolated values are HTML-escaped unless they are
 *  Html instances (from html`` / raw()) or arrays thereof. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += serialize(values[i]) + strings[i + 1];
  }
  return new Html(out);
}

/** Set innerHTML from an Html instance, string, or array thereof.
 *  Arrays are joined with "" (not the default ","), matching how the
 *  html`` tag serializes interpolated arrays. */
export function setHTML(el, h) {
  el.innerHTML =
    h == null
      ? ""
      : Array.isArray(h)
      ? h.map((x) => (x == null ? "" : x.toString())).join("")
      : h.toString();
  return el;
}

/** Build a detached element from an html`` template (first element child). */
export function el(h) {
  const tpl = document.createElement("template");
  tpl.innerHTML = h == null ? "" : h.toString();
  return tpl.content.firstElementChild;
}

/** Delegated listener. Returns an unsubscribe fn.
 *  on(parent, 'click', '[data-x]', (e, target) => {}) */
export function on(parent, type, selector, handler) {
  if (typeof selector === "function") {
    const fn = selector;
    parent.addEventListener(type, fn);
    return () => parent.removeEventListener(type, fn);
  }
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) handler(e, target);
  };
  parent.addEventListener(type, listener);
  return () => parent.removeEventListener(type, listener);
}

export const qs = (root, sel) => root.querySelector(sel);
export const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));
export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

/** Korean currency: 50000 -> "50,000원" */
export const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
