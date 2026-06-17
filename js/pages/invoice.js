/* ============================================================
   invoice.js — ports InvoiceView.tsx (거래명세서)
   A4 문서 렌더링·PDF는 공유 모듈(invoice-doc.js)을 사용. 우측 패널에서
   기간 변경·계산서 발급 동의 + 정산·회계 담당자(알림 수신) 표시.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { issueLink, publicInvoiceUrl } from "../data/invoice-links.js";
import { pageTitle, simpleModal } from "../ui.js";

// 거래명세서 데이터 (공유 invoice-doc 렌더러에 전달)
const INVOICE_DATA = {
  title: "26년 04월 꽃배달 거래명세서",
  period: "2026년 04월 귀속",
  buyer: { address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사", company: "주식회사 싱크플로", bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: "명세서 조회 후 발급" },
  supplier: { company: "도랑플라워", bizNumber: "321-99-01778", ceo: "김도훈", email: "ehgns335@naver.com", fax: "053-715-2699" },
  items: [
    { date: "2025년 08월 30일", sender: "홍길동", address: "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", product: "근조화환(기본형)", amount: "70,000원" },
    { date: "2025년 08월 28일", sender: "김태권", address: "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", product: "근조화환(기본형)", amount: "100,000원" },
    { date: "2025년 08월 23일", sender: "김태권", address: "경기 마주시 금품억로 190 새디인병원 장례식장 지하1층 특2호실", product: "근조화환(기본형)", amount: "50,000원" },
    { date: "2025년 08월 19일", sender: "채상운", address: "부산 남구 황령대로 401-9 그랜드드몬트 6층 시그니처룸", product: "근조화환(기본형)", amount: "50,000원" },
    { date: "2025년 08월 12일", sender: "박진찬", address: "경상북도 예천군 예천읍 양오로 154 (정북아) 예천농협장례식장 3호실", product: "근조화환(기본형)", amount: "50,000원" },
    { date: "2025년 08월 05일", sender: "박진찬", address: "서울 강남구 논현로 645 렉시미나호텔", product: "근조화환(기본형)", amount: "50,000원" },
    { date: "2025년 08월 30일", sender: "홍길동", address: "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", product: "근조화환(기본형)", amount: "70,000원" },
    { date: "2025년 08월 28일", sender: "김태권", address: "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", product: "근조화환(기본형)", amount: "50,000원" },
  ],
  account: "NH농협은행 352-2284-9916-83 예금주 김도훈(도랑플라워)",
  total: "215,000원",
};

export function mount(root, { nav }) {
  const state = { selectedPeriod: "2026년 04월", agreed: false };
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  function render() {
    setHTML(
      root,
      html`
        <div class="page-invoice">
          <div class="invoice-card">${invoiceDoc(INVOICE_DATA)}</div>
          <div class="invoice-panel">
            <button class="invoice-dl" data-action="download">
              ${icon("download", { size: 14 })}
              <span>${state.selectedPeriod.replace("년 ", "_").replace("월", "")} 거래명세서 다운로드</span>
            </button>
            <button class="invoice-copylink" data-action="copy-link">
              ${icon("external-link", { size: 14 })}
              <span data-slot="copylabel">공개 링크 복사 (로그인 없이 열람)</span>
            </button>
            <div class="invoice-info">
              <h3 class="invoice-info__title">거래명세서 조회</h3>
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
      try { printInvoiceDoc(doc, "거래명세서_" + state.selectedPeriod); }
      catch (err) { console.error("PDF 생성 오류:", err); alert("PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요."); }
    } else if (a === "copy-link") {
      const token = issueLink({ bizNumber: INVOICE_DATA.buyer.bizNumber, doc: INVOICE_DATA });
      const url = publicInvoiceUrl(token);
      const label = qs(root, "[data-slot='copylabel']");
      const flash = () => { if (label) { label.textContent = "링크가 복사되었습니다!"; setTimeout(() => { if (label) label.textContent = "공개 링크 복사 (로그인 없이 열람)"; }, 1800); } };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(flash).catch(() => window.prompt("공개 링크 (복사하세요)", url));
      else window.prompt("공개 링크 (복사하세요)", url);
    } else if (a === "change-period") openPeriodModal();
    else if (a === "agree") { if (!state.agreed) openAgreementModal(); }
  });

  return () => { off(); closeModal(); };
}
