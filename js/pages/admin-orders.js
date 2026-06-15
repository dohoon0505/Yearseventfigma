/* ============================================================
   admin-orders.js — 거래처 주문조회
   거래처 선택 → 해당 거래처의 "실시간 주문내역"(orders.js UI 재사용).
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal } from "../ui.js";
import { getDateRange, parseOrderDate, formatDateLabel } from "../util/date.js";
import { store } from "../store.js";
import { CLIENT_ORDERS } from "../data/admin-mock.js";

const statusFilters = [
  { label: "전체", value: "all", color: "#555", bg: "#f5f5f5" },
  { label: "접수대기", value: "접수대기", color: "#757575", bg: "#f5f5f5" },
  { label: "주문접수", value: "주문접수", color: "#4169e1", bg: "#eef0ff" },
  { label: "배송완료", value: "배송완료", color: "#2e7d32", bg: "#e8f5e9" },
];
const imageFilterOptions = [
  { label: "이미지 있음", value: "has-image" },
  { label: "이미지 없음", value: "no-image" },
];
const quickDates = ["오늘", "어제", "내일", "이번 달", "지난 달"];
const badgeBg = { "주문접수": "#eef0ff", "접수대기": "#f5f5f5", "배송완료": "#e8f5e9" };
const searchDefs = [
  { key: "profile", label: "프로필 검색", placeholder: "이름·문구를 입력해주세요" },
  { key: "recipient", label: "받는분 검색", placeholder: "받는 분 성함을 입력해주세요" },
  { key: "address", label: "주소지 검색", placeholder: "주소지를 입력해주세요" },
];

export function mount(root, { nav }) {
  const clients = store.get().clients;
  const state = {
    clientId: clients[0] ? clients[0].id : null,
    activeStatus: "all",
    imageFiltersOn: ["has-image", "no-image"],
    activeDateFilter: "이번 달",
    profile: "", recipient: "", address: "",
  };
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  // source rows for the selected client (assign per-client index id for rowKey/detail)
  const sourceOrders = () => (CLIENT_ORDERS[state.clientId] || []).map((o, i) => ({ ...o, id: i }));

  function filtered() {
    const [rangeStart, rangeEnd] = getDateRange(state.activeDateFilter);
    return sourceOrders().filter((o) => {
      if (state.activeStatus !== "all" && o.status !== state.activeStatus) return false;
      if (!state.imageFiltersOn.includes("has-image") && o.hasPhoto) return false;
      if (!state.imageFiltersOn.includes("no-image") && !o.hasPhoto) return false;
      const od = parseOrderDate(o.date);
      if (od < rangeStart || od > rangeEnd) return false;
      if (state.profile && !o.profile.includes(state.profile)) return false;
      if (state.recipient && !o.manager.includes(state.recipient)) return false;
      if (state.address && !o.address.includes(state.address)) return false;
      return true;
    });
  }

  const columns = [
    { label: "담당자", width: "84px", align: "center", render: (r) => r.manager },
    { label: "배송요청일시", width: "148px", render: (r) => r.date },
    { label: "배송요청주소", render: (r) => html`<div class="orders-trunc">${r.address}</div>` },
    { label: "발송 프로필", width: "200px", render: (r) => html`<div class="orders-trunc">${r.profile}</div>` },
    { label: "주문상품", width: "140px", render: (r) => r.product },
    { label: "결제금액", width: "96px", align: "right", render: (r) => r.amount },
    {
      label: "주문현황", width: "94px", align: "center",
      render: (r) => html`<span class="orders-badge" style="color:${r.statusColor};background:${badgeBg[r.status] ?? "#f5f5f5"}">${r.status}</span>`,
    },
    {
      label: "사진", width: "60px", align: "center",
      render: (r) => html`<button class="orders-photo ${r.hasPhoto ? "has" : "no"}" data-action="detail" data-id="${r.id}" title="${r.hasPhoto ? "사진 있음 — 클릭하여 상세 보기" : "사진 없음 — 클릭하여 주문 정보 보기"}" aria-label="주문 상세">${icon("camera", { size: 16 })}</button>`,
    },
  ];

  const tableBody = () => tableGrid({ columns, rows: filtered(), rowKey: (r) => r.id });
  const countBody = () => html`총 <strong>${filtered().length}</strong>건`;

  function render() {
    const [rangeStart, rangeEnd] = getDateRange(state.activeDateFilter);
    setHTML(
      root,
      html`
        <div class="page-orders">
          <div class="orders-inner">
            ${pageTitle({ imgSrc: "./assets/nav-realtime.png", title: "거래처 주문조회" })}

            <div class="admin-controls">
              <span class="admin-controls__label">거래처 선택</span>
              <select class="select" data-ctl="client">
                ${store.get().clients.map((c) => html`<option value="${c.id}" ${state.clientId === c.id ? "selected" : ""}>${c.companyName}</option>`)}
              </select>
            </div>

            <div class="orders-filters">
              <div class="orders-frow orders-frow--1">
                <div class="orders-fgroup">
                  <span class="orders-flabel">주문현황</span>
                  <div class="orders-chips">
                    ${statusFilters.map((sf) => {
                      const active = state.activeStatus === sf.value;
                      const style = active
                        ? sf.value === "all"
                          ? "background:#333;color:#fff;border-color:#333"
                          : `background:${sf.bg};color:${sf.color};border-color:${sf.color}`
                        : "background:#fff;color:#888;border-color:#e0e0e0";
                      return html`<button class="orders-statbtn" style="${style}" data-action="status" data-v="${sf.value}">${sf.label}</button>`;
                    })}
                  </div>
                </div>
                <div class="orders-divider"></div>
                <div class="orders-fgroup">
                  <span class="orders-flabel">사진 필터</span>
                  ${imageFilterOptions.map((f) => {
                    const on = state.imageFiltersOn.includes(f.value);
                    return html`<label class="orders-check">
                      <input type="checkbox" data-action="imgfilter" data-v="${f.value}" ${on ? "checked" : ""} />
                      <span class="${on ? "is-on" : ""}">${f.label}</span>
                    </label>`;
                  })}
                </div>
                <div class="orders-divider"></div>
                <div class="orders-flow">
                  <span class="orders-flowtag" style="background:#f5f5f5;color:#888">접수대기</span><span>→</span>
                  <span class="orders-flowtag" style="background:#eef0ff;color:#4169e1">주문접수</span><span>→</span>
                  <span class="orders-flowtag" style="background:#e8f5e9;color:#2e7d32">배송완료</span>
                </div>
              </div>

              <div class="orders-frow orders-frow--2">
                <span class="orders-flabel">배송요청일</span>
                <div class="orders-daterange">
                  ${icon("calendar-days", { size: 13, cls: "tint-muted" })}
                  <span>${formatDateLabel(rangeStart)}</span>
                  ${icon("chevron-left", { size: 13 })}${icon("chevron-right", { size: 13 })}
                  <span>${formatDateLabel(rangeEnd)}</span>
                </div>
                <div class="orders-chips">
                  ${quickDates.map(
                    (opt) => html`<button class="orders-datebtn ${state.activeDateFilter === opt ? "is-active" : ""}" data-action="date" data-v="${opt}">${opt}</button>`
                  )}
                </div>
              </div>

              <div class="orders-frow orders-frow--3">
                ${searchDefs.map(
                  (s) => html`<div class="orders-search">
                    <div class="orders-search__lbl">${icon("search", { size: 12, cls: "tint-muted" })}<span>${s.label}</span></div>
                    <input type="text" data-search="${s.key}" value="${state[s.key]}" placeholder="${s.placeholder}" />
                  </div>`
                )}
              </div>
            </div>

            <div class="orders-notice">
              <span>🔴</span>
              <p>아래에 기재되어 있지 않은 주문은 누락 가능성이 있으므로, 고객센터로 확인 문의를 꼭 부탁드립니다.</p>
            </div>

            <div class="orders-count" data-slot="count">${countBody()}</div>
            <div class="orders-table" data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }

  function openDetail(order) {
    closeModal();
    const sc = { "주문접수": { bg: "#eef0ff", text: "#4169e1" }, "접수대기": { bg: "#f5f5f5", text: "#757575" }, "배송완료": { bg: "#e8f5e9", text: "#2e7d32" } }[order.status] ?? { bg: "#f5f5f5", text: "#555" };
    const rows = [
      ["담당자", order.manager],
      ["배송요청일시", order.date],
      ["배송주소", order.address],
      ["발송 프로필", order.profile],
      ["주문상품", order.product],
      ["주문금액", order.amount],
    ];
    const body = html`
      <div class="odetail">
        <div class="odetail__head">
          <div class="odetail__head-l">
            ${icon("camera", { size: 18, cls: "tint-orange" })}
            <div><p class="odetail__sub">주문 상세정보</p><h3>${order.product}</h3></div>
          </div>
          <div class="odetail__head-r">
            <span class="odetail__badge" style="background:${sc.bg};color:${sc.text}">${order.status}</span>
            <button class="modal-close" data-action="close" aria-label="닫기">${icon("x", { size: 18 })}</button>
          </div>
        </div>
        ${order.hasPhoto
          ? html`<div class="odetail__photo"><div class="odetail__photo-in">${icon("camera", { size: 40 })}<span>주문 사진</span></div></div>`
          : html`<div class="odetail__nophoto"><div class="odetail__nophoto-in">${icon("camera", { size: 18 })}<span>등록된 사진이 없습니다</span></div></div>`}
        <div class="odetail__rows">
          ${rows.map(
            ([label, value]) => html`<div class="odetail__row">
              <div class="odetail__row-l">${label}</div>
              <div class="odetail__row-v ${label === "주문금액" ? "is-amount" : ""}">${value}</div>
            </div>`
          )}
        </div>
        <div class="odetail__foot"><button class="odetail__close-btn" data-action="close">닫기</button></div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--detail", body, onClose: () => {} });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
  }

  render();

  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "status") { state.activeStatus = t.dataset.v; render(); }
    else if (a === "date") { state.activeDateFilter = t.dataset.v; render(); }
    else if (a === "detail") {
      const o = sourceOrders().find((x) => String(x.id) === t.dataset.id);
      if (o) openDetail(o);
    }
  });
  const offChange = on(root, "change", "[data-action='imgfilter'], [data-ctl='client']", (e, t) => {
    if (t.dataset.ctl === "client") { state.clientId = t.value; render(); return; }
    const v = t.dataset.v;
    state.imageFiltersOn = state.imageFiltersOn.includes(v)
      ? state.imageFiltersOn.filter((x) => x !== v)
      : [...state.imageFiltersOn, v];
    render();
  });
  const offInput = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    const tbl = qs(root, "[data-slot='table']");
    const cnt = qs(root, "[data-slot='count']");
    if (tbl) setHTML(tbl, tableBody());
    if (cnt) setHTML(cnt, countBody());
  });

  return () => { offClick(); offChange(); offInput(); closeModal(); };
}
