/* ============================================================
   public-invoice.js — 공개 거래명세서 페이지 (/invoice/?link=토큰).
   로그인 불필요. 링크 토큰으로 명세서를 찾고, 사업자번호 확인 후
   invoice-doc 노출 + PDF 다운로드. 기업×귀속년월별로 토큰이 분리됨.
   ============================================================ */
import { html, setHTML, on, qs } from "./dom.js";
import { icon } from "./icons.js";
import { invoiceDoc, printInvoiceDoc } from "./invoice-doc.js";
import { resolveLink, normalizeBiz } from "./data/invoice-links.js";

const ASSET_BASE = "../assets/"; // 공개 페이지는 /invoice/ 하위 → 루트 assets는 ../
const root = document.getElementById("app");
const token = new URLSearchParams(location.search).get("link");
const record = resolveLink(token);
let error = "";

const headerBar = () => html`
  <header class="pubinv__header">
    <img class="pubinv__logo" src="../assets/logo.png" alt="올해의경조사" />
    <span class="pubinv__brand">올해의경조사 · 거래명세서</span>
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
        ${headerBar()}
        <div class="pubinv__toolbar">
          <div class="pubinv__toolbar-l">${icon("check-circle", { size: 16 })}<span>${record.doc.buyer.company} · ${record.doc.period}</span></div>
          <button class="pubinv__dl" data-action="download">${icon("download", { size: 16 })} PDF 다운로드</button>
        </div>
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
