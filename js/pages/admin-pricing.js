/* ============================================================
   admin-pricing.js — 기업별 상품단가 설정
   거래처를 선택해 상품별 단가를 오버라이드(맞춤) 설정한다. 저장 시
   store.clientPrices에 영속되며, 해당 거래처 계정으로 로그인하면
   '상품 규격 안내'의 금액에 반영된다. 비워두면 기본 단가 적용.
   ============================================================ */
import { html, setHTML, on, qs, el } from "../dom.js";
import { icon } from "../icons.js";
import { store, ALL_PRODUCTS, productKey, priceNum, won } from "../store.js";
import { pageTitle } from "../ui.js";

const COL = "104px 1fr 150px 196px 84px";
const HEADERS = ["구분", "상세상품", "기본 단가", "적용 단가", "맞춤"];
const CATS = ["전체", "경조화환", "관엽화분", "동서양란", "생화"];

export function mount(root, { nav }) {
  const clients = store.get().clients;
  const state = {
    clientId: clients[0] ? clients[0].id : null,
    category: "전체",
    draft: {}, // { [productKey]: number } working overrides for the selected client
  };
  let toastEl = null;
  let toastTimer = null;

  function loadDraft() {
    state.draft = { ...(store.get().clientPrices[state.clientId] || {}) };
  }
  loadDraft();

  function toast(msg, kind = "ok") {
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl = el(html`<div class="admin-toast admin-toast--${kind}">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; toastTimer = null; }, 2600);
  }

  const visible = () => (state.category === "전체" ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => p.category === state.category));
  const customCount = () => Object.values(state.draft).filter((v) => typeof v === "number" && v > 0).length;
  const clientName = () => (store.get().clients.find((c) => c.id === state.clientId) || {}).companyName || "";

  const badgeHtml = (custom) => (custom ? html`<span class="pill pill--blue">맞춤</span>` : html`<span class="prc-dash">–</span>`);

  function tableBody() {
    const rows = visible();
    if (rows.length === 0) return html`<div class="admin-empty">상품이 없습니다.</div>`;
    return html`
      <div class="settle-table">
        <div class="settle-thead" style="grid-template-columns:${COL}">
          ${HEADERS.map((h) => html`<div class="settle-th">${h}</div>`)}
        </div>
        ${rows.map((p) => {
          const key = productKey(p);
          const def = priceNum(p.price);
          const ov = state.draft[key];
          const custom = typeof ov === "number" && ov > 0;
          return html`
            <div class="settle-trow" style="grid-template-columns:${COL}">
              <div class="settle-td settle-td--muted">${p.category}</div>
              <div class="settle-td"><span class="ellipsis">${p.product}</span></div>
              <div class="settle-td prc-default">${won(def)}</div>
              <div class="settle-td">
                <div class="prc-input">
                  <input type="text" inputmode="numeric" data-pk="${key}" value="${custom ? ov : ""}" placeholder="${def.toLocaleString("ko-KR")}" aria-label="${p.product} 적용 단가" />
                  <span class="prc-won">원</span>
                  <button class="prc-reset" data-action="reset-row" data-pk="${key}" title="기본 단가로">기본</button>
                </div>
              </div>
              <div class="settle-td prc-badge" data-badge="${key}" style="justify-content:center">${badgeHtml(custom)}</div>
            </div>
          `;
        })}
      </div>
    `;
  }
  function summaryBody() {
    return html`<strong>${clientName()}</strong> · 총 ${visible().length}개 상품 · 맞춤 단가 <strong>${customCount()}</strong>개 적용`;
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-product.png", title: "기업별 상품단가 설정" })}
            <div class="orders-filters">
              <div class="orders-frow orders-frow--1">
                <div class="orders-fgroup">
                  <span class="orders-flabel">거래처 선택</span>
                  <select class="select" data-ctl="client">
                    ${store.get().clients.map((c) => html`<option value="${c.id}" ${state.clientId === c.id ? "selected" : ""}>${c.companyName}</option>`)}
                  </select>
                </div>
                <div class="orders-divider"></div>
                <div class="orders-fgroup">
                  <span class="orders-flabel">상품 분류</span>
                  <div class="orders-chips">
                    ${CATS.map((c) => html`<button class="chip ${state.category === c ? "is-active" : ""}" data-action="cat" data-v="${c}">${c}</button>`)}
                  </div>
                </div>
              </div>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
            <div class="prc-savebar">
              <span class="prc-hint">${icon("info", { size: 13, cls: "tint-blue" })} 비워두면 기본 단가가 적용됩니다. 저장 시 해당 거래처의 ‘상품 규격 안내’에 반영됩니다.</span>
              <div class="prc-savebar__btns">
                <button class="btn btn-secondary" data-action="reset-all">전체 기본가로</button>
                <button class="prc-save" data-action="save">${icon("save", { size: 15 })} 저장</button>
              </div>
            </div>
          </div>
        </div>
      `
    );
  }

  const refreshTableSummary = () => {
    const t = qs(root, "[data-slot='table']");
    const s = qs(root, "[data-slot='summary']");
    if (t) setHTML(t, tableBody());
    if (s) setHTML(s, summaryBody());
  };
  const refreshSummary = () => {
    const s = qs(root, "[data-slot='summary']");
    if (s) setHTML(s, summaryBody());
  };

  render();

  const offChange = on(root, "change", "[data-ctl='client']", (e, t) => {
    state.clientId = t.value;
    loadDraft();
    render();
  });
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "cat") {
      state.category = t.dataset.v;
      refreshTableSummary();
    } else if (a === "reset-row") {
      delete state.draft[t.dataset.pk];
      refreshTableSummary(); // click → safe to re-render (clears input + badge)
    } else if (a === "reset-all") {
      state.draft = {};
      refreshTableSummary();
      toast(`${clientName()} 단가를 모두 기본가로 되돌렸습니다 · 저장이 필요합니다`, "warn");
    } else if (a === "save") {
      store.setClientPrices(state.clientId, state.draft);
      toast(`${clientName()} 상품 단가를 저장했습니다 · 상품 규격 안내에 반영됩니다`, "ok");
    }
  });
  // typing: update draft + live count/badge WITHOUT re-render (preserve input focus)
  const offInput = on(root, "input", "[data-pk]", (e, t) => {
    const key = t.dataset.pk;
    const n = parseInt(t.value.replace(/[^0-9]/g, ""), 10);
    const custom = n > 0;
    if (custom) state.draft[key] = n;
    else delete state.draft[key];
    refreshSummary();
    const badge = qs(root, `[data-badge="${key}"]`);
    if (badge) setHTML(badge, badgeHtml(custom));
  });

  return () => {
    offChange();
    offClick();
    offInput();
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
  };
}
