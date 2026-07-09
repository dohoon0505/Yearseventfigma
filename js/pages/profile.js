/* ============================================================
   profile.js — ports ProfileStorage.tsx (프로필/담당자 저장공간)
   CRUD writes to the store → persisted to localStorage.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal, makeDropdown } from "../ui.js";

const MSG_RECEIVE = "모든 배송완료 마다에 메세지를 수신합니다";
const MSG_NONE = "메세지를 수신하지 않습니다.";

export function mount(root, { nav }) {
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  const editBtn = (kind, no) => html`<button class="ptbl-edit" data-action="edit" data-kind="${kind}" data-no="${no}" aria-label="수정">${icon("pencil", { size: 14 })}</button>`;
  const delBtn = (kind, no) => html`<button class="ptbl-del" data-action="del" data-kind="${kind}" data-no="${no}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>`;
  const billingCell = (r) =>
    r.isBilling
      ? html`<span class="pill pill--blue ptbl-billing">${icon("check-circle", { size: 12 })} 정산·회계 담당</span>`
      : html`<button class="ptbl-setbilling" data-action="set-billing" data-no="${r.no}">정산담당 지정</button>`;
  const billingSummary = () => {
    const b = store.getBillingContact();
    return b
      ? html`현재 <strong class="psec-billnote__on">${b.name} (${b.role}) · ${b.phone}</strong>`
      : html`<strong class="psec-billnote__off">미지정 — 담당자를 지정해 주세요</strong>`;
  };

  const profileCols = [
    { label: "순번", width: "54px", align: "center", render: (r) => r.no },
    { label: "성함", width: "80px", align: "center", render: (r) => r.name },
    { label: "직위", width: "100px", align: "center", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "160px", align: "center", render: (r) => r.phone },
    { label: "고정문구", width: "1fr", render: (r) => r.greeting },
    { label: "수정", width: "52px", align: "center", render: (r) => editBtn("profile", r.no) },
    { label: "삭제", width: "52px", align: "center", render: (r) => delBtn("profile", r.no) },
  ];
  const contactCols = [
    { label: "순번", width: "54px", align: "center", render: (r) => r.no },
    { label: "성함", width: "80px", align: "center", render: (r) => r.name },
    { label: "부서·직위", width: "104px", align: "center", render: (r) => r.role },
    { label: "연락처", width: "150px", align: "center", render: (r) => r.phone },
    { label: "메세지 수신여부", width: "1fr", render: (r) => r.message },
    { label: "정산·회계 담당", width: "150px", align: "center", render: (r) => billingCell(r) },
    { label: "수정", width: "52px", align: "center", render: (r) => editBtn("contact", r.no) },
    { label: "삭제", width: "52px", align: "center", render: (r) => delBtn("contact", r.no) },
  ];

  function render() {
    const { profiles, contacts } = store.get();
    setHTML(
      root,
      html`
        <div class="page-profile">
          ${pageTitle({ imgSrc: "./assets/nav-profile.png", title: "프로필 저장공간" })}
          <div class="profile-sections">
            <div class="psec">
              <div class="psec-title">
                <div class="psec-title__l"><span class="psec-bar"></span><span class="psec-titletext">📋 발송인 프로필관리</span></div>
                <button class="psec-addbtn" data-action="new-profile">${icon("user-plus", { size: 14 })} 신규 프로필 등록</button>
              </div>
              ${tableGrid({ columns: profileCols, rows: profiles, rowKey: (r) => r.no, compact: true })}
            </div>
            <div class="psec">
              <div class="psec-title">
                <div class="psec-title__l"><span class="psec-bar"></span><span class="psec-titletext">📋 담당자 저장공간</span></div>
                <button class="psec-addbtn" data-action="new-contact">${icon("user-plus", { size: 14 })} 신규 담당자 등록</button>
              </div>
              <div class="psec-billnote">${icon("info", { size: 13 })}<span>거래명세서 발급·입금요청 <strong>알림톡</strong>은 정산·회계 담당자에게 발송됩니다 (1명 지정). ${billingSummary()}</span></div>
              ${tableGrid({ columns: contactCols, rows: contacts, rowKey: (r) => r.no, compact: true })}
            </div>
          </div>
        </div>
      `
    );
  }

  // ── field helper (HModal hm-field) ─────────────────────
  function field({ label, key, value, placeholder, required }) {
    return html`
      <div class="hm-field">
        <label for="pf-${key}">${label}${required ? html`<span class="req">*</span>` : ""}</label>
        <input class="hm-input" id="pf-${key}" data-pf="${key}" type="text" value="${value}" placeholder="${placeholder}" />
      </div>
    `;
  }
  const divider = (label) => html`<div class="hm-section">${label}</div>`;

  // ── New Profile ────────────────────────────────────────
  function openNewProfile() {
    closeModal();
    const profiles = store.get().profiles;
    const nextNo = String(profiles.length + 1).padStart(2, "0");
    const form = { no: nextNo, name: "", role: "", phone: "", greeting: "" };
    const auto = () => (form.name || form.role ? `올해의경조사 ${form.role} ${form.name}`.trim() : "");
    const valid = () => !!(form.name && form.role && form.phone);

    const body = () => html`
      <div class="hm__head">
        <div><h3>신규 프로필 등록</h3><p>화환 리본에 표시될 발신인 정보를 등록합니다.</p></div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="hm-grid2">
          ${field({ label: "성함", key: "name", value: form.name, placeholder: "예) 홍길동", required: true })}
          ${field({ label: "직위", key: "role", value: form.role, placeholder: "예) 대표이사", required: true })}
        </div>
        ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone, placeholder: "예) 010-0000-0000", required: true })}
        ${field({ label: "리본 고정문구", key: "greeting", value: form.greeting, placeholder: auto() || "비워두면 직위+성함 형식으로 자동 생성됩니다." })}
        <div class="hm-preview" data-slot="preview">${greetingPreview(form, auto())}</div>
        <div class="hm-info"><span><b>고정문구를 비워두면</b> 직위 + 성함 형식으로 자동 생성됩니다. 리본 문구는 주문 시 수정이 가능합니다.</span></div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="add" ${valid() ? "" : "disabled"}>등록</button>
      </div>
    `;
    activeModal = openModal({ body: body(), onClose: () => {} });
    on(activeModal.panel, "input", "[data-pf]", (e, t) => {
      form[t.dataset.pf] = t.value;
      const pv = qs(activeModal.panel, "[data-slot='preview']");
      if (pv) setHTML(pv, greetingPreview(form, auto()));
      const ok = qs(activeModal.panel, "[data-action='add']");
      if (ok) ok.disabled = !valid();
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='add']", () => {
      if (!valid()) return;
      const greeting = form.greeting.trim() || auto();
      store.setProfiles((prev) => [...prev, { ...form, greeting }]);
      closeModal();
      render();
    });
  }
  const greetingPreview = (form, auto) =>
    form.greeting || auto
      ? html`<span class="hm-preview__lbl">리본 문구 미리보기</span><p class="hm-preview__val">${form.greeting.trim() || auto}</p>`
      : "";

  // ── New Contact ────────────────────────────────────────
  function openNewContact() {
    closeModal();
    const contacts = store.get().contacts;
    const nextNo = String(contacts.length + 1).padStart(2, "0");
    const form = { no: nextNo, name: "", role: "", phone: "", message: MSG_RECEIVE };
    const valid = () => !!(form.name && form.role && form.phone);
    const receiving = () => form.message === MSG_RECEIVE;

    const body = () => html`
      <div class="hm__head">
        <div><h3>신규 담당자 등록</h3><p>배송 완료 알림을 수신할 담당자를 등록합니다.</p></div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="hm-grid2">
          ${field({ label: "성함", key: "name", value: form.name, placeholder: "예) 김담당", required: true })}
          ${field({ label: "부서·직위", key: "role", value: form.role, placeholder: "예) 재경부", required: true })}
        </div>
        ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone, placeholder: "예) 010-0000-0000", required: true })}
        <div class="hm-section">메세지 수신 설정</div>
        <div class="hm-grid2">
          ${[{ val: MSG_RECEIVE, title: "수신함", desc: "배송 완료 시 문자 알림" }, { val: MSG_NONE, title: "수신 안 함", desc: "알림 미수신" }].map(
            (opt) => html`<label class="hm-radio ${form.message === opt.val ? "is-sel" : ""}">
              <input type="radio" name="pmsg" value="${opt.val}" ${form.message === opt.val ? "checked" : ""} data-pmsg />
              <div><p class="hm-radio__t">${opt.title}</p><p class="hm-radio__d">${opt.desc}</p></div>
            </label>`
          )}
        </div>
        <div class="hm-info" data-slot="msgstatus">${msgStatus(form, receiving())}</div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="add" ${valid() ? "" : "disabled"}>등록</button>
      </div>
    `;
    activeModal = openModal({ body: body(), onClose: () => {} });
    const re = () => activeModal.render(body());
    on(activeModal.panel, "input", "[data-pf]", (e, t) => {
      form[t.dataset.pf] = t.value;
      const st = qs(activeModal.panel, "[data-slot='msgstatus']");
      if (st) setHTML(st, msgStatus(form, receiving()));
      const ok = qs(activeModal.panel, "[data-action='add']");
      if (ok) ok.disabled = !valid();
    });
    on(activeModal.panel, "change", "[data-pmsg]", (e, t) => { form.message = t.value; re(); });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='add']", () => {
      if (!valid()) return;
      store.setContacts((prev) => [...prev, { ...form }]);
      closeModal();
      render();
    });
  }
  const msgStatus = (form, receiving) => html`<span><b>${form.name || "담당자"}님</b>은 현재 ${receiving ? "배송 완료 알림을 수신" : "알림을 수신하지 않음"}으로 설정됩니다.</span>`;

  // ── Edit (profile/contact) ─────────────────────────────
  function openEdit(kind, row) {
    closeModal();
    const form = { ...row };
    const isContact = kind === "contact";
    const body = html`
      <div class="hm-grid2">
        ${field({ label: "성함", key: "name", value: form.name })}
        ${field({ label: isContact ? "부서·직위" : "직위", key: "role", value: form.role })}
      </div>
      ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone })}
      ${isContact
        ? html`<div class="hm-field">
            <label>메세지 수신여부</label>
            <div class="dd" data-dd-msg>
              <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
              <div class="dd-panel" role="listbox"></div>
            </div>
          </div>`
        : field({ label: "고정문구", key: "greeting", value: form.greeting })}
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--primary" data-action="save">저장</button>
    `;
    let ddMsg = null;
    activeModal = simpleModal({ title: isContact ? "담당자 수정" : "프로필 수정", size: "sm", body, footer, onClose: () => { if (ddMsg) { ddMsg.destroy(); ddMsg = null; } } });
    if (isContact) {
      ddMsg = makeDropdown(qs(activeModal.panel, "[data-dd-msg]"), {
        options: () => [MSG_RECEIVE, MSG_NONE],
        get: () => form.message,
        set: (v) => { form.message = v; },
        label: (v) => (v === MSG_RECEIVE ? "수신함" : "수신 안 함"),
      });
    }
    on(activeModal.panel, "input", "[data-pf]", (e, t) => { form[t.dataset.pf] = t.value; });
    on(activeModal.panel, "click", "[data-action='save']", () => {
      if (isContact) store.setContacts((prev) => prev.map((c) => (c.no === form.no ? form : c)));
      else store.setProfiles((prev) => prev.map((p) => (p.no === form.no ? form : p)));
      closeModal();
      render();
    });
  }

  // ── Delete ─────────────────────────────────────────────
  function openDelete(kind, row) {
    closeModal();
    // 정산·회계 담당자는 무조건 1명 존재해야 하므로 바로 삭제 불가 (먼저 다른 담당자 지정)
    if (kind === "contact" && row.isBilling) {
      const body = html`
        <div class="hm-info"><span><b>${row.name}님은 정산·회계 담당자예요.</b> 정산·회계 담당자는 항상 1명이 지정되어 있어야 하니, 다른 담당자를 정산담당으로 먼저 지정한 뒤 삭제해 주세요.</span></div>
      `;
      const footer = html`<button class="hm-btn hm-btn--primary" data-action="close">확인</button>`;
      activeModal = simpleModal({ title: "삭제할 수 없어요", size: "sm", body, footer, onClose: () => {} });
      on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
      return;
    }
    const body = html`
      <div class="hm-warn"><span><b>삭제한 내용은 복구할 수 없습니다.</b></span></div>
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--danger" data-action="do-del">삭제</button>
    `;
    activeModal = simpleModal({ title: `${row.name} 항목을 삭제할까요?`, size: "sm", body, footer, onClose: () => {} });
    on(activeModal.panel, "click", "[data-action='do-del']", () => {
      if (kind === "contact") store.setContacts((prev) => prev.filter((c) => c.no !== row.no));
      else store.setProfiles((prev) => prev.filter((p) => p.no !== row.no));
      closeModal();
      render();
    });
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "new-profile") return openNewProfile();
    if (a === "new-contact") return openNewContact();
    if (a === "set-billing") { store.setBillingContact(t.dataset.no); render(); return; }
    const kind = t.dataset.kind;
    const list = kind === "contact" ? store.get().contacts : store.get().profiles;
    const row = list.find((x) => x.no === t.dataset.no);
    if (a === "edit" && row) openEdit(kind, row);
    else if (a === "del" && row) openDelete(kind, row);
  });

  return () => { off(); closeModal(); };
}
