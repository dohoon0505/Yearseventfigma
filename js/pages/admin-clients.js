/* ============================================================
   admin-clients.js — 거래처 정보관리
   상단 필터(상태 탭 + 검색) · 가입 승인/거부 워크플로 · 상세/수정/생성/삭제.
   store.clients(영속). settlement cedit/.ofield + profile CRUD 패턴 재사용.
   ============================================================ */
import { html, setHTML, on, qs, el } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal } from "../ui.js";

const STATUS_OPTS = ["활성", "승인대기", "정지", "반려"];
const TABS = [
  { value: "all", label: "전체" },
  { value: "활성", label: "활성" },
  { value: "승인대기", label: "승인대기" },
  { value: "정지", label: "정지" },
  { value: "반려", label: "반려" },
];

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

const PILL = { "활성": "pill--success", "승인대기": "pill--warn", "정지": "pill--danger", "반려": "pill--gray" };
const statusPill = (s) => html`<span class="pill ${PILL[s] ?? "pill--gray"}">${s}</span>`;

function nextId(clients) {
  const max = clients.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
  return "C" + String(max + 1).padStart(3, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mount(root, { nav }) {
  const state = { tab: "all", search: "" };
  let activeModal = null;
  let saveTimer = null;
  let toastEl = null;
  let toastTimer = null;

  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  }
  function toast(msg, kind = "ok") {
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl = el(html`<div class="admin-toast admin-toast--${kind}">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; toastTimer = null; }, 2600);
  }

  function filtered() {
    const q = state.search.trim();
    return store.get().clients.filter((c) => {
      if (state.tab !== "all" && c.status !== state.tab) return false;
      if (q && !(c.companyName.includes(q) || c.bizNumber.includes(q) || c.managerName.includes(q))) return false;
      return true;
    });
  }

  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r, i) => String(i + 1).padStart(2, "0") },
    { label: "회사명", width: "1fr", render: (r) => html`<div class="ellipsis">${r.companyName}</div>` },
    { label: "사업자번호", width: "128px", align: "center", render: (r) => r.bizNumber },
    { label: "대표자명", width: "84px", align: "center", render: (r) => r.ceoName },
    { label: "담당자", width: "84px", align: "center", render: (r) => r.managerName },
    { label: "연락처", width: "136px", align: "center", render: (r) => r.contact },
    { label: "상태", width: "92px", align: "center", render: (r) => statusPill(r.status) },
    { label: "가입일", width: "108px", align: "center", render: (r) => r.joinDate },
    {
      label: "관리", width: "148px", align: "center",
      render: (r) =>
        r.status === "승인대기"
          ? html`<div class="admin-rowact">
              <button class="btn-approve" data-action="approve" data-id="${r.id}">승인</button>
              <button class="btn-reject" data-action="reject" data-id="${r.id}">거부</button>
            </div>`
          : html`<div class="admin-rowact">
              <button class="ptbl-edit" data-action="edit" data-id="${r.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>
              <button class="ptbl-del" data-action="del" data-id="${r.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>
            </div>`,
    },
  ];

  function tableBody() {
    const rows = filtered();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 거래처가 없습니다.</div>`;
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
  }
  function summaryBody() {
    return html`조회 <strong>${filtered().length}</strong>개 거래처`;
  }
  function tabsBody() {
    const clients = store.get().clients;
    return TABS.map((t) => {
      const count = t.value === "all" ? clients.length : clients.filter((c) => c.status === t.value).length;
      const active = state.tab === t.value;
      const alert = t.value === "승인대기" && count > 0;
      return html`<button class="chip ${active ? "is-active" : ""}" data-action="tab" data-v="${t.value}">${t.label}<span class="admin-tab-count ${alert ? "admin-tab-count--alert" : ""}">${count}</span></button>`;
    });
  }

  function render() {
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
            <div class="admin-filterbar">
              <div class="admin-tabs" data-slot="tabs">${tabsBody()}</div>
              <div class="admin-search">
                ${icon("search", { size: 14 })}
                <input type="text" data-search value="${state.search}" placeholder="회사명·사업자번호·담당자 검색" />
              </div>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }
  const refreshList = () => {
    const tabs = qs(root, "[data-slot='tabs']");
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (tabs) setHTML(tabs, tabsBody());
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };

  // ── create/edit modal ──────────────────────────────────
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
          <input class="ofield__input has-icon ${ro ? "is-readonly" : ""}" id="cf-${f.key}" data-cf="${f.key}" type="text" value="${form[f.key] ?? ""}" placeholder="${f.placeholder ?? f.label}" ${ro ? "readonly" : ""} />
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
        ${isEdit && form.status === "반려" && form.rejectReason
          ? html`<div class="cedit__rejectnote">거부 사유: ${form.rejectReason}</div>`
          : ""}
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

  // ── approve / reject ───────────────────────────────────
  function approve(client) {
    store.updateClient({ ...client, status: "활성", rejectReason: undefined });
    refreshList();
    toast(`${client.companyName} 거래처를 승인했습니다 · 환영 알림이 발송되었습니다`, "ok");
  }

  function openReject(client) {
    closeModal();
    const body = html`
      <div class="areject">
        <p class="areject__msg"><strong>${client.companyName}</strong> 거래처의 가입을 거부합니다.</p>
        <div class="ofield">
          <label class="ofield__lbl">거부 사유<span class="req">*</span></label>
          <textarea class="textarea" data-reason rows="3" placeholder="거부 사유를 입력하세요. 담당자에게 통보됩니다."></textarea>
        </div>
        <div class="areject__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="areject__confirm" data-action="do-reject" disabled>거부 처리</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: "가입 거부", body, onClose: () => {} });
    const ta = qs(activeModal.panel, "[data-reason]");
    const btn = qs(activeModal.panel, "[data-action='do-reject']");
    on(activeModal.panel, "input", "[data-reason]", () => { btn.disabled = !ta.value.trim(); });
    on(activeModal.panel, "click", "[data-action='do-reject']", () => {
      const reason = ta.value.trim();
      if (!reason) return;
      store.updateClient({ ...client, status: "반려", rejectReason: reason });
      closeModal();
      refreshList();
      toast(`${client.companyName} 가입을 거부했습니다 · 사유가 통보되었습니다`, "warn");
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
      refreshList();
      toast(`${client.companyName} 거래처를 삭제했습니다`, "warn");
    });
  }

  render();

  const findClient = (id) => store.get().clients.find((c) => c.id === id);
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; }
    if (a === "new") return openClientModal(null);
    const c = findClient(t.dataset.id);
    if (!c) return;
    if (a === "edit") openClientModal(c);
    else if (a === "del") openDelete(c);
    else if (a === "approve") approve(c);
    else if (a === "reject") openReject(c);
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });

  return () => {
    offClick();
    offSearch();
    closeModal();
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
  };
}
