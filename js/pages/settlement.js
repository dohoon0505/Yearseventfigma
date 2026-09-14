/* ============================================================
   settlement.js — ports SettlementView.tsx (정산회계 간편조회)
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, openModal } from "../ui.js";
import { store } from "../store.js";
import { getClientId } from "../session.js";
import { settlementsFor, invoiceDayOf } from "../data/admin-mock.js";
import { sharedBizKeys, displayName } from "../util/biz.js";

/* 로그인한 거래처 레코드 → 이 화면의 회사정보 블록.
   계정이 실제 거래처와 매칭되지 않는 데모 로그인이면 첫 거래처로 폴백한다. */
function currentClient() {
  const clients = store.get().clients;
  return clients.find((c) => c.id === getClientId()) || clients[0] || null;
}
const companyOf = (c) => ({
  회사명: c.companyName,
  사업자번호: c.bizNumber,
  대표자명: c.ceoName,
  계산서이메일: c.email,
  담당자명: c.managerName,
  담당자연락처: c.contact,
  사업장주소: c.address,
});


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
  const client = currentClient();
  const state = { company: client ? companyOf(client) : null };
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
    if (!c) {
      setHTML(root, html`
        <div class="page-settlement">
          <div class="settle-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "정산회계 간편조회" })}
            <div class="admin-empty">연결된 거래처 정보가 없습니다.</div>
          </div>
        </div>
      `);
      return;
    }
    /* 표는 거래처 레코드에서 파생 — 관리자 정산 화면과 같은 데이터를 본다. */
    const rows = settlementsFor(client);
    const 표시명 = displayName(client, sharedBizKeys(store.get().clients));
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
              ${infoRow([{ label: "회사명", value: 표시명 }, { label: "사업자번호", value: c.사업자번호 }, { label: "대표자명", value: c.대표자명 }])}
              ${infoRow([{ label: "계산서 이메일", value: c.계산서이메일 }, { label: "담당자명", value: c.담당자명 }, { label: "담당자 연락처", value: c.담당자연락처 }])}
              ${infoRow([{ label: "사업장주소", value: c.사업장주소, flex: 3 }])}
            </div>

            <div class="settle-notice">
              <p>📌 매월 ${invoiceDayOf(client)}일 10:00 명세서 발급 → 거래 상세내역 확인 → 이상 없는 경우 <strong>"계산서 발급 동의"</strong> → 계산서 자동발급 → 금액과 입금 내역 일치 시 <strong>"정산 완료"</strong></p>
            </div>

            <div class="settle-table">
              <div class="settle-thead" style="grid-template-columns:${COL}">
                ${HEADERS.map((h) => html`<div class="settle-th">${h}</div>`)}
              </div>
              ${rows.map(
                (r) => html`<div class="settle-trow" style="grid-template-columns:${COL}">
                  <div class="settle-td"><button class="settle-link" data-action="invoice"><span>${icon("file-text", { size: 13 })}</span>${r.id}</button></div>
                  <div class="settle-td settle-td--muted">${r.발행일}</div>
                  <div class="settle-td settle-td--muted">${r.정산기한}</div>
                  <div class="settle-td settle-td--clip"><p class="ellipsis">${r.청구내역}</p></div>
                  <div class="settle-td"><span class="settle-amount">${r.정산금액}</span></div>
                  <div class="settle-td settle-td--muted">${r.입금자}</div>
                  <div class="settle-td"><button class="settle-link" data-action="invoice">${r.청구년월} 명세서 조회 ${icon("external-link", { size: 11 })}</button></div>
                  <div class="settle-td">${invoiceBadge(r.계산서발급)}</div>
                  <div class="settle-td">${settleBadge(r.입금완료 === "입금완료" ? "정산완료" : "정산필요")}</div>
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
      <div class="hm-field">
        <label for="se-${f.key}">${f.label}<span class="req">*</span></label>
        <input class="hm-input" id="se-${f.key}" data-cf="${f.key}" type="text" value="${form[f.key]}" placeholder="${f.placeholder}" />
      </div>
    `;

    const body = html`
      <div class="hm__head">
        <div><h3>회사정보 수정</h3><p>정산에 사용될 회사 정보를 수정합니다.</p></div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        ${(() => {
          const out = [];
          let i = 0;
          while (i < EDIT_FIELDS.length) {
            const f = EDIT_FIELDS[i];
            if (f.section) { out.push(html`<div class="hm-section">${f.section}</div>`); i++; continue; }
            if (f.grid && EDIT_FIELDS[i + 1] && EDIT_FIELDS[i + 1].grid) {
              out.push(html`<div class="hm-grid2">${editField(f)}${editField(EDIT_FIELDS[i + 1])}</div>`);
              i += 2;
            } else { out.push(editField(f)); i++; }
          }
          return out;
        })()}
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save" ${isValid() ? "" : "disabled"}>저장</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--lg", body, onClose: () => {} });
    const saveBtn = () => qs(activeModal.panel, "[data-action='save']");
    on(activeModal.panel, "input", "[data-cf]", (e, t) => {
      form[t.dataset.cf] = t.value;
      const b = saveBtn();
      if (b) b.disabled = !isValid();
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='save']", () => {
      if (!isValid()) return;
      state.company = { ...form };
      const b = saveBtn();
      if (b) {
        b.className = "hm-btn hm-btn--ok";
        b.disabled = true;
        setHTML(b, html`${icon("check", { size: 15 })} 저장 완료!`);
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
