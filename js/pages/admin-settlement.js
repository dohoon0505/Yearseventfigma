/* ============================================================
   admin-settlement.js — 거래처 정산회계
   ① 상단 필터: 년/월 + 정산 상태(전체/미완료/정산완료) + 거래처 검색.
   ② 대시보드: KPI(증감 배지)·월간 인사이트(6개월 막대)·거래처 랭킹·항목 도넛·
      정산 진행·월간 분석 리포트(A4 PDF). 분석은 data/report.js, 렌더는 report-doc.js.
   ③ 정산액 요약카드 + 거래처별 정산 종합 테이블 (기존 유지, 읽기전용).
   ============================================================ */
import { html, setHTML, on, qs, raw, won } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { CLIENT_SETTLEMENTS, CLIENT_USAGE, USAGE_CATEGORIES, SETTLEMENT_YEARS, DATA_NOW } from "../data/admin-mock.js";
import { buildMonthlyReport } from "../data/report.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT } from "../data/invoice-links.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { reportDoc } from "../report-doc.js";

const COL = "minmax(180px,1fr) 110px 110px 110px 110px 116px 128px";
const HEADERS = ["거래처", "청구금액", "거래명세서", "계산서 발급", "거래대금", "공개 링크", "명세서 다운로드"];
const STATUS_TABS = [
  { value: "all", label: "전체" },
  { value: "pending", label: "미완료" },
  { value: "done", label: "정산완료" },
];
/* 도넛/범례 9색 — 항목별(상품 9종) 비중이 겹치지 않도록 인접 대비 순으로 배치 */
const DONUT_VARS = ["var(--c-orange)", "var(--c-blue)", "var(--c-success)", "var(--ch-purple)", "var(--c-warn)", "var(--ch-cyan)", "var(--ch-pink)", "var(--ch-lime)", "var(--ch-slate)"];
const pad = (n) => String(n).padStart(2, "0");
const wonToNum = (s) => Number(String(s).replace(/[^0-9]/g, "")) || 0;
const man = (n) => Math.round(n / 10000); // 만원 단위

/* KPI 전월 대비 증감 배지 (▲ 증가=레드워시 · ▼ 감소=블루워시 · 중립=그레이) */
function deltaBadge(delta, suffix = "원") {
  if (delta == null) return html`<span class="kpi__delta flat">전월 데이터 없음</span>`;
  if (delta === 0) return html`<span class="kpi__delta flat">지난달과 동일</span>`;
  const up = delta > 0;
  return html`<span class="kpi__delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(delta).toLocaleString("ko-KR")}${suffix}</span>`;
}

