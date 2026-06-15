/* ============================================================
   admin-clients.js — 거래처 정보관리
   거래처 리스트 + 상세/수정 모달(생성·수정) + 삭제. store.clients(영속).
   settlement.js cedit/.ofield + profile.js CRUD 패턴 재사용.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal } from "../ui.js";

const STATUS_OPTS = ["활성", "승인대기", "정지"];

// modal field config (grid:true 인접 2개는 2열로 묶임 — cedit 패턴)
const FIELDS = [
  { section: "계정 정보" },
  { key: "accountId", label: "접속 아이디", icon: "user", grid: true, lockOnEdit: true, required: true },
  { key: "password", label: "비밀번호", icon: "hash", grid: true, required: true },
  { section: "회사 정보" },
  { key: "companyName", label: "회사명", icon: "building2", required: true },
  { key: "bizNumber", label: "사업자번호", icon: "hash", grid: true, required: true },
  { key: "ceoName", label: "대표자명", icon: "user", grid: true, required: true },
  { section: "담당자 정보" },
  { key: "managerName", label: "담당자명", icon: "user-check", grid: true, required: true },
  { key: "department", label: "부서·직위", icon: "building2", grid: true },
  { key: "contact", label: "연락처", icon: "phone", grid: true, required: true },
  { key: "email", label: "계산서 이메일", icon: "mail", grid: true },
  { section: "기타" },
  { key: "address", label: "사업장주소", icon: "map-pin" },
  { key: "status", label: "상태", type: "select", options: STATUS_OPTS, grid: true },
  { key: "joinDate", label: "가입일", icon: "calendar-days", grid: true },
];
const REQUIRED = FIELDS.filter((f) => f.required).map((f) => f.key);

const statusPill = (s) => {
  const cls = s === "활성" ? "pill--success" : s === "정지" ? "pill--danger" : "pill--warn";
  return html`<span class="pill ${cls}">${s}</span>`;
};

function nextId(clients) {
  const max = clients.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
  return "C" + String(max + 1).padStart(3, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mount(root, { nav }) {
  let activeModal = null;
  let saveTimer = null;
  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  }

  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r, i) => String(i + 1).padStart(2, "0") },
    { label: "회사명", width: "1fr", render: (r) => html`<div class="ellipsis">${r.companyName}</div>` },
    { label: "사업자번호", width: "130px", align: "center", render: (r) => r.bizNumber },
    { label: "대표자명", width: "90px", align: "center", render: (r) => r.ceoName },
    { label: "담당자", width: "90px", align: "center", render: (r) => r.managerName },
    { label: "연락처", width: "140px", align: "center", render: (r) => r.contact },
    { label: "상태", width: "92px", align: "center", render: (r) => statusPill(r.status) },
    { label: "가입일", width: "110px", align: "center", render: (r) => r.joinDate },
    { label: "수정", width: "56px", align: "center", render: (r) => html`<button class="ptbl-edit" data-action="edit" data-id="${r.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>` },
    { label: "삭제", width: "56px", align: "center", render: (r) => html`<button class="ptbl-del" data-action="del" data-id="${r.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>` },
  ];

  function render() {
    const clients = store.get().clients;
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({
              imgSrc: "./assets/nav-profile.png",
              title: "거래처 정보관리",
              action: html`<button class="btn btn-secondary" data-action="new">${icon("user-plus", { size: 14 })} 신규 거래처 등록</button>`,
            })}
            <p class="admin-summary">총 <strong>${clients.length}</strong>개 거래처</p>
            ${tableGrid({ columns, rows: clients, rowKey: (r) => r.id, compact: true })}
          </div>
        </div>
      `
    );
  }

  // ── shared create/edit modal ───────────────────────────
  function field(f, form, isEdit) {
    if (f.type === "select") {
      return html`
        <div class="ofield">
          <label class="ofield__lbl">${f.label}</label>
          <select class="select" data-cf="${f.key}">
            ${f.options.map((o) => html`<option value="${o}" ${form[f.key] === o ? "selected" : ""}>${o}</option>`)}
          </select>
        </div>
      `;
    }
    const ro = f.lockOnEdit && isEdit;
    return html`
      <div class="ofield">
        <label class="ofield__lbl" for="cf-${f.key}">${f.label}${f.required ? html`<span class="req">*</span>` : ""}</label>
        <div class="ofield__wrap">
          ${icon(f.icon, { size: 14, cls: "ofield__icon" })}
          <input
            class="ofield__input has-icon ${ro ? "is-readonly" : ""}"
            id="cf-${f.key}"
            data-cf="${f.key}"
            type="text"
            value="${form[f.key] ?? ""}"
            placeholder="${f.placeholder ?? f.label}"
            ${ro ? "readonly" : ""}
          />
        </div>
      </div>
    `;
  }

  function openClientModal(client) {
    closeModal();
    const isEdit = !!client;
    const form = client
      ? { ...client }
      : { id: nextId(store.get().clients), accountId: "", password: "", companyName: "", bizNumber: "", ceoName: "", managerName: "", department: "", contact: "", email: "", address: "", status: "활성", joinDate: todayStr() };
    const isValid = () => REQUIRED.every((k) => String(form[k] ?? "").trim());

    const fieldsHtml = () => {
      const out = [];
      let i = 0;
      while (i < FIELDS.length) {
        const f = FIELDS[i];
        if (f.section) { out.push(html`<div class="cedit__section"><span>${f.section}</span></div>`); i++; continue; }
        if (f.grid && FIELDS[i + 1] && FIELDS[i + 1].grid) {
          out.push(html`<div class="cedit__grid2">${field(f, form, isEdit)}${field(FIELDS[i + 1], form, isEdit)}</div>`);
          i += 2;
        } else { out.push(field(f, form, isEdit)); i++; }
      }
      return out;
    };

    const body = html`
      <div class="cedit">
        <div class="cedit__head">
          <div class="cedit__head-icon">${icon(isEdit ? "building2" : "user-plus", { size: 18 })}</div>
          <div>
            <h2>${isEdit ? "거래처 정보 수정" : "신규 거래처 등록"}</h2>
            <p>${isEdit ? "거래처 계정·회사·담당자 정보를 수정합니다." : "신규 거래처 계정과 정보를 등록합니다."}</p>
          </div>
        </div>
        <div class="cedit__body">${fieldsHtml()}</div>
        <div class="cedit__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="cedit__save ${isValid() ? "is-on" : ""}" data-action="save" ${isValid() ? "" : "disabled"}>
            ${icon(isEdit ? "pencil" : "user-plus", { size: 14 })} ${isEdit ? "저장" : "등록"}
          </button>
        </div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--cedit", body, onClose: () => {} });
    const saveBtn = () => qs(activeModal.panel, "[data-action='save']");
    const syncSave = () => { const b = saveBtn(); if (b) { b.disabled = !isValid(); b.classList.toggle("is-on", isValid()); } };

    on(activeModal.panel, "input", "[data-cf]", (e, t) => { form[t.dataset.cf] = t.value; syncSave(); });
    on(activeModal.panel, "change", "select[data-cf]", (e, t) => { form[t.dataset.cf] = t.value; syncSave(); });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='save']", () => {
      if (!isValid()) return;
      if (isEdit) store.updateClient({ ...form });
      else store.addClient({ ...form });
      const b = saveBtn();
      if (b) {
        b.disabled = true;
        b.classList.add("is-saved");
        setHTML(b, html`${icon("check-circle", { size: 15 })} ${isEdit ? "저장 완료!" : "등록 완료!"}`);
      }
      saveTimer = setTimeout(() => { saveTimer = null; closeModal(); render(); }, 900);
    });
  }

  function openDelete(client) {
    closeModal();
    const body = html`
      <div class="pdel">
        <div class="pdel__msg">
          <p><strong>${client.companyName}</strong> 거래처를 삭제하시겠습니까?</p>
          <p class="pdel__sub">계정(아이디·비밀번호)·정산·주문 정보가 모두 삭제되며 복구할 수 없습니다.</p>
        </div>
        <div class="pdel__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="pdel__del" data-action="do-del">삭제</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: "거래처 삭제", body, onClose: () => {} });
    on(activeModal.panel, "click", "[data-action='do-del']", () => {
      store.removeClient(client.id);
      closeModal();
      render();
    });
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "new") return openClientModal(null);
    const client = store.get().clients.find((c) => c.id === t.dataset.id);
    if (a === "edit" && client) openClientModal(client);
    else if (a === "del" && client) openDelete(client);
  });

  return () => { off(); closeModal(); };
}
