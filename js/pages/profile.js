/* ============================================================
   profile.js — ports ProfileStorage.tsx (프로필/담당자 저장공간)
   CRUD writes to the store → persisted to localStorage.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal } from "../ui.js";

const MSG_RECEIVE = "모든 배송완료 마다에 메세지를 수신합니다";
const MSG_NONE = "메세지를 수신하지 않습니다.";

export function mount(root, { nav }) {
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  const editBtn = (kind, no) => html`<button class="ptbl-edit" data-action="edit" data-kind="${kind}" data-no="${no}" aria-label="수정">${icon("pencil", { size: 14 })}</button>`;
  const delBtn = (kind, no) => html`<button class="ptbl-del" data-action="del" data-kind="${kind}" data-no="${no}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>`;

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
    { label: "부서·직위", width: "110px", align: "center", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "160px", align: "center", render: (r) => r.phone },
    { label: "메세지 수신여부", width: "1fr", render: (r) => r.message },
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
                <div class="psec-title__l"><span class="psec-bar"></span><span class="psec-titletext">📋 프로필 저장공간</span></div>
                <button class="psec-addbtn" data-action="new-profile">${icon("user-plus", { size: 14 })} 신규 프로필 등록</button>
              </div>
              ${tableGrid({ columns: profileCols, rows: profiles, rowKey: (r) => r.no, compact: true })}
            </div>
            <div class="psec">
              <div class="psec-title">
                <div class="psec-title__l"><span class="psec-bar"></span><span class="psec-titletext">📋 담당자 저장공간</span></div>
                <button class="psec-addbtn" data-action="new-contact">${icon("user-plus", { size: 14 })} 신규 담당자 등록</button>
              </div>
              ${tableGrid({ columns: contactCols, rows: contacts, rowKey: (r) => r.no, compact: true })}
            </div>
          </div>
        </div>
      `
    );
  }

  // ── field helper (reuses .ofield) ──────────────────────
  function field({ label, key, value, placeholder, ic, required }) {
    return html`
      <div class="ofield">
        <label class="ofield__lbl" for="pf-${key}">${label}${required ? html`<span class="req">*</span>` : ""}</label>
        <div class="ofield__wrap">
          ${ic ? icon(ic, { size: 14, cls: "ofield__icon" }) : ""}
          <input class="ofield__input ${ic ? "has-icon" : ""}" id="pf-${key}" data-pf="${key}" type="text" value="${value}" placeholder="${placeholder}" />
        </div>
      </div>
    `;
  }
  const divider = (label) => html`<div class="pform-divider"><span>${label}</span><span class="pform-divider__line"></span></div>`;

  // ── New Profile ────────────────────────────────────────
  function openNewProfile() {
    closeModal();
    const profiles = store.get().profiles;
    const nextNo = String(profiles.length + 1).padStart(2, "0");
    const form = { no: nextNo, name: "", role: "", phone: "", greeting: "" };
    const auto = () => (form.name || form.role ? `올해의경조사 ${form.role} ${form.name}`.trim() : "");
    const valid = () => !!(form.name && form.role && form.phone);

    const body = () => html`
      <div class="pnew">
        <div class="pnew__head">
          <div class="pnew__head-icon">${icon("user-plus", { size: 18 })}</div>
          <div><h2>신규 프로필 등록</h2><p>화환 리본에 표시될 발신인 정보를 등록합니다.</p></div>
        </div>
        <div class="pnew__body">
          ${divider("발신인 정보")}
          <div class="cedit__grid2">
            ${field({ label: "성함", key: "name", value: form.name, placeholder: "예) 홍길동", ic: "user-check", required: true })}
            ${field({ label: "직위", key: "role", value: form.role, placeholder: "예) 대표이사", ic: "tag", required: true })}
          </div>
          ${divider("연락처")}
          ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone, placeholder: "예) 010-0000-0000", ic: "phone", required: true })}
          ${divider("리본 고정문구")}
          ${field({ label: "고정문구", key: "greeting", value: form.greeting, placeholder: auto() || "비워두면 직위+성함 형식으로 자동 생성됩니다.", ic: "file-text" })}
          <div class="pnew__preview" data-slot="preview">${greetingPreview(form, auto())}</div>
          <div class="pnew__info">${icon("info", { size: 13 })}<p>고정문구를 비워두면 <strong>직위 + 성함</strong> 형식으로 자동 생성됩니다.<br />리본 문구는 주문 시 수정이 가능합니다.</p></div>
        </div>
        <div class="pnew__foot">
          <span class="pnew__req"><span class="req">*</span> 필수 입력 항목</span>
          <div class="pnew__foot-btns">
            <button class="btn-cancel" data-action="close">취소</button>
            <button class="pnew__ok ${valid() ? "is-on" : ""}" data-action="add" ${valid() ? "" : "disabled"}>등록</button>
          </div>
        </div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--pnew", body: body(), onClose: () => {} });
    on(activeModal.panel, "input", "[data-pf]", (e, t) => {
      form[t.dataset.pf] = t.value;
      const pv = qs(activeModal.panel, "[data-slot='preview']");
      if (pv) setHTML(pv, greetingPreview(form, auto()));
      const ok = qs(activeModal.panel, "[data-action='add']");
      if (ok) { ok.disabled = !valid(); ok.classList.toggle("is-on", valid()); }
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
      ? html`<span class="pnew__preview-lbl">리본 문구 미리보기</span><p class="pnew__preview-val">${form.greeting.trim() || auto}</p>`
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
      <div class="pnew">
        <div class="pnew__head">
          <div class="pnew__head-icon">${icon("building2", { size: 18 })}</div>
          <div><h2>신규 담당자 등록</h2><p>배송 완료 알림을 수신할 담당자를 등록합니다.</p></div>
        </div>
        <div class="pnew__body">
          ${divider("담당자 정보")}
          <div class="cedit__grid2">
            ${field({ label: "성함", key: "name", value: form.name, placeholder: "예) 김담당", ic: "user-check", required: true })}
            ${field({ label: "부서·직위", key: "role", value: form.role, placeholder: "예) 재경부", ic: "building2", required: true })}
          </div>
          ${divider("연락처")}
          ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone, placeholder: "예) 010-0000-0000", ic: "phone", required: true })}
          ${divider("메세지 수신 설정")}
          <div class="ofield">
            <label class="ofield__lbl">메세지 수신여부<span class="req">*</span></label>
            <div class="cedit__grid2">
              ${[{ val: MSG_RECEIVE, title: "수신함", desc: "배송 완료 시 문자 알림" }, { val: MSG_NONE, title: "수신 안 함", desc: "알림 미수신" }].map(
                (opt) => html`<label class="pmsg ${form.message === opt.val ? "is-sel" : ""}">
                  <input type="radio" name="pmsg" value="${opt.val}" ${form.message === opt.val ? "checked" : ""} data-pmsg />
                  <div><p class="pmsg__t">${opt.title}</p><p class="pmsg__d">${opt.desc}</p></div>
                </label>`
              )}
            </div>
          </div>
          <div class="pmsg-status ${receiving() ? "on" : "off"}" data-slot="msgstatus">${msgStatus(form, receiving())}</div>
          <div class="pnew__info">${icon("info", { size: 13 })}<p>배송 완료 알림은 등록된 수신번호로 문자 메세지가 발송됩니다.<br />수신 설정은 언제든지 수정 가능합니다.</p></div>
        </div>
        <div class="pnew__foot">
          <span class="pnew__req"><span class="req">*</span> 필수 입력 항목</span>
          <div class="pnew__foot-btns">
            <button class="btn-cancel" data-action="close">취소</button>
            <button class="pnew__ok ${valid() ? "is-on" : ""}" data-action="add" ${valid() ? "" : "disabled"}>등록</button>
          </div>
        </div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--pnew", body: body(), onClose: () => {} });
    const re = () => activeModal.render(body());
    on(activeModal.panel, "input", "[data-pf]", (e, t) => {
      form[t.dataset.pf] = t.value;
      const st = qs(activeModal.panel, "[data-slot='msgstatus']");
      if (st) { setHTML(st, msgStatus(form, receiving())); st.className = `pmsg-status ${receiving() ? "on" : "off"}`; }
      const ok = qs(activeModal.panel, "[data-action='add']");
      if (ok) { ok.disabled = !valid(); ok.classList.toggle("is-on", valid()); }
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
  const msgStatus = (form, receiving) => html`${icon("message-square", { size: 13 })}<span>${form.name || "담당자"}님은 현재 <strong>${receiving ? "배송 완료 알림을 수신" : "알림을 수신하지 않음"}</strong>으로 설정됩니다.</span>`;

  // ── Edit (profile/contact) ─────────────────────────────
  function openEdit(kind, row) {
    closeModal();
    const form = { ...row };
    const isContact = kind === "contact";
    const body = html`
      <div class="pedit">
        <div class="cedit__grid2">
          ${field({ label: "성함", key: "name", value: form.name })}
          ${field({ label: isContact ? "부서·직위" : "직위", key: "role", value: form.role })}
        </div>
        ${field({ label: "배송완료 수신번호", key: "phone", value: form.phone })}
        ${isContact
          ? html`<div class="ofield">
              <label class="ofield__lbl">메세지 수신여부</label>
              <select class="select" data-pf="message">
                <option value="${MSG_RECEIVE}" ${form.message === MSG_RECEIVE ? "selected" : ""}>수신함</option>
                <option value="${MSG_NONE}" ${form.message === MSG_NONE ? "selected" : ""}>수신 안 함</option>
              </select>
            </div>`
          : field({ label: "고정문구", key: "greeting", value: form.greeting })}
        <div class="pedit__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="pedit__save" data-action="save">저장</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: isContact ? "담당자 수정" : "프로필 수정", body, panelClass: "modal-panel--pedit", onClose: () => {} });
    on(activeModal.panel, "input", "[data-pf]", (e, t) => { form[t.dataset.pf] = t.value; });
    on(activeModal.panel, "change", "[data-pf='message']", (e, t) => { form.message = t.value; });
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
    const body = html`
      <div class="pdel">
        <div class="pdel__msg">
          <p><strong>${row.name}</strong> 항목을 삭제하시겠습니까?</p>
          <p class="pdel__sub">삭제한 내용은 복구할 수 없습니다.</p>
        </div>
        <div class="pdel__foot">
          <button class="btn-cancel" data-action="close">취소</button>
          <button class="pdel__del" data-action="do-del">삭제</button>
        </div>
      </div>
    `;
    activeModal = simpleModal({ title: "삭제 확인", body, onClose: () => {} });
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
    const kind = t.dataset.kind;
    const list = kind === "contact" ? store.get().contacts : store.get().profiles;
    const row = list.find((x) => x.no === t.dataset.no);
    if (a === "edit" && row) openEdit(kind, row);
    else if (a === "del" && row) openDelete(kind, row);
  });

  return () => { off(); closeModal(); };
}
