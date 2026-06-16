/* ============================================================
   invoice.js — ports InvoiceView.tsx (거래명세서)
   A4 doc uses INLINE styles so window.print() (which copies
   outerHTML into a bare window) renders identically.
   ============================================================ */
import { html, raw, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, simpleModal } from "../ui.js";

const invoiceItems = [
  { date: "2025년 08월 30일", sender: "홍길동", address: "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", product: "근조화환(기본형)", amount: "70,000원" },
  { date: "2025년 08월 28일", sender: "김태권", address: "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", product: "근조화환(기본형)", amount: "100,000원" },
  { date: "2025년 08월 23일", sender: "김태권", address: "경기 마주시 금품억로 190 새디인병원 장례식장 지하1층 특2호실", product: "근조화환(기본형)", amount: "50,000원" },
  { date: "2025년 08월 19일", sender: "채상운", address: "부산 남구 황령대로 401-9 그랜드드몬트 6층 시그니처룸", product: "근조화환(기본형)", amount: "50,000원" },
  { date: "2025년 08월 12일", sender: "박진찬", address: "경상북도 예천군 예천읍 양오로 154 (정북아) 예천농협장례식장 3호실", product: "근조화환(기본형)", amount: "50,000원" },
  { date: "2025년 08월 05일", sender: "박진찬", address: "서울 강남구 논현로 645 렉시미나호텔", product: "근조화환(기본형)", amount: "50,000원" },
  { date: "2025년 08월 30일", sender: "홍길동", address: "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", product: "근조화환(기본형)", amount: "70,000원" },
  { date: "2025년 08월 28일", sender: "김태권", address: "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", product: "근조화환(기본형)", amount: "50,000원" },
];

// inline style fragments (ported from the `S` object)
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

function invoiceDoc() {
  return html`
    <div class="invoice-doc" style="width:794px;height:1123px;background:#fff;font-family:Pretendard,sans-serif;font-size:12px;color:#333;padding:36px 44px 28px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="./assets/invoice-logo.png" alt="" style="width:28px;height:28px;object-fit:cover" />
          <span style="font-size:18px;font-weight:700;color:#222">26년 04월 꽃배달 거래명세서</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:#666">2026년 04월 귀속</span>
      </div>

      ${infoTable("공급받는자", [
        [{ label: "사업장주소", value: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사" }],
        [{ label: "회사명", value: "주식회사 싱크플로" }, { label: "사업자번호", value: "680-87-02988" }, { label: "대표자명", value: "홍길동" }],
        [{ label: "명세요약", value: "꽃배달 이용료 청구" }, { label: "명세서 발행일", value: "2026년 05월 01일" }, { label: "계산서 발행", value: "명세서 조회 후 발급" }],
      ])}

      ${infoTable("공급자", [
        [{ label: "회사명", value: "도랑플라워" }, { label: "사업자번호", value: "321-99-01778" }, { label: "대표자명", value: "김도훈" }],
        [{ label: "E-MAIL", value: "ehgns335@naver.com", valueColSpan: 3 }, { label: "FAX", value: "053-715-2699" }],
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
            ${invoiceItems.map(
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
              <span>NH농협은행 352-2284-9916-83 예금주 김도훈(도랑플라워)</span>
            </td>
            <td style="${S.td}background:#f8f8f8;text-align:right;">
              <span style="font-weight:600;color:#444">정산금액 </span>
              <span style="font-weight:700;color:#f15a2a;font-size:14px">215,000원</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function downloadPDF(el, period) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
    return;
  }
  const resolveAbsoluteUrls = (markup) => {
    const div = document.createElement("div");
    div.innerHTML = markup;
    div.querySelectorAll("img").forEach((img) => {
      img.src = img.src; // relative → absolute
    });
    return div.innerHTML;
  };
  const invoiceHTML = resolveAbsoluteUrls(el.outerHTML);
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>거래명세서_${period}</title>
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
      setTimeout(go, 2500); // fallback if load/fonts stall
    })();
  <\/script>
</body>
</html>`);
  printWindow.document.close();
}

