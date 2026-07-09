/* ============================================================
   report-doc.js — 월간 분석 리포트 A4 문서 렌더러 (관리자 · 거래처 분리정산).
   reportDoc(r) — r 은 data/report.js buildMonthlyReport() 결과.
   invoice-doc.js 와 동일하게 INLINE 스타일만 사용 → printInvoiceDoc()(새 창
   인쇄 → PDF 저장)로 그대로 출력 가능. 차트는 인라인 SVG(외부 의존 없음).
   ============================================================ */
import { html, raw, escapeHtml } from "./dom.js";

const C = {
  ink: "#222", sub: "#444", muted: "#666", faint: "#999",
  border: "#d4d4d4", divider: "#e8e8e8", head: "#f5f5f5", zebra: "#fafbfc",
  orange: "#f15a2a", orangeInk: "#d94000", blue: "#4169e1",
  up: "#c62828", down: "#1e56c9", rest: "#ececf1",
};
// 도넛 9색 — tokens.css 도넛 팔레트와 동일 순서(상품 9종 중복 방지). A4 문서라 인라인 hex.
const DONUT_COLORS = ["#f15a2a", "#4169e1", "#4caf50", "#8b5cf6", "#ff9800", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];

const S = {
  section: `margin:0 0 10px;font-size:13px;font-weight:700;color:${C.ink};padding-bottom:4px;border-bottom:2px solid #333;`,
  table: `width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid ${C.border};font-size:11.5px;font-family:Pretendard,sans-serif;`,
  th: `background:${C.head};padding:9px 12px;font-weight:600;color:${C.sub};border:1px solid ${C.border};text-align:center;line-height:1.4;white-space:nowrap;`,
  td: `padding:9px 12px;color:#333;border:1px solid ${C.border};line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
};

const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
const man = (n) => Math.round(n / 10000); // 만원 단위

/* 전월 대비 증감 텍스트 (한국 금융 관례: 증가=적, 감소=청) */
function deltaSpan(delta, suffix = "원") {
  if (delta == null) return `<span style="color:${C.faint}">—</span>`;
  if (delta === 0) return `<span style="color:${C.muted}">±0${suffix}</span>`;
  const up = delta > 0;
  return `<span style="color:${up ? C.up : C.down};font-weight:600">${up ? "▲" : "▼"} ${Math.abs(delta).toLocaleString("ko-KR")}${suffix}</span>`;
}

/* ── 항목 비중 도넛 (인라인 SVG) ── */
function donutSvg(catStats, total) {
  const R = 44, CX = 62, CY = 62, SW = 26;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const segs = catStats
    .map((c, i) => {
      const frac = total > 0 ? c.amount / total : 0;
      const len = frac * CIRC;
      const seg = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="${SW}" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${CX} ${CY})"/>`;
      acc += len;
      return seg;
    })
    .join("");
  return `<svg width="124" height="124" viewBox="0 0 124 124" xmlns="http://www.w3.org/2000/svg" style="display:block">` +
    `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${C.divider}" stroke-width="${SW}"/>` + segs +
    `<text x="${CX}" y="${CY - 2}" text-anchor="middle" font-size="10" fill="${C.muted}" font-family="Pretendard,sans-serif">총 이용</text>` +
    `<text x="${CX}" y="${CY + 13}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.ink}" font-family="Pretendard,sans-serif">${man(total)}만</text>` +
    `</svg>`;
}

/* ── KPI 요약 박스 4개 ── */
function kpiBoxes(r) {
  const box = (lbl, val, sub) => `
    <div style="flex:1;border:1px solid ${C.border};border-radius:10px;padding:14px 16px;background:${C.zebra}">
      <p style="margin:0 0 7px;font-size:11.5px;color:${C.muted}">${lbl}</p>
      <p style="margin:0;font-size:19px;font-weight:700;color:${C.ink};letter-spacing:-0.02em">${val}</p>
      <p style="margin:6px 0 0;font-size:11px;line-height:1.4">${sub}</p>
    </div>`;
  const vs = (delta, suffix) =>
    delta == null ? `<span style="color:${C.faint}">전월 데이터 없음</span>` : `지난달보다 ${deltaSpan(delta, suffix)}`;
  return `
    <div style="display:flex;gap:12px;margin-bottom:28px">
      ${box("총 이용금액", won(r.total), vs(r.deltaTotal, "원"))}
      ${box("주문 건수", `${r.orders}건`, vs(r.deltaOrders, "건"))}
      ${box("이용 거래처", `${r.activeClients}곳`, `<span style="color:${C.muted}">전체 ${r.clientCount}곳 중</span>`)}
      ${box("정산 완료율", `${r.settle.paidRate}%`, `<span style="color:${C.muted}">미입금 ${won(r.settle.unpaidAmount)}</span>`)}
    </div>`;
}

