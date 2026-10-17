/* ============================================================
   invoice-doc.js — shared A4 거래명세서 renderer + print(PDF) routine.
   Used by the in-app view (pages/invoice.js) AND the public link page
   (/invoice/). The doc uses INLINE styles so window.print() (which copies
   outerHTML into a bare window) renders identically.

   거래내역이 한 페이지(A4)를 넘으면 여러 장의 .invoice-page 로 자동 분할한다.
   - 1페이지: 헤더 + 공급받는자·공급자 정보 + 거래내역(첫 묶음)
   - 2페이지~: 헤더 + 거래내역(계속)
   - 마지막 페이지: 입금계좌·정산금액 푸터 + 페이지 표기
   행 높이가 일정(주소는 한 줄 말줄임)하므로 페이지당 고정 행수로 안전하게 나눈다.

   invoiceDoc(d, assetBase) — d is the invoice data object:
     { title, period, buyer:{address,company,bizNumber,ceo,summary,issueDate,invoiceNote},
       supplier:{company,bizNumber,ceo,email,fax}, items:[{date,sender,address,product,amount,kind?}],
       account, total, stamp? }
   assetBase: prefix for the logo image ("./assets/" in-app, "../assets/" under /invoice/).

   ── 2026-10-16 S-02 시안 — 문서 서식의 예외 세 가지만(요청서 v5 S-2 카드가 연 범위) ──
   ① '계산서 발행' 칸 낱말 — 데이터(buyer.invoiceNote · INVOICE_NOTE 한 벌)가 정한다. 이 파일은 그대로 찍는다.
   ② 동의 전 표기 — `d.stamp = { text, printedAt }` 이 있으면 머리 오른쪽(귀속 표기 아래)에 태그
      '{text} · {printedAt} 출력', 모든 장 왼쪽 아래에 '{printedAt} 출력 · {text}'.
   ③ 취소 수수료 줄 — `items[i].kind === "fee"` 인 줄은 회색 바탕(#f3f3f3) · 글자 #555 · 주문상품 칸 굵게(600).
   두 필드는 **선택**이다 — 넘기지 않으면 예전과 한 글자도 다르지 않게 그린다(옛 공개 토큰 본문 · 리포트 인쇄 공용
   printInvoiceDoc 영향 없음). 문서 데이터는 util/invoice-data.js `invoiceDocData` 한 곳에서 만든다.
   ============================================================ */
import { html, escapeHtml } from "./dom.js";

/* 페이지당 거래내역 행수(A4 1123px 기준 실측 여유값).
   1페이지는 정보표가 있어 적고, 이어지는 페이지는 헤더만 있어 더 담는다.
   FOOTER_ROWS: 마지막 페이지에 정산금액 푸터가 차지하는 행 여유분. */
const CAP_FIRST = 15;
const CAP_CONT = 21;
const FOOTER_ROWS = 2;

const S = {
  page: "position:relative;width:794px;height:1123px;background:#fff;font-family:Pretendard,sans-serif;font-size:12px;color:#333;padding:36px 44px 28px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;",
  table: "width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #d4d4d4;font-size:12px;font-family:Pretendard,sans-serif;",
  th: "background:#f5f5f5;padding:11px 14px;font-weight:600;color:#444;border:1px solid #d4d4d4;text-align:left;vertical-align:middle;line-height:1.4;white-space:nowrap;overflow:hidden;",
  td: "padding:11px 14px;color:#333;border:1px solid #d4d4d4;vertical-align:middle;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
  infoLabel: "background:#f5f5f5;padding:9px 10px;font-weight:600;color:#444;border:1px solid #d4d4d4;vertical-align:middle;line-height:1.4;white-space:nowrap;overflow:hidden;",
  infoValue: "padding:9px 10px;color:#333;border:1px solid #d4d4d4;vertical-align:middle;line-height:1.4;word-break:break-all;",
  address: "padding:11px 14px;color:#333;border:1px solid #d4d4d4;vertical-align:middle;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
  sectionTitle: "margin:0 0 7px;font-size:12px;font-weight:700;color:#222;padding-bottom:5px;border-bottom:2px solid #333;",
};

function infoTable(title, rows) {
  return html`
    <div style="margin-bottom:22px">
      <p style="${S.sectionTitle}">${title}</p>
      <table style="${S.table}">
        <colgroup>
          <col style="width:100px" /><col /><col style="width:100px" /><col />
          <col style="width:100px" /><col />
        </colgroup>
        <tbody>
          ${rows.map((cells) =>
            cells.length === 1
              ? html`<tr>
                  <td style="${S.infoLabel}">${cells[0].label}</td>
                  <td style="${S.infoValue}" colspan="5">${cells[0].value}</td>
                </tr>`
              : html`<tr>
                  ${cells.map(
                    (c) => html`<td style="${S.infoLabel}">${c.label}</td><td style="${S.infoValue}" colspan="${c.valueColSpan ?? 1}">${c.value}</td>`
                  )}
                </tr>`
          )}
        </tbody>
      </table>
    </div>
  `;
}

