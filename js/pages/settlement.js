/* ============================================================
   settlement.js — ports SettlementView.tsx (정산회계 간편조회)
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, openModal } from "../ui.js";

const DEFAULT_COMPANY = {
  회사명: "주식회사 싱크플로",
  사업자번호: "680-87-02988",
  대표자명: "홍길동",
  계산서이메일: "admin@thinkflow.info",
  담당자명: "홍길동",
  담당자연락처: "010-7615-2699",
  사업장주소: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사",
};

const settlementData = [
  { id: "B256C987", 발행일: "2026. 05. 01", 정산기한: "2026. 05. 31", 청구내역: "2026년 04월 꽃배달 이용금 청구", 청구년월: "2026년 04월", 정산금액: "350,000원", 입금자: "홍길동", 계산서발급: "동의하기", 정산확인: "정산필요" },
  { id: "C379D421", 발행일: "2026. 04. 01", 정산기한: "2026. 04. 30", 청구내역: "2026년 03월 꽃배달 이용금 청구", 청구년월: "2026년 03월", 정산금액: "650,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "D4816E54", 발행일: "2026. 03. 01", 정산기한: "2026. 03. 31", 청구내역: "2026년 02월 꽃배달 이용금 청구", 청구년월: "2026년 02월", 정산금액: "500,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "E592F876", 발행일: "2026. 02. 01", 정산기한: "2026. 02. 28", 청구내역: "2026년 01월 꽃배달 이용금 청구", 청구년월: "2026년 01월", 정산금액: "1,250,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "F613G298", 발행일: "2026. 01. 01", 정산기한: "2026. 01. 31", 청구내역: "2025년 12월 꽃배달 이용금 청구", 청구년월: "2025년 12월", 정산금액: "700,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
];

const COL = "118px 120px 120px 1fr 120px 70px 200px 100px 100px";
const HEADERS = ["문서 번호", "청구서 발행일", "정산 기한", "청구 내역", "정산금액", "입금자", "거래명세서", "계산서발급", "정산확인"];

const invoiceBadge = (t) =>
  t === "동의하기"
    ? html`<span class="settle-badge settle-badge--warn">동의필요</span>`
    : html`<span class="settle-badge settle-badge--ok">발급완료</span>`;
const settleBadge = (t) =>
  t === "정산필요"
    ? html`<span class="settle-badge settle-badge--danger">정산필요</span>`
    : html`<span class="settle-badge settle-badge--ok">정산완료</span>`;

const EDIT_FIELDS = [
  { section: "회사 기본정보" },
  { key: "회사명", label: "회사명", placeholder: "예) 주식회사 싱크플로", icon: "building2", grid: true },
  { key: "사업자번호", label: "사업자번호", placeholder: "예) 000-00-00000", icon: "hash", grid: true },
  { key: "대표자명", label: "대표자명", placeholder: "예) 홍길동", icon: "user" },
  { section: "계산서 및 담당자 정보" },
  { key: "계산서이메일", label: "계산서 이메일", placeholder: "예) billing@company.com", icon: "mail" },
  { key: "담당자명", label: "담당자명", placeholder: "예) 홍길동", icon: "user", grid: true },
  { key: "담당자연락처", label: "담당자 연락처", placeholder: "예) 010-0000-0000", icon: "phone", grid: true },
  { section: "사업장 주소" },
  { key: "사업장주소", label: "사업장주소", placeholder: "예) 서울 중구 퇴계로 100", icon: "map-pin" },
];

export function mount(root, { nav }) {
  const state = { company: { ...DEFAULT_COMPANY } };
  let activeModal = null;
  let saveTimer = null;
  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  }

  function infoRow(fields) {
    return html`<div class="settle-inforow">
      ${fields.map(
        (f, i) => html`<div class="settle-infocell ${i > 0 ? "has-border" : ""}" style="flex:${f.flex ?? 1}">
          <div class="settle-infolabel">${f.label}</div>
          <div class="settle-infoval">${f.value}</div>
        </div>`
      )}
    </div>`;
  }

  function render() {
    const c = state.company;
    setHTML(
      root,
      html`
        <div class="page-settlement">
          <div class="settle-inner">
            <div class="settle-head">
              ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "정산회계 간편조회" })}
              <button class="settle-edit-btn" data-action="edit">${icon("pencil", { size: 13 })}회사정보수정</button>
            </div>

            <div class="settle-company">
              ${infoRow([{ label: "회사명", value: c.회사명 }, { label: "사업자번호", value: c.사업자번호 }, { label: "대표자명", value: c.대표자명 }])}
              ${infoRow([{ label: "계산서 이메일", value: c.계산서이메일 }, { label: "담당자명", value: c.담당자명 }, { label: "담당자 연락처", value: c.담당자연락처 }])}
              ${infoRow([{ label: "사업장주소", value: c.사업장주소, flex: 3 }])}
            </div>

            <div class="settle-notice">
              <p>📌 매월 1일 10:00 명세서 발급 → 거래 상세내역 확인 → 이상 없는 경우 <strong>"계산서 발급 동의"</strong> → 계산서 자동발급 → 금액과 입금 내역 일치 시 <strong>"정산 완료"</strong></p>
            </div>

            <div class="settle-table">
              <div class="settle-thead" style="grid-template-columns:${COL}">
                ${HEADERS.map((h) => html`<div class="settle-th">${h}</div>`)}
              </div>
              ${settlementData.map(
                (r) => html`<div class="settle-trow" style="grid-template-columns:${COL}">
                  <div class="settle-td"><button class="settle-link" data-action="invoice"><span>${icon("file-text", { size: 13 })}</span>${r.id}</button></div>
                  <div class="settle-td settle-td--muted">${r.발행일}</div>
                  <div class="settle-td settle-td--muted">${r.정산기한}</div>
                  <div class="settle-td settle-td--clip"><p class="ellipsis">${r.청구내역}</p></div>
                  <div class="settle-td"><span class="settle-amount">${r.정산금액}</span></div>
                  <div class="settle-td settle-td--muted">${r.입금자}</div>
                  <div class="settle-td"><button class="settle-link" data-action="invoice">${r.청구년월} 명세서 조회 ${icon("external-link", { size: 11 })}</button></div>
                  <div class="settle-td">${invoiceBadge(r.계산서발급)}</div>
                  <div class="settle-td">${settleBadge(r.정산확인)}</div>
                </div>`
              )}
            </div>
          </div>
        </div>
      `
    );
  }

  function openEditModal() {
    closeModal();
    const form = { ...state.company };
    const isValid = () => EDIT_FIELDS.every((f) => f.section || form[f.key].trim());

    const editField = (f) => html`
      <div class="ofield">
        <label class="ofield__lbl" for="se-${f.key}">${f.label}<span class="req">*</span></label>
        <div class="ofield__wrap">
          ${icon(f.icon, { size: 14, cls: "ofield__icon" })}
          <input class="ofield__input has-icon" id="se-${f.key}" data-cf="${f.key}" type="text" value="${form[f.key]}" placeholder="${f.placeholder}" />
        </div>
      </div>
    `;

    const body = html`
      <div class="cedit">
        <div class="cedit__head">
          <div class="cedit__head-icon">${icon("building2", { size: 18 })}</div>
          <div><h2>회사정보 수정</h2><p>정산에 사용될 회사 정보를 수정합니다.</p></div>
        </div>
        <div class="cedit__body">
          ${(() => {
            const out = [];
            let i = 0;
            while (i < EDIT_FIELDS.length) {
              const f = EDIT_FIELDS[i];
              if (f.section) { out.push(html`<div class="cedit__section"><span>${f.section}</span></div>`); i++; continue; }
              if (f.grid && EDIT_FIELDS[i + 1] && EDIT_FIELDS[i + 1].grid) {
                out.push(html`<div class="cedit__grid2">${editField(f)}${editField(EDIT_FIELDS[i + 1])}</div>`);
                i += 2;
              } else { out.push(editField(f)); i++; }
            }
            return out;
          })()}
        </div>
        <div class="cedit__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="cedit__save ${isValid() ? "is-on" : ""}" data-action="save" ${isValid() ? "" : "disabled"}>
            ${icon("pencil", { size: 14 })} 저장
          </button>
        </div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--cedit", body, onClose: () => {} });
    const saveBtn = () => qs(activeModal.panel, "[data-action='save']");
    on(activeModal.panel, "input", "[data-cf]", (e, t) => {
      form[t.dataset.cf] = t.value;
      const b = saveBtn();
      if (b) { b.disabled = !isValid(); b.classList.toggle("is-on", isValid()); }
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='save']", () => {
      if (!isValid()) return;
      state.company = { ...form };
      const b = saveBtn();
      if (b) {
        b.disabled = true;
        b.classList.add("is-saved");
        setHTML(b, html`${icon("check-circle", { size: 15 })} 저장 완료!`);
      }
      saveTimer = setTimeout(() => { saveTimer = null; closeModal(); render(); }, 900);
    });
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "edit") openEditModal();
    else if (a === "invoice") nav("#/app/invoice");
  });

  return () => { off(); closeModal(); };
}