const ok = (t) => html`<span class="settle-badge settle-badge--ok">${t}</span>`;
const warn = (t) => html`<span class="settle-badge settle-badge--warn">${t}</span>`;
const danger = (t) => html`<span class="settle-badge settle-badge--danger">${t}</span>`;
const agreeBadge = (v) => (v === "동의완료" ? ok("동의완료") : warn("동의대기"));
const issueBadge = (v) => (v === "발급완료" ? ok("발급완료") : warn("동의필요"));
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
  const now = DATA_NOW; // 목데이터 생성 기준과 동일 시각 → 월 전환 후에도 데이터 창 이탈 없음
  const state = { year: now.getFullYear(), month: now.getMonth() + 1, statusFilter: "all", search: "" };
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastY = lastDate.getFullYear(), lastM = lastDate.getMonth() + 1;

  /* 선택 월 분석 데이터 (대시보드·리포트 공용) — 상태탭/검색과 무관 */
  function reportFor() {
    return buildMonthlyReport({
      year: state.year, month: state.month,
      clients: store.get().clients,
      usage: CLIENT_USAGE, settlements: CLIENT_SETTLEMENTS, categories: USAGE_CATEGORIES,
    });
  }
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

  /* ── ① KPI 카드 (증감 배지) ── */
  function kpiCards(r) {
    return html`
      <div class="kpis">
        <div class="kpi"><span class="kpi__lbl">총 이용금액</span><div class="kpi__val num">${won(r.total)}</div>${deltaBadge(r.deltaTotal)}</div>
        <div class="kpi"><span class="kpi__lbl">주문 건수</span><div class="kpi__val num">${r.orders}건</div>${deltaBadge(r.deltaOrders, "건")}</div>
        <div class="kpi"><span class="kpi__lbl">이용 거래처</span><div class="kpi__val num">${r.activeClients}곳</div><span class="kpi__delta flat">전체 ${r.clientCount}곳 중</span></div>
        <div class="kpi"><span class="kpi__lbl">미입금액</span><div class="kpi__val num ${r.settle.unpaidAmount > 0 ? "warn" : ""}">${won(r.settle.unpaidAmount)}</div><span class="kpi__delta flat">정산 완료율 ${r.settle.paidRate}%</span></div>
      </div>
    `;
  }

  /* ── ② 월간 인사이트 (헤드라인 + 6개월 막대) ── */
  function insightCard(r) {
    let headline;
    if (r.deltaTotal == null) headline = html`<b>${state.month}월</b> 총 이용금액은 <b class="num">${won(r.total)}</b>이에요`;
    else if (r.deltaTotal === 0) headline = html`총 이용금액이 지난달과 <b class="num">같아요</b> (${won(r.total)})`;
    else if (r.deltaTotal > 0) headline = html`총 이용금액이 지난달보다<br /><span class="up num">${won(r.deltaTotal)}</span> 늘었어요`;
    else headline = html`총 이용금액이 지난달보다<br /><span class="down num">${won(Math.abs(r.deltaTotal))}</span> 줄었어요`;
    const max = Math.max(...r.trend.map((t) => t.total), 1);
    return html`
      <div class="acard">
        <div class="acard__head"><b>월간 인사이트</b><span class="acard__hint">최근 6개월 · 만원</span></div>
        <div class="acard__body">
          <p class="headline">${headline}</p>
          <div class="bars" role="img" aria-label="최근 6개월 이용금액 추이">
            ${r.trend.map((t) => {
              const h = Math.max(10, Math.round((t.total / max) * 188));
              return html`<div class="bar ${t.isCurrent ? "cur" : ""}"><span class="bar__v num">${t.total === 0 ? "—" : man(t.total)}</span><span class="bar__c" style="height:${h}px"></span><span class="bar__l">${t.short}</span></div>`;
            })}
          </div>
        </div>
      </div>
    `;
  }

  /* ── ③ 거래처별 이용 랭킹 (가로 막대 · 오렌지) ──
     막대 길이 = 전체 대비 이용 비중(share%) — 우측에 표기된 % 와 시각적으로 일치. */
  function clientRankCard(r) {
    const RANK_LIMIT = 10; // 이용금액 상위 10위까지만 표시
    const top = r.affiliates.slice(0, RANK_LIMIT);
    const hint = r.affiliates.length > RANK_LIMIT
      ? `상위 ${RANK_LIMIT}곳 · 전체 ${r.affiliates.length}곳`
      : (r.affiliates[0] ? `최다 이용 거래처: ${r.affiliates[0].name}` : "");
    return html`
      <div class="acard">
        <div class="acard__head"><b>거래처별 이용 현황</b>${hint ? html`<span class="acard__hint">${hint}</span>` : ""}</div>
        <div class="acard__body" style="padding-top:12px;">
          ${top.map(
            (a, i) => html`
              <div class="rank">
                <span class="rank__no ${i < 3 ? "top" : ""}">${i + 1}</span>
                <span class="rank__name">${a.name}</span>
                <span class="rank__track"><span class="rank__bar" style="width:${Math.max(4, a.share)}%"></span></span>
                <span class="rank__amt num">${won(a.total)}</span>
                <span class="rank__share num">${a.share}%</span>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  /* ── ④ 항목별 이용 비중 (도넛 + 범례) ── */
  function donutSvg(r) {
    const R = 44, CX = 62, CY = 62, SW = 24, CIRC = 2 * Math.PI * R;
    let acc = 0;
    const segs = r.catStats
      .map((c, i) => {
        const len = r.total > 0 ? (c.amount / r.total) * CIRC : 0;
        const s = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:${DONUT_VARS[i % DONUT_VARS.length]}" stroke-width="${SW}" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${CX} ${CY})"/>`;
        acc += len;
        return s;
      })
      .join("");
    return raw(
      `<svg width="124" height="124" viewBox="0 0 124 124" xmlns="http://www.w3.org/2000/svg" class="donut__svg" aria-hidden="true">` +
        `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:var(--c-divider)" stroke-width="${SW}"/>` + segs +
        `<text x="${CX}" y="${CY - 4}" text-anchor="middle" class="donut__t1">총 이용</text>` +
        `<text x="${CX}" y="${CY + 13}" text-anchor="middle" class="donut__t2">${man(r.total)}만</text>` +
        `</svg>`
    );
  }
  function categoryCard(r) {
    return html`
      <div class="acard">
        <div class="acard__head"><b>항목별 이용 비중</b></div>
        <div class="acard__body donut">
          ${donutSvg(r)}
          <div class="dleg">
            ${r.catStats.map(
              (c, i) => html`
                <div class="dleg__row">
                  <span class="dleg__l"><span class="dleg__dot" style="background:${DONUT_VARS[i % DONUT_VARS.length]}"></span><span class="dleg__name">${c.key}</span></span>
                  <span class="dleg__val num">${c.share}% · ${man(c.amount)}만</span>
                </div>
              `
            )}
          </div>
        </div>
      </div>
    `;
  }

  /* ── ⑤ 정산 진행 현황 ── */
  function progressCard(r) {
    const s = r.settle;
    const step = (lbl, done, cnt) => html`<div class="step ${cnt > 0 && done === cnt ? "done" : ""}"><b>${lbl}</b><span class="num">${done}/${cnt}</span></div>`;
    return html`
      <div class="acard">
        <div class="acard__head"><b>정산 진행 현황</b><span class="acard__hint">입금 기준 ${s.paidRate}%</span></div>
        <div class="acard__body">
          <div class="prog__track"><div class="prog__fill" style="width:${s.paidRate}%"></div></div>
          <div class="steps">
            ${step("명세서 동의", s.agreed, s.count)}
            ${step("계산서 발급", s.issued, s.count)}
            ${step("입금 완료", s.paid, s.count)}
          </div>
          <div class="prog__amts"><span>입금완료 <b class="num">${won(s.paidAmount)}</b></span><span class="warn">미입금 <b class="num">${won(s.unpaidAmount)}</b></span></div>
        </div>
      </div>
    `;
  }

  /* ── ⑥ 월간 분석 리포트 카드 (라이트 · 문서 목차) ── */
  function reportCard(r) {
    return html`
      <div class="report">
        <div class="report__head"><b>월간 분석 리포트</b><span class="report__hint">A4 · PDF</span></div>
        <div class="report__body">
          <p class="report__desc">${r.label} 이용·정산 데이터를 분석한 리포트를 생성합니다.</p>
          <div class="report__list">
            <div class="report__row"><b>거래처별 이용 순위</b><span>전월 대비 증감 포함</span></div>
            <div class="report__row"><b>항목별 구성 변화</b><span>비중 · 건수</span></div>
            <div class="report__row"><b>정산 현황 · 코멘트</b><span>자동 분석 ${r.insights.length}건</span></div>
          </div>
          <p class="report__quote">"${r.insights[0] || ""}"</p>
        </div>
        <button class="report__btn" data-action="report">PDF 리포트 다운로드</button>
      </div>
    `;
  }

  function dashBody() {
    const r = reportFor();
    if (!r) return html`<div class="admin-empty">선택한 조건(${state.year}년 ${pad(state.month)}월)에 이용 데이터가 없습니다.</div>`;
    return html`
      <div class="adash">
        ${kpiCards(r)}
        <div class="row-main">${insightCard(r)}${clientRankCard(r)}</div>
        <div class="row-sub">${categoryCard(r)}${progressCard(r)}${reportCard(r)}</div>
      </div>
    `;
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
              <div class="settle-td">${agreeBadge(rec.거래명세서동의)}</div>
              <div class="settle-td">${issueBadge(rec.계산서발급)}</div>
              <div class="settle-td">${payBadge(rec.입금완료)}</div>
              <div class="settle-td"><button class="settle-linkbtn" data-action="copylink" data-id="${client.id}">${icon("external-link", { size: 11 })}<span>링크 복사</span></button></div>
              <div class="settle-td"><button class="settle-dlbtn" data-action="download" data-id="${client.id}">${icon("download", { size: 11 })}<span>PDF 다운로드</span></button></div>
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

  // 조회 기간(선택한 년/월) 전체 거래처의 정산액 종합 — 상태탭/검색과 무관.
  function periodStats() {
    let total = 0, paid = 0, unpaid = 0;
    rowsForPeriod().forEach(({ rec }) => {
      const amt = wonToNum(rec.정산금액);
      total += amt;
      if (rec.입금완료 === "입금완료") paid += amt;
      else unpaid += amt;
    });
    return { total, paid, unpaid };
  }
  function summaryCards() {
    const s = periodStats();
    return html`
      <div class="settle-sum">
        <div class="settle-sumcard">
          <span class="settle-sumcard__lbl">총 정산액</span>
          <span class="settle-sumcard__val">${won(s.total)}</span>
        </div>
        <div class="settle-sumcard settle-sumcard--ok">
          <span class="settle-sumcard__lbl">입금완료 정산액</span>
          <span class="settle-sumcard__val">${won(s.paid)}</span>
        </div>
        <div class="settle-sumcard settle-sumcard--warn">
          <span class="settle-sumcard__lbl">미입금 정산액</span>
          <span class="settle-sumcard__val">${won(s.unpaid)}</span>
        </div>
      </div>
    `;
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "거래처 정산회계" })}
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs">
                  ${STATUS_TABS.map((t) => html`<button class="bf-tab ${state.statusFilter === t.value ? "is-active" : ""}" data-action="stab" data-v="${t.value}">${t.label}</button>`)}
                </div>
              </div>
              <div class="bf-row bf-row--main">
                <span class="bf-lbl">조회 기간</span>
                <select class="select" data-ctl="year">
                  ${SETTLEMENT_YEARS.map((y) => html`<option value="${y}" ${state.year === y ? "selected" : ""}>${y}년</option>`)}
                </select>
                <select class="select" data-ctl="month">
                  ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${state.month === m ? "selected" : ""}>${pad(m)}월</option>`)}
                </select>
                <div class="bf-seg">
                  <button class="bf-seg__btn ${state.year === curY && state.month === curM ? "is-sel" : ""}" data-action="qmonth" data-v="this">이번달</button>
                  <button class="bf-seg__btn ${state.year === lastY && state.month === lastM ? "is-sel" : ""}" data-action="qmonth" data-v="last">저번달</button>
                </div>
                <div class="bf-right">
                  <div class="bf-srch bf-srch--addr">
                    ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                    <span class="bf-srch__lbl">거래처</span>
                    <span class="bf-srch__dv"></span>
                    <input type="text" data-search value="${state.search}" placeholder="거래처명 검색" />
                  </div>
                </div>
              </div>
            </div>
            <div data-slot="dash">${dashBody()}</div>
            <div data-slot="sumcards">${summaryCards()}</div>
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
    const cards = qs(root, "[data-slot='sumcards']");
    if (tbl) setHTML(tbl, tableBody());
    if (sum) setHTML(sum, summaryBody());
    if (cards) setHTML(cards, summaryCards());
  };

  render();

  const offChange = on(root, "change", "[data-ctl]", (e, t) => {
    state[t.dataset.ctl] = Number(t.value);
    render(); // re-render so 이번달/저번달 active state stays in sync
  });
  const offClick = on(root, "click", "[data-action='stab']", (e, t) => {
    state.statusFilter = t.dataset.v;
    render(); // re-render to update active chip
  });
  const offQuick = on(root, "click", "[data-action='qmonth']", (e, t) => {
    const base = new Date(now.getFullYear(), now.getMonth() - (t.dataset.v === "last" ? 1 : 0), 1);
    state.year = base.getFullYear();
    state.month = base.getMonth() + 1;
    render();
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
  // 명세서 PDF 즉시 다운로드: doc을 off-DOM으로 렌더 → printInvoiceDoc(새 창 인쇄 → PDF 저장)
  const offDownload = on(root, "click", "[data-action='download']", (e, t) => {
    const row = rowsForPeriod().find(({ client }) => client.id === t.dataset.id);
    if (!row) return;
    const holder = document.createElement("div");
    setHTML(holder, invoiceDoc(buildDoc(row.client, row.rec)));
    const docEl = holder.querySelector(".invoice-doc");
    if (!docEl) return;
    try { printInvoiceDoc(docEl, `${row.client.companyName}_${row.rec.청구년월}_거래명세서`); }
    catch (err) { console.error("PDF 생성 오류:", err); alert("PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요."); }
  });
  // 월간 분석 리포트: 분석 실행 → A4 리포트 렌더 → printInvoiceDoc
  const offReport = on(root, "click", "[data-action='report']", () => {
    const r = reportFor();
    if (!r) return;
    const dt = new Date();
    const generatedAt = `${dt.getFullYear()}. ${pad(dt.getMonth() + 1)}. ${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const holder = document.createElement("div");
    setHTML(holder, reportDoc(r, generatedAt));
    const docEl = holder.querySelector(".report-doc");
    if (!docEl) return;
    try { printInvoiceDoc(docEl, `거래처_이용분석_리포트_${state.year}_${pad(state.month)}`); }
    catch (err) { console.error("리포트 생성 오류:", err); alert("리포트 생성 중 오류가 발생했습니다. 다시 시도해 주세요."); }
  });

  return () => { offChange(); offClick(); offQuick(); offSearch(); offCopy(); offDownload(); offReport(); };
}