/* 동의 전 표기(선택 — d.stamp). 머리 태그와 장마다 왼쪽 아래 줄. */
const stampTag = (st) => `${st.text} · ${st.printedAt} 출력`;
const stampFoot = (st) => `${st.printedAt} 출력 · ${st.text}`;

/* 문서 상단 브랜드 헤더 (모든 페이지 공통) */
function headerBlock(d, assetBase) {
  if (d.stamp) {
    return html`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${assetBase}invoice-logo.png" alt="" style="width:28px;height:28px;object-fit:cover" />
        <span style="font-size:18px;font-weight:700;color:#222">${d.title}</span>
      </div>
      <div style="text-align:right">
        <span style="display:block;font-size:12px;font-weight:600;color:#666">${d.period}</span>
        <span style="display:inline-block;margin-top:5px;padding:3px 8px;border:1px solid #d94000;border-radius:4px;font-size:11px;font-weight:700;color:#d94000;white-space:nowrap">${stampTag(d.stamp)}</span>
      </div>
    </div>
  `;
  }
  return html`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${assetBase}invoice-logo.png" alt="" style="width:28px;height:28px;object-fit:cover" />
        <span style="font-size:18px;font-weight:700;color:#222">${d.title}</span>
      </div>
      <span style="font-size:12px;font-weight:600;color:#666">${d.period}</span>
    </div>
  `;
}

