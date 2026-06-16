/* ============================================================
   admin-settlement.js — 거래처 정산회계
   상단 필터: 년/월 + 정산 상태(전체/미완료/정산완료) + 거래처 검색.
   거래처별 정산 종합(거래명세서 동의 / 계산서 발급 / 입금) 조회 (읽기전용).
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { CLIENT_SETTLEMENTS, SETTLEMENT_YEARS } from "../data/admin-mock.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT } from "../data/invoice-links.js";

const COL = "1fr 124px 104px 138px 128px 128px 126px";
const HEADERS = ["거래처", "청구금액", "입금자", "거래명세서 동의", "계산서 발급", "거래대금 입금", "공개 링크"];
const STATUS_TABS = [
  { value: "all", label: "전체" },
  { value: "pending", label: "미완료" },
  { value: "done", label: "정산완료" },
];
const pad = (n) => String(n).padStart(2, "0");

const ok = (t) => html`<span class="settle-badge settle-badge--ok">${t}</span>`;
const warn = (t) => html`<span class="settle-badge settle-badge--warn">${t}</span>`;
const danger = (t) => html`<span class="settle-badge settle-badge--danger">${t}</span>`;
const agreeBadge = (v) => (v === "동의완료" ? ok("동의완료") : warn("동의대기"));
const issueBadge = (v) => (v === "발급완료" ? ok("발급완료") : warn("동의하기"));
const payBadge = (v) => (v === "입금완료" ? ok("입금완료") : danger("미입금"));
const isDone = (r) => r.거래명세서동의 === "동의완료" && r.계산서발급 === "발급완료" && r.입금완료 === "입금완료";

// 정산 레코드 → 공개 명세서 doc (요약 1줄). 같은 사업자번호·귀속월이면 issueLink가 시드 토큰 재사용.
const buildDoc = (client, rec) => ({
  title: `${rec.청구년월} 꽃배달 거래명세서`,
  period: `${rec.청구년월} 귀속`,
  buyer: { address: `${client.address} ${client.companyName}`, company: client.companyName, bizNumber: client.bizNumber, ceo: client.ceoName, summary: "꽃배달 이용료 청구", issueDate: rec.발행일, invoiceNote: rec.계산서발급 },
  supplier: SUPPLIER,
  items: [{ date: rec.청구년월, sender: "-", address: "-", product: `${rec.청구년월} 꽃배달 이용료 합계`, amount: rec.정산금액 }],
  account: ACCOUNT,
  total: rec.정산금액,
});

export function mount(root, { nav }) {
  const now = new Date();
  const state = { year: now.getFullYear(), month: now.getMonth() + 1, statusFilter: "all", search: "" };

  function rowsForPeriod() {
    const label = `${state.year}년 ${pad(state.month)}월`;
    return store.get().clients
      .map((c) => {
        const rec = (CLIENT_SETTLEMENTS[c.id] || []).find((r) => r.청구년월 === label);
        return rec ? { client: c, rec } : null;
      })
      .filter(Boolean);
  }
  function visibleRows() {
    let rows = rowsForPeriod();
    if (state.statusFilter === "done") rows = rows.filter(({ rec }) => isDone(rec));
    else if (state.statusFilter === "pending") rows = rows.filter(({ rec }) => !isDone(rec));
    const q = state.search.trim();
    if (q) rows = rows.filter(({ client }) => client.companyName.includes(q));
    return rows;
  }

  function tableBody() {
    const rows = visibleRows();
    if (rows.length === 0) {
      return html`<div class="admin-empty">선택한 조건(${state.year}년 ${pad(state.month)}월)에 정산 내역이 없습니다.</div>`;
    }
    return html`
      <div class="settle-table">
        <div class="settle-thead" style="grid-template-columns:${COL}">
          ${HEADERS.map((h) => html`<div class="settle-th">${h}</div>`)}
        </div>
        ${rows.map(
          ({ client, rec }) => html`
            <div class="settle-trow" style="grid-template-columns:${COL}">
              <div class="settle-td"><span class="ellipsis">${client.companyName}</span></div>
              <div class="settle-td"><span class="settle-amount">${rec.정산금액}</span></div>
              <div class="settle-td settle-td--muted">${rec.입금자}</div>
              <div class="settle-td">${agreeBadge(rec.거래명세서동의)}</div>
              <div class="settle-td">${issueBadge(rec.계산서발급)}</div>
              <div class="settle-td">${payBadge(rec.입금완료)}</div>
              <div class="settle-td"><button class="settle-linkbtn" data-action="copylink" data-id="${client.id}">${icon("external-link", { size: 11 })}<span>링크 복사</span></button></div>
            </div>
          `
        )}
      </div>
    `;
  }
  function summaryBody() {
    const rows = visibleRows();
    const done = rows.filter(({ rec }) => isDone(rec)).length;
    return html`총 <strong>${rows.length}</strong>개 거래처 · 정산완료 <strong>${done}</strong>건`;
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "거래처 정산회계" })}
            <div class="orders-filters">
              <div class="orders-frow orders-frow--1">
                <div class="orders-fgroup">
                  <span class="orders-flabel">조회 기간</span>
                  <select class="select" data-ctl="year">
                    ${SETTLEMENT_YEARS.map((y) => html`<option value="${y}" ${state.year === y ? "selected" : ""}>${y}년</option>`)}
                  </select>
                  <select class="select" data-ctl="month">
                    ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${state.month === m ? "selected" : ""}>${pad(m)}월</option>`)}
                  </select>
                </div>
                <div class="orders-divider"></div>
                <div class="orders-fgroup">
                  <span class="orders-flabel">정산 상태</span>
                  <div class="orders-chips">
                    ${STATUS_TABS.map((t) => html`<button class="chip ${state.statusFilter === t.value ? "is-active" : ""}" data-action="stab" data-v="${t.value}">${t.label}</button>`)}
                  </div>
                </div>
              </div>
              <div class="orders-frow orders-frow--3">
                <div class="orders-search">
                  <div class="orders-search__lbl">${icon("search", { size: 12, cls: "tint-muted" })}<span>거래처 검색</span></div>
                  <input type="text" data-search value="${state.search}" placeholder="거래처명 검색" />
                </div>
              </div>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }
  const refreshTable = () => {
    const tbl = qs(root, "[data-slot='table']");
    const sum = qs(root, "[data-slot='summary']");
    if (tbl) setHTML(tbl, tableBody());
    if (sum) setHTML(sum, summaryBody());
  };

  render();

  const offChange = on(root, "change", "[data-ctl]", (e, t) => {
    state[t.dataset.ctl] = Number(t.value);
    refreshTable();
  });
  const offClick = on(root, "click", "[data-action='stab']", (e, t) => {
    state.statusFilter = t.dataset.v;
    render(); // re-render to update active chip
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    refreshTable();
  });
  const offCopy = on(root, "click", "[data-action='copylink']", (e, t) => {
    const row = rowsForPeriod().find(({ client }) => client.id === t.dataset.id);
    if (!row) return;
    const token = issueLink({ bizNumber: row.client.bizNumber, doc: buildDoc(row.client, row.rec) });
    const url = publicInvoiceUrl(token);
    const span = t.querySelector("span");
    const flash = () => { if (span) { span.textContent = "복사됨!"; setTimeout(() => { if (span) span.textContent = "링크 복사"; }, 1600); } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(flash).catch(() => window.prompt("공개 링크", url));
    else window.prompt("공개 링크", url);
  });

  return () => { offChange(); offClick(); offSearch(); offCopy(); };
}
