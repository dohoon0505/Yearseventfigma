/* ============================================================
   admin-clients.js — 거래처 정보관리
   상단 필터(상태 탭 + 검색) · 가입 승인/거부 워크플로 · 상세/수정/생성/삭제.
   store.clients(영속). 모달은 HModal 규격(hm-field/hm-btn) + 커스텀 드롭다운.
   ============================================================ */
import { html, setHTML, on, qs, qsa, el } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal, makeDropdown } from "../ui.js";
import { INVOICE_DAYS } from "../data/admin-mock.js";
import { normalizeBiz, sharedBizKeys } from "../util/biz.js";

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
  { key: "bizNumber", label: "사업자번호", icon: "hash", grid: true, required: true, hint: true },
  { key: "ceoName", label: "대표자명", icon: "user", grid: true, required: true },
  { section: "담당자 정보" },
  { key: "managerName", label: "담당자명", icon: "user-check", grid: true, required: true },
  { key: "department", label: "부서·직위", icon: "building2", grid: true, hint: true },
  { key: "contact", label: "연락처", icon: "phone", grid: true, required: true },
  { key: "email", label: "계산서 이메일", icon: "mail", grid: true },
  { section: "기타" },
  { key: "address", label: "사업장주소", icon: "map-pin" },
  { key: "status", label: "상태", type: "select", options: STATUS_OPTS, grid: true },
  { key: "joinDate", label: "가입일", icon: "calendar-days", grid: true },
  /* 발급일은 모달 맨 아래 전폭 — .dd-panel 이 위로 열리므로(components.css) 하단일수록
     28개 목록이 잘리지 않고, 인접 grid 짝짓기(fieldsHtml)도 건드리지 않는다. */
  { section: "계산서 발급" },
  {
    key: "invoiceDay", label: "계산서 발급일", type: "select", options: INVOICE_DAYS,
    ddLabel: (v) => `매월 ${v}일`,
    help: "매월 지정일에 전월 귀속 거래명세서·계산서가 발급됩니다. 정산기한은 발급일이 속한 달의 말일입니다.",
  },
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
  // expanded: 펼쳐 둔 사업자번호(정규화) 집합. 재렌더로 DOM이 통째로 갈리므로
  // 접힘 상태는 반드시 state 에서 읽는다(클래스 토글 방식은 검색 한 글자에 초기화됨).
  const state = { tab: "all", search: "", expanded: new Set() };
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

  /** 자식 필드(담당자명·부서) 매칭 — 이 경우에만 그룹을 자동으로 펼친다. */
  const matchesChild = (c, q) => c.managerName.includes(q) || (c.department || "").includes(q);
  const matchesParent = (c, q) => c.companyName.includes(q) || c.bizNumber.includes(q);

  function filtered() {
    const q = state.search.trim();
    return store.get().clients.filter((c) => {
      if (state.tab !== "all" && c.status !== state.tab) return false;
      if (q && !(matchesParent(c, q) || matchesChild(c, q))) return false;
      return true;
    });
  }

  /* 표에 실제로 그릴 행 목록.
     같은 사업자번호를 2곳 이상이 쓰면 부모(그룹) + 자식(부서) 구조로 접는다.
     ─ 그룹 성립은 전체 목록 기준 → 필터로 1건만 남아도 '부서 N' 배지가 맥락을 준다.
     ─ 자식 필드에 검색이 걸리면 자동으로 펼친다(비매칭 형제는 filtered()에서 이미 탈락).
     ─ 부모 필드(회사명·사업자번호) 매칭은 형제 전원이 살아남으므로 펼치지 않는다.
       접힌 부모 한 줄이 더 정확한 요약이다. */
  function displayRows() {
    const q = state.search.trim();
    const shared = sharedBizKeys(store.get().clients);
    const rows = filtered();
    const out = [];
    const seen = new Set();
    let no = 0;

    rows.forEach((c) => {
      const key = normalizeBiz(c.bizNumber);
      if (!shared.has(key)) { out.push({ kind: "flat", key: c.id, client: c, no: String(++no).padStart(2, "0") }); return; }
      if (seen.has(key)) return;
      seen.add(key);
      const members = rows.filter((x) => normalizeBiz(x.bizNumber) === key);
      const total = store.get().clients.filter((x) => normalizeBiz(x.bizNumber) === key).length;
      const autoOpen = !!q && members.some((m) => matchesChild(m, q));
      const open = state.expanded.has(key) || autoOpen;
      const pno = String(++no).padStart(2, "0");
      out.push({ kind: "group", key, client: members[0], count: total, open, no: pno });
      if (open) members.forEach((m, i) => out.push({ kind: "child", key: m.id, client: m, no: `${pno}-${i + 1}` }));
    });
    return out;
  }

  const dash = html`<span class="cli-dash">—</span>`;
  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r) => r.no },
    {
      label: "회사명", width: "1fr",
      render: (r) => {
        const c = r.client;
        if (r.kind === "group") {
          return html`<button type="button" class="cli-grp" data-action="grp" data-k="${r.key}" aria-expanded="${r.open ? "true" : "false"}">
            <span class="cli-grp__chev"></span>
            <b class="ellipsis">${c.companyName}</b>
            <span class="cli-badge">부서 ${r.count}</span>
          </button>`;
        }
        if (r.kind === "child") return html`<div class="cli-child ellipsis">${c.department || "부서 미지정"}</div>`;
        return html`<div class="ellipsis">${c.companyName}</div>`;
      },
    },
    { label: "사업자번호", width: "128px", align: "center", render: (r) => (r.kind === "child" ? dash : r.client.bizNumber) },
    { label: "대표자명", width: "84px", align: "center", render: (r) => (r.kind === "child" ? dash : r.client.ceoName) },
    { label: "담당자", width: "84px", align: "center", render: (r) => (r.kind === "group" ? dash : r.client.managerName) },
    { label: "연락처", width: "136px", align: "center", render: (r) => (r.kind === "group" ? dash : r.client.contact) },
    { label: "상태", width: "92px", align: "center", render: (r) => (r.kind === "group" ? dash : statusPill(r.client.status)) },
    { label: "가입일", width: "108px", align: "center", render: (r) => (r.kind === "group" ? dash : r.client.joinDate) },
    {
      label: "관리", width: "148px", align: "center",
      render: (r) => {
        if (r.kind === "group") return dash; // 개별 관리는 자식 행에서
        const c = r.client;
        return c.status === "승인대기"
          ? html`<div class="admin-rowact">
              <button class="btn-approve" data-action="approve" data-id="${c.id}">승인</button>
              <button class="btn-reject" data-action="reject" data-id="${c.id}">거부</button>
            </div>`
          : html`<div class="admin-rowact">
              <button class="ptbl-edit" data-action="edit" data-id="${c.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>
              <button class="ptbl-del" data-action="del" data-id="${c.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>
            </div>`;
      },
    },
  ];

  function tableBody() {
    const rows = displayRows();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 거래처가 없습니다.</div>`;
    return tableGrid({
      columns, rows, compact: true,
      rowKey: (r) => (r.kind === "group" ? `g:${r.key}` : r.key),
      rowClass: (r) => (r.kind === "group" ? "is-group" : r.kind === "child" ? "is-child" : ""),
    });
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
      return html`<button class="bf-tab ${active ? "is-active" : ""}" data-action="tab" data-v="${t.value}">${t.label}<span class="bf-tab__cnt ${alert ? "bf-tab__cnt--alert" : ""}">${count}</span></button>`;
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
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs" data-slot="tabs">${tabsBody()}</div>
              </div>
              <div class="bf-row bf-row--main">
                <div class="bf-srch bf-srch--grow">
                  ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                  <span class="bf-srch__lbl">거래처</span>
                  <span class="bf-srch__dv"></span>
                  <input type="text" data-search value="${state.search}" placeholder="회사명·사업자번호·담당자·부서 검색" />
                </div>
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

  // ── create/edit modal (HModal 규격) ────────────────────
  function field(f, form, isEdit) {
    if (f.type === "select") {
      // 상태 선택은 공용 커스텀 드롭다운(makeDropdown)으로 — openClientModal에서 연결
      return html`
        <div class="hm-field">
          <label>${f.label}</label>
          <div class="dd" data-dd-cf="${f.key}">
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
          ${f.help ? html`<p class="hm-help">${f.help}</p>` : ""}
        </div>
      `;
    }
    // 접속 아이디는 수정 시 변경 불가 → 비활성 입력
    const locked = f.lockOnEdit && isEdit;
    return html`
      <div class="hm-field">
        <label for="cf-${f.key}">${f.label}${f.required ? html`<span class="req">*</span>` : ""}${f.hint ? html`<span class="req" data-reqmark="${f.key}" hidden>*</span>` : ""}</label>
        <input class="hm-input" id="cf-${f.key}" data-cf="${f.key}" type="text" value="${form[f.key] ?? ""}" placeholder="${f.placeholder ?? f.label}" ${locked ? "disabled" : ""} />
        ${f.hint ? html`<p class="hm-help" data-hint="${f.key}"></p>` : ""}
      </div>
    `;
  }

  function openClientModal(client) {
    closeModal();
    const isEdit = !!client;
    const form = client
      ? { ...client }
      : { id: nextId(store.get().clients), accountId: "", password: "", companyName: "", bizNumber: "", ceoName: "", managerName: "", department: "", contact: "", email: "", address: "", status: "활성", joinDate: todayStr(), invoiceDay: "1" };
    /* 사업자번호 중복은 "같은 법인의 부서 분리"라는 정상 시나리오다 — 저장을 막지 않는다.
       대신 부서를 비워두면 목록에서 두 레코드를 구분할 수 없으므로 그때만 부서를 필수로 올린다. */
    const dupes = () => store.get().clients.filter(
      (c) => c.id !== form.id && normalizeBiz(c.bizNumber) && normalizeBiz(c.bizNumber) === normalizeBiz(form.bizNumber)
    );
    const deptRequired = () => dupes().length > 0;
    const isValid = () =>
      REQUIRED.every((k) => String(form[k] ?? "").trim()) &&
      (!deptRequired() || !!String(form.department ?? "").trim());

    const fieldsHtml = () => {
      const out = [];
      let i = 0;
      while (i < FIELDS.length) {
        const f = FIELDS[i];
        if (f.section) { out.push(html`<div class="hm-section">${f.section}</div>`); i++; continue; }
        if (f.grid && FIELDS[i + 1] && FIELDS[i + 1].grid) {
          out.push(html`<div class="hm-grid2">${field(f, form, isEdit)}${field(FIELDS[i + 1], form, isEdit)}</div>`);
          i += 2;
        } else { out.push(field(f, form, isEdit)); i++; }
      }
      return out;
    };

    const rejectNote = isEdit && form.status === "반려" && form.rejectReason
      ? html`<div class="hm-warn" style="margin-bottom:16px;"><span><b>거부 사유:</b> ${form.rejectReason}</span></div>`
      : "";
    const body = html`
      <div class="hm__head">
        <div>
          <h3>${isEdit ? "거래처 정보 수정" : "신규 거래처 등록"}</h3>
          <p>${isEdit ? "거래처 계정·회사·담당자 정보를 수정합니다." : "신규 거래처 계정과 정보를 등록합니다."}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">${rejectNote}${fieldsHtml()}</div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save" ${isValid() ? "" : "disabled"}>${isEdit ? "저장" : "등록"}</button>
      </div>
    `;
    const ddCfs = [];
    activeModal = openModal({ panelClass: "modal-panel--lg", body, onClose: () => { ddCfs.forEach((d) => d.destroy()); } });
    const saveBtn = () => qs(activeModal.panel, "[data-action='save']");
    const syncSave = () => { const b = saveBtn(); if (b) b.disabled = !isValid(); };

    /* select 필드(상태)는 공용 커스텀 드롭다운으로 (모달 닫힐 때 destroy) */
    qsa(activeModal.panel, "[data-dd-cf]").forEach((elc) => {
      const key = elc.dataset.ddCf;
      const f = FIELDS.find((x) => x.key === key);
      ddCfs.push(makeDropdown(elc, {
        options: () => f.options,
        label: f.ddLabel, // 값 ≠ 표시 (예: "20" → "매월 20일"). 미전달 시 값 그대로.
        get: () => form[key],
        set: (v) => { form[key] = v; syncSave(); },
      }));
    });

    /* 사업자번호 중복 안내 + 부서 필수 전환 — 텍스트만 갱신하므로 입력 포커스에 무해. */
    const hintEl = (k) => qs(activeModal.panel, `[data-hint='${k}']`);
    const reqEl = (k) => qs(activeModal.panel, `[data-reqmark='${k}']`);
    function syncBizDup() {
      const d = dupes();
      const names = d.map((x) => x.department || "부서 미지정").join(", ");
      const hb = hintEl("bizNumber");
      if (hb) hb.textContent = d.length ? `이미 등록된 사업자번호입니다 · ${d[0].companyName}(${names}) — 부서를 입력하면 부서별로 분리 관리됩니다.` : "";
      const rm = reqEl("department");
      if (rm) rm.hidden = !d.length;
      const hd = hintEl("department");
      if (hd) hd.textContent = d.length ? "동일 사업자번호가 있어 부서 입력이 필요합니다." : "";
    }
    syncBizDup(); // 수정 진입 시에도 현재 상태를 반영

    on(activeModal.panel, "input", "[data-cf]", (e, t) => {
      form[t.dataset.cf] = t.value;
      if (t.dataset.cf === "bizNumber") syncBizDup();
      syncSave();
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='save']", () => {
      if (!isValid()) return;
      if (isEdit) store.updateClient({ ...form });
      else store.addClient({ ...form });
      const b = saveBtn();
      if (b) {
        b.disabled = true;
        b.className = "hm-btn hm-btn--ok";
        setHTML(b, html`${icon("check", { size: 15 })} ${isEdit ? "저장 완료!" : "등록 완료!"}`);
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
      <div class="hm-warn"><span><b>${client.companyName}</b> 거래처의 가입을 거부합니다. 입력한 사유는 담당자에게 통보됩니다.</span></div>
      <div class="hm-field" style="margin-top:16px;">
        <label for="reject-reason">거부 사유<span class="req">*</span></label>
        <textarea class="hm-input hm-textarea" id="reject-reason" data-reason rows="3" placeholder="거부 사유를 입력하세요."></textarea>
      </div>
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--danger" data-action="do-reject" disabled>거부 처리</button>
    `;
    activeModal = simpleModal({ title: "가입 거부", subtitle: client.companyName, size: "sm", body, footer, onClose: () => {} });
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
    const body = html`<div class="hm-warn"><span><b>삭제한 거래처는 되돌릴 수 없습니다.</b> 계정(아이디·비밀번호)·정산·주문 정보가 모두 삭제됩니다.</span></div>`;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--danger" data-action="do-del">삭제</button>
    `;
    activeModal = simpleModal({ title: `${client.companyName} 거래처를 삭제할까요?`, subtitle: client.accountId, size: "sm", body, footer, onClose: () => {} });
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
    // 그룹 토글은 data-id 가 없으므로 findClient 앞에서 처리해야 한다(뒤면 조용히 무시됨).
    if (a === "grp") {
      const k = t.dataset.k;
      if (state.expanded.has(k)) state.expanded.delete(k); else state.expanded.add(k);
      refreshList();
      return;
    }
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