export function reportDoc(r, generatedAt) {
  const affRows = r.affiliates
    .map(
      (a, i) => `
      <tr style="background:${i % 2 === 1 ? C.zebra : "#fff"}">
        <td style="${S.td}text-align:center;color:${C.muted}">${i + 1}</td>
        <td style="${S.td}font-weight:600">${escapeHtml(a.name)}</td>
        <td style="${S.td}text-align:center">${a.orders}건</td>
        <td style="${S.td}text-align:right">${won(a.total)}</td>
        <td style="${S.td}text-align:center">${a.share}%</td>
        <td style="${S.td}text-align:right">${deltaSpan(a.delta)}</td>
      </tr>`
    )
    .join("");

  const catRows = r.catStats
    .map(
      (c, i) => `
      <tr style="background:${i % 2 === 1 ? C.zebra : "#fff"}">
        <td style="${S.td}"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${DONUT_COLORS[i % DONUT_COLORS.length]};margin-right:6px;vertical-align:1px"></span>${c.key}</td>
        <td style="${S.td}text-align:center">${c.count}건</td>
        <td style="${S.td}text-align:right">${won(c.amount)}</td>
        <td style="${S.td}text-align:center">${c.share}%</td>
        <td style="${S.td}text-align:center">${c.shiftPp == null ? "—" : `${c.shiftPp > 0 ? "+" : ""}${c.shiftPp}%p`}</td>
      </tr>`
    )
    .join("");

  const insightItems = r.insights
    .map(
      (t, i) => `
      <li style="margin:0 0 12px;line-height:1.8;display:flex;gap:9px;align-items:flex-start">
        <span style="flex:0 0 19px;height:19px;border-radius:50%;background:#fff1ec;color:${C.orangeInk};font-size:11px;font-weight:700;text-align:center;line-height:19px">${i + 1}</span><span>${escapeHtml(t)}</span>
      </li>`
    )
    .join("");

  return html`
    <div class="report-doc" style="width:794px;min-height:1123px;background:#fff;font-family:Pretendard,sans-serif;font-size:12px;color:#333;padding:42px 52px 30px;box-sizing:border-box;display:flex;flex-direction:column;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;padding-bottom:14px;border-bottom:1px solid ${C.divider}">
        <div>
          <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:${C.orange};white-space:nowrap">올해의경조사 · ADMIN</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:${C.ink}">${r.label} 거래처 이용 분석 리포트</p>
        </div>
        <div style="text-align:right">
          <p style="margin:0;font-size:12px;font-weight:600;color:${C.muted}">${r.label} 귀속</p>
          <p style="margin:4px 0 0;font-size:11px;color:${C.faint}">생성 ${generatedAt}</p>
        </div>
      </div>

      ${raw(kpiBoxes(r))}

      <!-- 거래처별 -->
      <div style="margin-bottom:28px">
        <p style="${S.section}">거래처별 이용 현황</p>
        <table style="${S.table}">
          <colgroup><col style="width:44px" /><col /><col style="width:78px" /><col style="width:124px" /><col style="width:66px" /><col style="width:124px" /></colgroup>
          <thead><tr>
            <th style="${S.th}">순위</th><th style="${S.th}">거래처</th><th style="${S.th}">주문</th>
            <th style="${S.th}">이용금액</th><th style="${S.th}">비중</th><th style="${S.th}">전월 대비</th>
          </tr></thead>
          <tbody>${raw(affRows)}</tbody>
        </table>
      </div>

      <!-- 항목별 (표 + 도넛) -->
      <div style="margin-bottom:28px">
        <p style="${S.section}">항목별 이용 현황</p>
        <div style="display:flex;gap:24px;align-items:center">
          <table style="${S.table}flex:1;">
            <colgroup><col /><col style="width:66px" /><col style="width:124px" /><col style="width:62px" /><col style="width:82px" /></colgroup>
            <thead><tr>
              <th style="${S.th}">항목</th><th style="${S.th}">주문</th><th style="${S.th}">이용금액</th>
              <th style="${S.th}">비중</th><th style="${S.th}">비중 증감</th>
            </tr></thead>
            <tbody>${raw(catRows)}</tbody>
          </table>
          <div style="flex:0 0 140px">${raw(donutSvg(r.catStats, r.total))}</div>
        </div>
      </div>

      <!-- 분석 코멘트 -->
      <div style="margin-bottom:20px">
        <p style="${S.section}">분석 코멘트</p>
        <ul style="margin:0;padding:4px 0 0;list-style:none;font-size:12.5px;color:#333">${raw(insightItems)}</ul>
      </div>

      <!-- 푸터 -->
      <p style="margin-top:auto;padding-top:14px;border-top:1px solid ${C.divider};font-size:10.5px;color:${C.faint};display:flex;justify-content:space-between">
        <span>본 리포트는 통합정산시스템 데이터로부터 자동 생성된 분석 자료입니다.</span>
        <span>올해의경조사 · 관리자 콘솔</span>
      </p>
    </div>
  `;
}
