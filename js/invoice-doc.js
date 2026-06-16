/* ============================================================
   invoice-doc.js — shared A4 거래명세서 renderer + print(PDF) routine.
   Used by the in-app view (pages/invoice.js) AND the public link page
   (/invoice/). The doc uses INLINE styles so window.print() (which copies
   outerHTML into a bare window) renders identically.

   invoiceDoc(d, assetBase) — d is the invoice data object:
     { title, period, buyer:{address,company,bizNumber,ceo,summary,issueDate,invoiceNote},
       supplier:{company,bizNumber,ceo,email,fax}, items:[{date,sender,address,product,amount}],
       account, total }
   assetBase: prefix for the logo image ("./assets/" in-app, "../assets/" under /invoice/).
   ============================================================ */
import { html } from "./dom.js";

const S = {
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

export function invoiceDoc(d, assetBase = "./assets/") {
  return html`
    <div class="invoice-doc" style="width:794px;height:1123px;background:#fff;font-family:Pretendard,sans-serif;font-size:12px;color:#333;padding:36px 44px 28px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="${assetBase}invoice-logo.png" alt="" style="width:28px;height:28px;object-fit:cover" />
          <span style="font-size:18px;font-weight:700;color:#222">${d.title}</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:#666">${d.period}</span>
      </div>

      ${infoTable("공급받는자", [
        [{ label: "사업장주소", value: d.buyer.address }],
        [{ label: "회사명", value: d.buyer.company }, { label: "사업자번호", value: d.buyer.bizNumber }, { label: "대표자명", value: d.buyer.ceo }],
        [{ label: "명세요약", value: d.buyer.summary }, { label: "명세서 발행일", value: d.buyer.issueDate }, { label: "계산서 발행", value: d.buyer.invoiceNote }],
      ])}

      ${infoTable("공급자", [
        [{ label: "회사명", value: d.supplier.company }, { label: "사업자번호", value: d.supplier.bizNumber }, { label: "대표자명", value: d.supplier.ceo }],
        [{ label: "E-MAIL", value: d.supplier.email, valueColSpan: 3 }, { label: "FAX", value: d.supplier.fax }],
      ])}

      <div style="flex:1;min-height:0;margin-bottom:22px">
        <p style="${S.sectionTitle}">꽃배달 거래내역</p>
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
            ${d.items.map(
              (it) => html`<tr>
                <td style="${S.td}">${it.date}</td>
                <td style="${S.td}text-align:center;">${it.sender}</td>
                <td style="${S.address}">${it.address}</td>
                <td style="${S.td}">${it.product}</td>
                <td style="${S.td}text-align:center;">${it.amount}</td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>

      <table style="${S.table}margin-top:auto;flex-shrink:0;">
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
    </div>
  `;
}

/** Open the invoice in a bare window and trigger print (→ Save as PDF). */
export function printInvoiceDoc(el, title) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
    return;
  }
  const div = document.createElement("div");
  div.innerHTML = el.outerHTML;
  div.querySelectorAll("img").forEach((img) => { img.src = img.src; }); // relative → absolute
  const invoiceHTML = div.innerHTML;
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { display: flex; justify-content: center; background: #fff; }
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
}