export function mount(root, { nav }) {
  const state = { selectedPeriod: "2026년 04월", agreed: false };
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  // 정산·회계 담당자(담당자 저장공간 지정)를 불러와 명세서 발급/입금 알림 수신자로 표시
  const billtoBody = () => {
    const b = store.getBillingContact();
    return b
      ? html`<div class="invoice-billto__in">${icon("bell", { size: 14 })}<div><p class="invoice-billto__lbl">정산·회계 알림 수신</p><p class="invoice-billto__val">${b.name} (${b.role}) · <strong>${b.phone}</strong></p></div></div>`
      : html`<div class="invoice-billto__in is-none">${icon("alert-circle", { size: 14 })}<div><p class="invoice-billto__lbl">정산·회계 담당자 미지정</p><p class="invoice-billto__val">담당자 저장공간에서 지정해 주세요.</p></div></div>`;
  };

  function render() {
    setHTML(
      root,
      html`
        <div class="page-invoice">
          <div class="invoice-card">${invoiceDoc()}</div>
          <div class="invoice-panel">
            <button class="invoice-dl" data-action="download">
              ${icon("download", { size: 18 })}
              <span class="invoice-dl__txt">${state.selectedPeriod} 거래명세서<br />PDF 다운로드</span>
            </button>
            <div class="invoice-info">
              <h3 class="invoice-info__title">💰 거래명세서 조회</h3>
              <div class="invoice-period">
                <div class="invoice-period__chip">${icon("calendar-days", { size: 13, cls: "tint-blue" })}<span>${state.selectedPeriod}</span></div>
                <button class="invoice-period__btn" data-action="change-period">기간 변경</button>
              </div>
              <div class="invoice-stats">
                <div class="invoice-stat"><span>${state.selectedPeriod} 결제금액</span><span class="invoice-stat__v">215,000원</span></div>
                <div class="invoice-stat"><span>결제&정산 대금기한</span><span class="invoice-stat__due">2026년 05월 31일</span></div>
                <div class="invoice-stat"><span>계산서 발급 동의</span>${state.agreed
                  ? html`<span class="invoice-stat__done">${icon("check-circle", { size: 12 })}동의완료</span>`
                  : html`<span class="invoice-stat__need">동의 필요</span>`}</div>
              </div>
              <div class="invoice-billto">${billtoBody()}</div>
              <button class="invoice-agree ${state.agreed ? "is-agreed" : ""}" data-action="agree">
                ${state.agreed
                  ? html`<span class="invoice-agree__done">${icon("check-circle", { size: 13 })}계산서 발급 동의 완료</span>`
                  : html`<span class="invoice-agree__need">해당 내용으로 계산서 발급에 동의합니다</span>`}
              </button>
            </div>
          </div>
        </div>
      `
    );
  }

  function openPeriodModal() {
    closeModal();
    const cur = state.selectedPeriod;
    const m = {
      year: cur.split("년")[0].trim(),
      month: (cur.split("년 ")[1]?.replace("월", "").trim() ?? "04").padStart(2, "0"),
    };
    const years = ["2024", "2025", "2026"];
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const body = () => html`
      <div class="pmodal">
        <div class="pmodal__selects">
          <div class="pmodal__field">
            <label>연도</label>
            <select class="select" data-pm="year">${years.map((y) => html`<option value="${y}" ${m.year === y ? "selected" : ""}>${y}년</option>`)}</select>
          </div>
          <div class="pmodal__field">
            <label>월</label>
            <select class="select" data-pm="month">${months.map((mo) => html`<option value="${mo}" ${m.month === mo ? "selected" : ""}>${mo}월</option>`)}</select>
          </div>
        </div>
        <div class="pmodal__preview">${icon("calendar-days", { size: 14, cls: "tint-blue" })}<span data-slot="pm-preview">선택 기간: ${m.year}년 ${m.month}월</span></div>
        <div class="pmodal__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="pmodal__ok" data-action="confirm">확인</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: "조회 기간 변경", body: body(), onClose: () => {} });
    on(activeModal.panel, "change", "[data-pm]", (e, t) => {
      m[t.dataset.pm] = t.value;
      const p = qs(activeModal.panel, "[data-slot='pm-preview']");
      if (p) p.textContent = `선택 기간: ${m.year}년 ${m.month}월`;
    });
    on(activeModal.panel, "click", "[data-action='confirm']", () => {
      state.selectedPeriod = `${m.year}년 ${m.month}월`;
      closeModal();
      render();
    });
  }

  function openAgreementModal() {
    closeModal();
    const billing = store.getBillingContact();
    const rows = [
      { label: "정산 기간", value: "2026년 04월", cls: "" },
      { label: "총 정산금액", value: "215,000원", cls: "tint-orange" },
      { label: "결제 기한", value: "2026년 05월 31일", cls: "" },
      { label: "알림톡 수신", value: billing ? `${billing.name} · ${billing.phone}` : "미지정", cls: "" },
    ];
    const body = html`
      <div class="amodal">
        <div class="amodal__summary">
          ${rows.map(
            (r) => html`<div class="amodal__row"><span>${r.label}</span><span class="amodal__val ${r.cls}">${r.value}</span></div>`
          )}
        </div>
        <div class="amodal__warn">
          <p>위 내역을 확인하였으며, 해당 내용으로 <strong>세금계산서 발급에 동의</strong>합니다.<br />동의 후에는 계산서가 자동으로 발급되며, 내용 변경이 불가합니다.</p>
        </div>
        <div class="amodal__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="amodal__ok" data-action="do-agree">${icon("check-circle", { size: 15 })}동의합니다</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: "계산서 발급 동의", body, onClose: () => {} });
    on(activeModal.panel, "click", "[data-action='do-agree']", () => {
      state.agreed = true;
      closeModal();
      render();
    });
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "download") {
      const doc = qs(root, ".invoice-doc");
      try { downloadPDF(doc, state.selectedPeriod); }
      catch (err) { console.error("PDF 생성 오류:", err); alert("PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요."); }
    } else if (a === "change-period") openPeriodModal();
    else if (a === "agree") { if (!state.agreed) openAgreementModal(); }
  });

  return () => { off(); closeModal(); };
}
