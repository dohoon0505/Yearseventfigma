/* ============================================================
   contacts-modal.js — 거래처 담당자 관리 다이얼로그

   거래처 목록(`#/admin`)의 '관리' 열 사람 아이콘과, 거래처 정보 수정 모달
   좌측 레일의 '정산·회계 담당자' 카드에서 연다.

   **거래처 포털의 '담당자 저장공간'(#/app/profile)과 같은 레코드**(`store.contactsByClient`)를
   고친다 — 한쪽에서 바꾸면 다른 쪽에도 그대로 보인다.

   왜 별도 다이얼로그인가 —
   시안('거래처 정보 수정 모달 리모델링')은 담당자 리스트를 모달 원장에서 덜어냈다.
   원장이 2×2 로 정리되려면 다섯 번째 블록이 들어설 자리가 없고, 담당자는 편집 규칙
   (정산담당 1명 불변식·삭제 잠금)이 따로 산다. 그렇다고 관리자가 담당자를 고칠 경로를
   없애면 안 된다 — 구 시스템에 담당자 필드가 없어 이관 거래처 19곳 중 **18곳이
   담당자 0명**이고, 담당자는 주문 요청자·배송완료 알림 수신자·정산 명세서 수신자의
   출처다. 그래서 원장에서 빼고 이 다이얼로그로 옮겼다.

   ⚠️ 불변식 두 가지는 포털과 **반드시** 같아야 한다(다르면 버그로 읽힌다):
   · 담당자가 1명 이상이면 정산·회계 담당은 **정확히 1명**
   · **정산담당은 직접 삭제할 수 없다** — 다른 사람을 먼저 지정해야 한다

   ⚠️ 이 다이얼로그는 거래처 모달 **위에 스택**될 수 있다. 핸들을 호출부의 단일
      `activeModal` 슬롯에 담지 말 것 — 담으면 아래 모달의 핸들이 사라져 X·취소가 죽는다.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE, newContactId } from "../store.js";
import { openModal, tableGrid } from "../ui.js";
import { onPhoneInput } from "./phone.js";

/**
 * @param {object} o
 *  - client    { id, companyName, … }
 *  - toast
 *  - onChange()  명단이 바뀔 때마다 호출 — 호출부가 목록·레일을 다시 그린다
 */