/* 거래내역 표 (제목 + 헤더행 + 해당 페이지 행묶음). flex:1 로 남은 높이를 채워 푸터를 하단에 고정. */
function txTable(rows, continued) {
  return html`
    <div style="flex:1;min-height:0;margin-bottom:14px">
      <p style="${S.sectionTitle}">꽃배달 거래내역${continued ? " (계속)" : ""}</p>
      <table style="${S.table}">
        <colgroup>
          <col style="width:148px" /><col style="width:70px" /><col /><col style="width:128px" /><col style="width:92px" />
        </colgroup>
        <thead>
          <tr>
            <th style="${S.th}">배송요청일시</th>
            <th style="${S.th}text-align:center;">발송인</th>
            <th style="${S.th}">배송지 정보</th>
            <th style="${S.th}">주문상품</th>
            <th style="${S.th}text-align:center;">결제금액</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((it) => {
            /* 취소 수수료 줄(선택 — it.kind === "fee") — 셀마다 색을 덧붙인다(S.td 가 셀 단위로 color 를 정하므로 tr 에 걸면 안 먹는다). */
            if (it.kind === "fee") {
              const F = "background:#f3f3f3;color:#555;";
              return html`<tr>
              <td style="${S.td}${F}">${it.date}</td>
              <td style="${S.td}text-align:center;${F}">${it.sender}</td>
              <td style="${S.address}${F}">${it.address}</td>
              <td style="${S.td}${F}font-weight:600;">${it.product}</td>
              <td style="${S.td}text-align:center;${F}">${it.amount}</td>
            </tr>`;
            }
            return html`<tr>
              <td style="${S.td}">${it.date}</td>
              <td style="${S.td}text-align:center;">${it.sender}</td>
              <td style="${S.address}">${it.address}</td>
              <td style="${S.td}">${it.product}</td>
              <td style="${S.td}text-align:center;">${it.amount}</td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  `;
}

/* 입금계좌·정산금액 푸터 (마지막 페이지에만) */
function footerBlock(d) {
  return html`
    <table style="${S.table}flex-shrink:0;">
      <colgroup><col /><col style="width:185px" /></colgroup>
      <tbody>
        <tr>
          <td style="${S.td}white-space:nowrap;">
            <span style="font-weight:700;color:#444;margin-right:12px">입금계좌 안내</span>
            <span>${d.account}</span>
          </td>
          <td style="${S.td}background:#f8f8f8;text-align:right;">
            <span style="font-weight:600;color:#444">정산금액 </span>
            <span style="font-weight:700;color:#f15a2a;font-size:14px">${d.total}</span>
          </td>
        </tr>
      </tbody>
    </table>
  `;
}

/* 거래내역 행을 페이지 용량에 맞춰 나눈다. 마지막 페이지에는 푸터가 들어갈
   여유(FOOTER_ROWS)를 남겨, 푸터가 다음 장으로 밀리거나 잘리지 않게 한다. */
function paginateItems(items) {
  const pages = [];
  let rest = items.slice();
  let first = true;
  /* 방어: 빈 배열이어도 최소 1페이지(빈 표) 보장 */
  if (rest.length === 0) return [[]];
  while (rest.length) {
    const cap = first ? CAP_FIRST : CAP_CONT;
    if (rest.length <= cap - FOOTER_ROWS) {
      pages.push(rest); // 마지막 페이지 — 푸터까지 여유 있게 들어감
      rest = [];
    } else if (rest.length <= cap) {
      /* 이 페이지에 다 담기지만 푸터가 안 들어감 → 일부만 담고 나머지는 마지막 장으로 */
      pages.push(rest.slice(0, cap - FOOTER_ROWS));
      rest = rest.slice(cap - FOOTER_ROWS);
    } else {
      pages.push(rest.slice(0, cap));
      rest = rest.slice(cap);
    }
    first = false;
  }
  return pages;
}

function pageBlock(d, assetBase, rows, pageIdx, pageCount) {
  const isFirst = pageIdx === 0;
  const isLast = pageIdx === pageCount - 1;
  const breakStyle = isLast ? "" : "break-after:page;page-break-after:always;";
  return html`
    <div class="invoice-page" style="${S.page}${breakStyle}">
      ${headerBlock(d, assetBase)}
      ${isFirst
        ? html`${infoTable("공급받는자", [
            [{ label: "사업장주소", value: d.buyer.address }],
            // 부서는 동일 사업자번호를 부서별로 나눠 쓰는 거래처에만 실려 온다(없으면 행 자체가 빠짐).
            ...(d.buyer.department ? [[{ label: "부서", value: d.buyer.department }]] : []),
            [{ label: "회사명", value: d.buyer.company }, { label: "사업자번호", value: d.buyer.bizNumber }, { label: "대표자명", value: d.buyer.ceo }],
            [{ label: "명세요약", value: d.buyer.summary }, { label: "명세서 발행일", value: d.buyer.issueDate }, { label: "계산서 발행", value: d.buyer.invoiceNote }],
          ])}
          ${infoTable("공급자", [
            [{ label: "회사명", value: d.supplier.company }, { label: "사업자번호", value: d.supplier.bizNumber }, { label: "대표자명", value: d.supplier.ceo }],
            [{ label: "E-MAIL", value: d.supplier.email, valueColSpan: 3 }, { label: "FAX", value: d.supplier.fax }],
          ])}`
        : ""}
      ${txTable(rows, !isFirst)}
      ${isLast ? footerBlock(d) : ""}
      ${d.stamp ? html`<div style="position:absolute;left:44px;bottom:12px;font-size:10px;color:#999;">${stampFoot(d.stamp)}</div>` : ""}${pageCount > 1
        ? html`<div style="position:absolute;right:44px;bottom:12px;font-size:10px;color:#999;letter-spacing:0.02em;">${pageIdx + 1} / ${pageCount} 페이지</div>`
        : ""}
    </div>
  `;
}

export function invoiceDoc(d, assetBase = "./assets/") {
  const pages = paginateItems(d.items);
  const pageCount = pages.length;
  return html`
    <div class="invoice-doc" style="display:flex;flex-direction:column;align-items:center;">
      ${pages.map((rows, i) => pageBlock(d, assetBase, rows, i, pageCount))}
    </div>
  `;
}

/** Open the invoice in a bare window and trigger print (→ Save as PDF).
 *  돌려주는 값: 인쇄창을 열었으면 `true`, 팝업이 막혔으면 `false`(경고창은 여기서 띄운다). 호출부는 `=== false` 면
 *  '내려받습니다' 류 통보를 띄우지 않는다 — 막혔는데 경고창과 성공 토스트가 함께 떴다(2026-10-17). 출력은 그대로다. */
export function printInvoiceDoc(el, title) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
    return false;
  }
  const div = document.createElement("div");
  div.innerHTML = el.outerHTML;
  div.querySelectorAll("img").forEach((img) => { img.src = img.src; }); // relative → absolute
  const invoiceHTML = div.innerHTML;
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { display: flex; flex-direction: column; align-items: center; background: #fff; }
    .invoice-doc { display: flex; flex-direction: column; align-items: center; }
    /* 인쇄 시 페이지 카드 그림자/여백 제거 — 페이지 경계는 break-after 로 처리 */
    .invoice-page { box-shadow: none !important; margin: 0 !important; }
  </style>
</head>
<body>${invoiceHTML}
  <script>
    (function () {
      var done = false;
      function go() { if (done) return; done = true; try { window.focus(); window.print(); } catch (e) {} }
      window.addEventListener('afterprint', function () { window.close(); });
      var loaded = new Promise(function (r) {
        if (document.readyState === 'complete') r();
        else window.addEventListener('load', r, { once: true });
      });
      var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      Promise.all([loaded, fonts]).then(function () { setTimeout(go, 150); });
      setTimeout(go, 2500);
    })();
  <\/script>
</body>
</html>`);
  printWindow.document.close();
  return true;
}
