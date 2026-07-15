/* ============================================================
   admin-staff.js — 시스템 관리 > 담당자 관련설정
   내부 처리 담당자 디렉터리(이름·부서·연락처·알림수신)를 리스트로 관리.
   - 알림수신은 리스트 인라인 토글로 즉시 반영(카카오 알림톡 수신 허용 여부).
   - 신규 등록·정보 수정·삭제는 모달. 데이터 소스는 data/staff-mock.js.
   - 여기서 추가/삭제한 담당자는 B2C 담당자 지정 피커(staffNames 파생)에도 반영된다.
   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, el } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal } from "../ui.js";
import {
  staffList, staffAdd, staffUpdate, staffRemove, staffSetNotify, staffNewId,
} from "../data/staff-mock.js";

const TABS = [
  { v: "all", label: "전체" },
  { v: "on", label: "알림 수신" },
  { v: "off", label: "알림 거부" },
];

export function mount(root, { nav }) {
  const state = { tab: "all", search: "" };
  let activeModal = null, toastEl = null, toastTimer = null;

  function closeModal() { const m = activeModal; activeModal = null; if (m) m.close(); }
  function toast(msg, kind = "ok") {
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl = el(html`<div class="admin-toast admin-toast--${kind}">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; toastTimer = null; }, 2600);
  }
  /* 연락처 자동 하이픈 (admin-b2c formatPhone 과 동일 규칙) */
  function formatPhone(t) {
    let v = t.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 7) v = v.slice(0, 3) + "-" + v.slice(3, 7) + "-" + v.slice(7);
    else if (v.length > 3) v = v.slice(0, 3) + "-" + v.slice(3);
    t.value = v;
    return v;
  }

  /* ── 목록 ─────────────────────────────────────────────── */
  function filtered() {
    const q = state.search.trim();
    return staffList().filter((s) => {
      if (state.tab === "on" && !s.notify) return false;
      if (state.tab === "off" && s.notify) return false;
      if (q && !(s.name.includes(q) || (s.dept || "").includes(q) || s.phone.includes(q))) return false;
      return true;
    });
  }
  function tabsBody() {
    const all = staffList();
    return TABS.map((t) => {
      const count = t.v === "all" ? all.length : all.filter((s) => (t.v === "on" ? s.notify : !s.notify)).length;
      return html`<button class="chip ${state.tab === t.v ? "is-active" : ""}" data-action="tab" data-v="${t.v}">${t.label}<span class="admin-tab-count">${count}</span></button>`;
    });
  }
  function summaryBody() { return html`조회 <strong>${filtered().length}</strong>명`; }

  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r, i) => html`<span class="staff-no">${String(i + 1).padStart(2, "0")}</span>` },
    { label: "이름", width: "1fr", render: (r) => html`<div class="ellipsis"><span class="staff-name">${r.name}</span></div>` },
    { label: "부서", width: "1fr", render: (r) => html`<div class="ellipsis ${r.dept ? "" : "staff-dept--empty"}">${r.dept || "미지정"}</div>` },
    { label: "연락처", width: "150px", align: "center", render: (r) => html`<span class="staff-phone">${r.phone || "-"}</span>` },
    {
      label: "알림 수신", width: "120px", align: "center",
      render: (r) => html`<button class="toggle" role="switch" aria-checked="${r.notify ? "true" : "false"}" data-action="toggle-notify" data-id="${r.id}" aria-label="${r.name} 알림 수신 ${r.notify ? "켜짐" : "꺼짐"}"><span class="toggle__knob"></span></button>`,
    },
    {
      label: "관리", width: "120px", align: "center",
      render: (r) => html`<div class="admin-rowact">
        <button class="ptbl-edit" data-action="edit" data-id="${r.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>
        <button class="ptbl-del" data-action="del" data-id="${r.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>
      </div>`,
    },
  ];
  function tableBody() {
    const rows = filtered();
    if (!rows.length) return html`<div class="admin-empty">조건에 맞는 담당자가 없습니다.</div>`;
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
  }

  function render() {
    setHTML(root, html`
      <div class="page-admin page-staff">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-profile.png",
            title: "담당자 관련설정",
            action: html`<button class="btn btn-secondary" data-action="new">${icon("user-plus", { size: 14 })} 담당자 등록</button>`,
          })}
          <div class="orders-filters">
            <div class="orders-frow orders-frow--1">
              <div class="orders-fgroup">
                <span class="orders-flabel">알림 수신</span>
                <div class="orders-chips" data-slot="tabs">${tabsBody()}</div>
              </div>
            </div>
            <div class="orders-frow orders-frow--3">
              <div class="orders-search">
                <div class="orders-search__lbl">${icon("search", { size: 12, cls: "tint-muted" })}<span>담당자 검색</span></div>
                <input type="text" data-search value="${state.search}" placeholder="이름·부서·연락처 검색" />
              </div>
            </div>
          </div>
          <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
          <div data-slot="table">${tableBody()}</div>
        </div>
      </div>
    `);
  }
  const refreshList = () => {
    const tabs = qs(root, "[data-slot='tabs']");
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (tabs) setHTML(tabs, tabsBody());
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };

  /* ── 등록/수정 모달 ────────────────────────────────────── */
  function openStaffModal(staff) {
    closeModal();
    const isEdit = !!staff;
    const form = isEdit ? { ...staff } : { id: staffNewId(), name: "", dept: "", phone: "", notify: true };
    const isValid = () => !!form.name.trim() && !!form.phone.trim();
    const body = html`
      <div class="hm__head">
        <div>
          <h3>${isEdit ? "담당자 정보 수정" : "담당자 등록"}</h3>
          <p>${isEdit ? form.name : "새 담당자를 추가합니다"}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="hm-grid2">
          <div class="hm-field">
            <label>이름<span class="req">*</span></label>
            <input class="hm-input" data-f="name" value="${form.name}" placeholder="예) 김총무" />
          </div>
          <div class="hm-field">
            <label>연락처<span class="req">*</span></label>
            <input class="hm-input" data-f="phone" value="${form.phone}" inputmode="numeric" placeholder="010-0000-0000" />
          </div>
        </div>
        <div class="hm-field">
          <label>부서</label>
          <input class="hm-input" data-f="dept" value="${form.dept}" placeholder="예) 총무팀 (자유 입력)" />
        </div>
        <div class="hm-field staff-notifyrow">
          <div>
            <label>알림 수신</label>
            <p class="hm-help">API 주문 알림을 카카오 알림톡으로 발송합니다</p>
          </div>
          <button type="button" class="toggle" role="switch" aria-checked="${form.notify ? "true" : "false"}" data-action="modal-notify" aria-label="알림 수신"><span class="toggle__knob"></span></button>
        </div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save" ${isValid() ? "" : "disabled"}>${isEdit ? "저장" : "등록"}</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "", body, onClose: () => {} });
    const panel = activeModal.panel;
    const syncSave = () => { const b = qs(panel, "[data-action='save']"); if (b) b.disabled = !isValid(); };
    on(panel, "input", "[data-f]", (e, t) => {
      const k = t.dataset.f;
      form[k] = k === "phone" ? formatPhone(t) : t.value;
      syncSave();
    });
    on(panel, "click", "[data-action='modal-notify']", (e, t) => {
      form.notify = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(form.notify));
    });
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => {
      if (!isValid()) return;
      const rec = { ...form, name: form.name.trim(), dept: form.dept.trim(), phone: form.phone.trim() };
      if (isEdit) staffUpdate(rec); else staffAdd(rec);
      closeModal();
      refreshList();
      toast(isEdit ? "담당자 정보를 저장했습니다" : `${rec.name} 담당자를 등록했습니다`);
    });
  }

  function openDelete(staff) {
    closeModal();
    const body = html`
      <div class="hm__head">
        <div>
          <h3>${staff.name} 담당자를 삭제할까요?</h3>
          <p>${staff.dept || "부서 미지정"} · ${staff.phone || "-"}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="hm-warn"><b>삭제 후에는 되돌릴 수 없습니다.</b> 기존 주문에 이미 지정된 담당자 이름은 그대로 유지됩니다.</div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--danger" data-action="do-del">삭제</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--sm", body, onClose: () => {} });
    const panel = activeModal.panel;
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='do-del']", () => {
      staffRemove(staff.id);
      closeModal();
      refreshList();
      toast(`${staff.name} 담당자를 삭제했습니다`, "warn");
    });
  }

  render();

  /* ── 목록 이벤트 (위임 · root 유지) ────────────────────── */
  const findStaff = (id) => staffList().find((s) => s.id === id);
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; }
    if (a === "new") return openStaffModal(null);
    if (a === "toggle-notify") {
      const s = findStaff(t.dataset.id);
      if (!s) return;
      staffSetNotify(s.id, !s.notify);
      refreshList();
      toast(`${s.name} 알림 수신을 ${s.notify ? "켰습니다" : "껐습니다"}`);
      return;
    }
    const s = findStaff(t.dataset.id);
    if (!s) return;
    if (a === "edit") openStaffModal(s);
    else if (a === "del") openDelete(s);
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });

  return () => {
    offClick(); offSearch();
    closeModal();
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
  };
}