export function openContactsModal(o) {
  const cid = o.client.id;
  const rows = () => store.contactsOf(cid);
  const toast = o.toast || (() => {});
  const changed = () => { o.onChange && o.onChange(); };

  const cols = [
    { label: "이름", width: "1fr", render: (r) => html`<input class="ord-in" data-mc="name" data-id="${r.id}" value="${r.name ?? ""}" placeholder="성함" />` },
    { label: "부서·직위", width: "1fr", render: (r) => html`<input class="ord-in" data-mc="role" data-id="${r.id}" value="${r.role ?? ""}" placeholder="예) 총무팀 과장" />` },
    { label: "연락처", width: "150px", render: (r) => html`<input class="ord-in ord-in--num" data-mc="phone" data-id="${r.id}" value="${r.phone ?? ""}" placeholder="010-0000-0000" />` },
    {
      label: "알림톡 수신", width: "104px", align: "center",
      render: (r) => html`<button type="button" class="toggle" role="switch" data-mc-msg="${r.id}"
        aria-checked="${r.message === MSG_RECEIVE ? "true" : "false"}"
        aria-label="${r.name || "담당자"} 배송완료 알림톡 수신"><span class="toggle__knob"></span></button>`,
    },
    {
      label: "정산담당", width: "120px", align: "center",
      render: (r) => (r.isBilling
        ? html`<span class="pill pill--blue ptbl-billing">${icon("check-circle", { size: 12 })} 정산담당</span>`
        : html`<button class="ptbl-setbilling" data-mc-bill="${r.id}">지정</button>`),
    },
    {
      label: "삭제", width: "56px", align: "center",
      render: (r) => (r.isBilling
        ? html`<span class="ptbl-lock" title="정산담당은 바로 삭제할 수 없습니다 — 다른 담당자를 먼저 지정하세요">${icon("trash2", { size: 14 })}</span>`
        : html`<button class="ptbl-del" data-mc-del="${r.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>`),
    },
  ];

  const capText = () => {
    const list = rows();
    if (!list.length) return "등록된 담당자 없음";
    return `담당자 ${list.length}명 · 알림톡 수신 ${list.filter((c) => c.message === MSG_RECEIVE).length}명`;
  };

  const listBody = () => {
    const list = rows();
    if (!list.length) {
      return html`<p class="ctc-empty">등록된 담당자가 없습니다. 아래에서 추가하세요 —
        <b>첫 담당자가 정산·회계 담당이 됩니다.</b></p>`;
    }
    return tableGrid({ columns: cols, rows: list, rowKey: (r) => r.id, compact: true });
  };

  const m = openModal({
    panelClass: "modal-panel--ctc",
    labelledBy: "modal-title",
    body: html`
      <div class="hm__head">
        <div>
          <h3 id="modal-title">${o.client.companyName} 담당자</h3>
          <p data-slot="cap">${capText()}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="ctc-list" data-slot="list">${listBody()}</div>
        <div class="ctc-foot">
          <button type="button" class="cli-minibtn" data-action="add">${icon("user-plus", { size: 14 })} 담당자 추가</button>
          <span class="ctc-note">거래처 포털의 '담당자 저장공간'과 <b>같은 명단</b>입니다 —
            여기서 고치면 거래처 화면에도 그대로 보입니다. 알림톡 수신이 켜진 담당자는
            모든 주문의 배송완료 알림 대상이 됩니다.</span>
        </div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--primary" data-action="close">닫기</button>
      </div>`,
  });

  /* 입력은 write-through 만 — 표를 다시 그리면 커서가 날아간다.
     구조가 바뀌는 동작(추가·삭제·정산담당)만 다시 그린다. */
  const renderList = () => { const e = qs(m.panel, "[data-slot='list']"); if (e) setHTML(e, listBody()); };
  const renderCap = () => { const e = qs(m.panel, "[data-slot='cap']"); if (e) e.textContent = capText(); };
  const patch = (id, p) =>
    store.setContactsOf(cid, (prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  on(m.panel, "click", "[data-action='close']", () => m.close());

  on(m.panel, "click", "[data-action='add']", () => {
    const empty = rows().length === 0;
    store.setContactsOf(cid, (prev) => [...prev, {
      id: newContactId(), name: "", role: "", phone: "", message: MSG_RECEIVE, isBilling: empty,
    }]);
    renderList(); renderCap(); changed();
    const last = qsa(m.panel, "[data-mc='name']").pop();
    if (last) last.focus();
  });

  on(m.panel, "input", "[data-mc]", (e, t) => {
    const k = t.dataset.mc;
    patch(t.dataset.id, { [k]: k === "phone" ? onPhoneInput(t) : t.value });
    renderCap(); changed();
  });

  on(m.panel, "click", "[data-mc-msg]", (e, t) => {
    const id = t.dataset.mcMsg;
    const cur = rows().find((c) => c.id === id);
    const next = cur && cur.message === MSG_RECEIVE ? MSG_NONE : MSG_RECEIVE;
    patch(id, { message: next });
    t.setAttribute("aria-checked", next === MSG_RECEIVE ? "true" : "false");
    renderCap(); changed();
  });

  on(m.panel, "click", "[data-mc-bill]", (e, t) => {
    store.setBillingContactOf(cid, t.dataset.mcBill);
    const c = rows().find((x) => x.id === t.dataset.mcBill);
    renderList(); changed();
    toast(`정산·회계 담당자를 ${c && c.name ? c.name : "선택한 담당자"}(으)로 변경했습니다`, "ok");
  });

  on(m.panel, "click", "[data-mc-del]", (e, t) => {
    const id = t.dataset.mcDel;
    const c = rows().find((x) => x.id === id);
    store.setContactsOf(cid, (prev) => prev.filter((x) => x.id !== id));
    renderList(); renderCap(); changed();
    toast(`${c && c.name ? c.name + " " : ""}담당자를 삭제했습니다`, "warn");
  });

  return m;
}
