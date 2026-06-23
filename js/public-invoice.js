/* ============================================================
   public-invoice.js — 공개 거래명세서 페이지 (/invoice/?link=토큰).
   로그인 불필요. 링크 토큰으로 명세서를 찾고, 사업자번호 확인 후
   invoice-doc 노출 + PDF 다운로드. 기업×귀속년월별로 토큰이 분리됨.
   ============================================================ */
import { html, raw, setHTML, on, qs } from "./dom.js";
import { icon } from "./icons.js";
import { invoiceDoc, printInvoiceDoc } from "./invoice-doc.js";
import { resolveLink, normalizeBiz } from "./data/invoice-links.js";

// 흰색 PDF 아이콘(SVG Repo, CC0). 문서 본체+접힌 모서리+'PDF' 글자를 단일 path로
// 합치고 fill-rule:evenodd 로 글자를 도려내(knockout) — currentColor(흰색) 문서에
// 주황 버튼 배경이 글자 자리로 비쳐 가독성 유지.
const PDF_ICON = `<svg class="pubinv__dl-ico" viewBox="0 0 309.267 309.267" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false" style="flex-shrink:0"><path fill-rule="evenodd" clip-rule="evenodd" d="M38.658,0h164.23l87.049,86.711v203.227c0,10.679-8.659,19.329-19.329,19.329H38.658c-10.67,0-19.329-8.65-19.329-19.329V19.329C19.329,8.65,27.989,0,38.658,0z M289.658,86.981h-67.372c-10.67,0-19.329-8.659-19.329-19.329V0.193L289.658,86.981z M217.434,146.544c3.238,0,4.823-2.822,4.823-5.557c0-2.832-1.653-5.567-4.823-5.567h-18.44c-3.605,0-5.615,2.986-5.615,6.282v45.317c0,4.04,2.3,6.282,5.412,6.282c3.093,0,5.403-2.242,5.403-6.282v-12.438h11.153c3.46,0,5.19-2.832,5.19-5.644c0-2.754-1.73-5.49-5.19-5.49h-11.153v-16.903C204.194,146.544,217.434,146.544,217.434,146.544z M155.107,135.42h-13.492c-3.663,0-6.263,2.513-6.263,6.243v45.395c0,4.629,3.74,6.079,6.417,6.079h14.159c16.758,0,27.824-11.027,27.824-28.047C183.743,147.095,173.325,135.42,155.107,135.42z M155.755,181.946h-8.225v-35.334h7.413c11.221,0,16.101,7.529,16.101,17.918C171.044,174.253,166.25,181.946,155.755,181.946z M106.33,135.42H92.964c-3.779,0-5.886,2.493-5.886,6.282v45.317c0,4.04,2.416,6.282,5.663,6.282s5.663-2.242,5.663-6.282v-13.231h8.379c10.341,0,18.875-7.326,18.875-19.107C125.659,143.152,117.425,135.42,106.33,135.42z M106.108,163.158h-7.703v-17.097h7.703c4.755,0,7.78,3.711,7.78,8.553C113.878,159.447,110.863,163.158,106.108,163.158z"/></svg>`;

const ASSET_BASE = "../assets/"; // 공개 페이지는 /invoice/ 하위 → 루트 assets는 ../
const root = document.getElementById("app");
const token = new URLSearchParams(location.search).get("link");
const record = resolveLink(token);
let error = "";

const headerBar = (withDownload = false) => html`
  <header class="pubinv__header">
    <img class="pubinv__logo" src="../assets/Black_Logo_Simbol.png" alt="올해의경조사" />
    <span class="pubinv__brand">올해의경조사 · 거래명세서</span>
    ${withDownload
      ? html`<button class="pubinv__dl" data-action="download">${raw(PDF_ICON)} PDF 다운로드</button>`
      : ""}
  </header>
`;

function renderInvalid() {
  setHTML(
    root,
    html`
      <div class="pubinv">
        ${headerBar()}
        <div class="pubinv__card pubinv__card--error">
          <div class="pubinv__icon pubinv__icon--error">${icon("alert-circle", { size: 30 })}</div>
          <h1 class="pubinv__title">유효하지 않은 링크입니다</h1>
          <p class="pubinv__sub">명세서 링크가 만료되었거나 올바르지 않습니다.<br />발급처에서 받은 링크를 다시 확인해 주세요.</p>
        </div>
      </div>
    `
  );
}

function renderGate() {
  setHTML(
    root,
    html`
      <div class="pubinv">
        ${headerBar()}
        <div class="pubinv__card">
          <div class="pubinv__icon">${icon("file-text", { size: 28 })}</div>
          <h1 class="pubinv__title">거래명세서 조회</h1>
          <p class="pubinv__sub"><strong>${record.doc.period}</strong> · ${record.doc.buyer.company}<br />본인 확인을 위해 <strong>사업자번호</strong>를 입력해 주세요.</p>
          <form class="pubinv__form" data-form novalidate>
            <input class="pubinv__input" data-biz type="text" inputmode="numeric" placeholder="예) 000-00-00000" autocomplete="off" aria-label="사업자번호" />
            ${error ? html`<p class="pubinv__err" role="alert">${icon("alert-circle", { size: 13 })} ${error}</p>` : ""}
            <button class="pubinv__btn" type="submit">${icon("file-text", { size: 15 })} 명세서 조회</button>
          </form>
          <p class="pubinv__note">${icon("info", { size: 12 })} 로그인 없이 사업자번호 확인만으로 열람·PDF 다운로드가 가능합니다.</p>
        </div>
      </div>
    `
  );
  const form = qs(root, "[data-form]");
  on(form, "submit", (e) => {
    e.preventDefault();
    const v = qs(root, "[data-biz]").value;
    if (normalizeBiz(v) === normalizeBiz(record.bizNumber) && normalizeBiz(v).length > 0) {
      error = "";
      renderDoc();
    } else {
      error = "사업자번호가 일치하지 않습니다. 다시 확인해 주세요.";
      renderGate();
      const inp = qs(root, "[data-biz]");
      if (inp) { inp.value = v; inp.focus(); }
    }
  });
  on(form, "input", "[data-biz]", () => { if (error) { error = ""; const e = qs(root, ".pubinv__err"); if (e) e.remove(); } });
}

function renderDoc() {
  setHTML(
    root,
    html`
      <div class="pubinv pubinv--doc">
        ${headerBar(true)}
        <div class="pubinv__docwrap">${invoiceDoc(record.doc, ASSET_BASE)}</div>
      </div>
    `
  );
  on(root, "click", "[data-action='download']", () => {
    const doc = qs(root, ".invoice-doc");
    if (doc) printInvoiceDoc(doc, "거래명세서_" + record.doc.buyer.company + "_" + record.doc.period.replace(/\s/g, ""));
  });
}

if (!record) renderInvalid();
else renderGate();
