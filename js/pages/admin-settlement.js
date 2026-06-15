/* ============================================================
   admin-settlement.js — 거래처 정산회계
   년/월 선택 → 거래처별 정산 종합(거래명세서 동의 / 계산서 발급 / 입금) 조회.
   settlement.js의 settle-table·배지 재사용 (읽기전용).
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { CLIENT_SETTLEMENTS, SETTLEMENT_YEARS } from "../data/admin-mock.js";

const COL = "1fr 130px 120px 150px 140px 140px";
const HEADERS = ["거래처", "청구금액", "입금자", "거래명세서 동의", "계산서 발급", "거래대금 입금"];
const pad = (n) => String(n).padStart(2, "0");

const ok = (t) => html`<span class="settle-badge settle-badge--ok">${t}</span>`;
const warn = (t) => html`<span class="settle-badge settle-badge--warn">${t}</span>`;
const danger = (t) => html`<span class="settle-badge settle-badge--danger">${t}</span>`;

const agreeBadge = (v) => (v === "동의완료" ? ok("동의완료") : warn("동의대기"));
const issueBadge = (v) => (v === "발급완료" ? ok("발급완료") : warn("동의하기"));
const payBadge = (v) => (v === "입금완료" ? ok("입금완료") : danger("미입금"));
const isDone = (r) => r.거래명세서동의 === "동의완료" && r.계산서발급 === "발급완료" && r.입금완료 === "입금완료";

export function mount(root, { nav }) {
  const now = new Date();
  const state = { year: now.getFullYear(), month: now.getMonth() + 1 };

  // rows: one per client that has a settlement record for the selected 청구년월
  function rowsForPeriod() {
    const label = `${state.year}년 ${pad(state.month)}월`;
    return store.get().clients
      .map((c) => {
        const rec = (CLIENT_SETTLEMENTS[c.id] || []).find((r) => r.청구년월 === label);
        return rec ? { client: c, rec } : null;
      })
      .filter(Boolean);
  }

  function tableBody() {
    const rows = rowsForPeriod();
    if (rows.length === 0) {
      return html`<div class="admin-empty">선택한 기간(${state.year}년 ${pad(state.month)}월)에 정산 내역이 없습니다.</div>`;
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
            </div>
          `
        )}
      </div>
    `;
  }

  function summaryBody() {
    const rows = rowsForPeriod();
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
            <div class="admin-controls">
              <span class="admin-controls__label">조회 기간</span>
              <select class="select" data-ctl="year">
                ${SETTLEMENT_YEARS.map((y) => html`<option value="${y}" ${state.year === y ? "selected" : ""}>${y}년</option>`)}
              </select>
              <select class="select" data-ctl="month">
                ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${state.month === m ? "selected" : ""}>${pad(m)}월</option>`)}
              </select>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }

  render();

  const off = on(root, "change", "[data-ctl]", (e, t) => {
    state[t.dataset.ctl] = Number(t.value);
    const tbl = qs(root, "[data-slot='table']");
    const sum = qs(root, "[data-slot='summary']");
    if (tbl) setHTML(tbl, tableBody());
    if (sum) setHTML(sum, summaryBody());
  });

  return () => { off(); };
}
