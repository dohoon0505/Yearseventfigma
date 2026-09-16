/* ============================================================
   admin-contacts.js — 거래처 담당자 관리

   거래처별 담당자(`store.contactsByClient`)를 관리자가 보고 고치는 화면.
   **거래처 포털의 '담당자 저장공간'(#/app/profile)과 같은 레코드**다 —
   한쪽에서 고치면 다른 쪽에도 그대로 보인다.

   왜 별도 화면인가 —
   시안('거래처 정보 수정 모달 리모델링')은 담당자 리스트를 모달에서 덜어내고
   좌측 레일에 '정산·회계 담당자' 읽기 카드만 남긴다. 모달이 본업(거래처 원장)에
   집중하는 것은 맞지만, 관리자가 담당자를 **고칠 곳이 아예 없어지면** 안 된다:
   구 시스템에 담당자 필드가 없어 이관 거래처 19곳 중 18곳이 담당자 0명이고,
   담당자는 주문 요청자·배송완료 알림 수신자·정산 명세서 수신자의 출처다.
   그래서 모달에서는 빼고 이 화면으로 옮겼다.

   껍데기는 기업별 상품단가와 **같은 `.cpick-*`** 다 — 두 화면 다 "거래처를 고르고
   그 거래처의 무언가를 고친다"는 같은 일을 한다. 고르는 방법이 화면마다 다르면
   매번 다시 배워야 한다.

   ⚠️ 불변식 두 가지는 포털과 **반드시** 같아야 한다(다르면 버그로 읽힌다):
   · 담당자가 1명 이상이면 정산·회계 담당은 **정확히 1명**
   · **정산담당은 직접 삭제할 수 없다** — 다른 사람을 먼저 지정해야 한다
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE, newContactId } from "../store.js";
import { pageTitle, tableGrid } from "../ui.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { onPhoneInput } from "../util/phone.js";

export function mount(root) {
  const toast = makeToast();
  const state = { clientId: "", q: "" };

  const clients = () => store.get().clients;
  const rowsOf = (id) => (id ? store.contactsOf(id) : []);
  const clientOf = (id) => clients().find((c) => c.id === id) || null;

  /* 목록은 상태와 무관하게 전부 보여 준다 — 정지·반려 거래처도 담당자 정보는
     남아 있어야 하고, 되살릴 때 그대로 쓴다(주문 등록 화면과 판단이 다르다). */
  function sideRows() {
    const q = state.q.trim().toLowerCase();
    const shared = sharedBizKeys(clients());
    return clients().filter((c) => !q
      || [displayName(c, shared), c.accountId, c.bizNumber, c.department]
        .some((v) => String(v || "").toLowerCase().includes(q)));
  }

  const sideBody = () => {
    const rows = sideRows();
    if (!rows.length) return html`<p class="cpick-side__empty">'${state.q}' 로 찾은 거래처가 없습니다.</p>`;
    const shared = sharedBizKeys(clients());
    return html`${rows.map((c) => {
      const n = rowsOf(c.id).length;
      return html`<button type="button" class="cpick-cli ${state.clientId === c.id ? "is-on" : ""}"
        data-pick="${c.id}" aria-pressed="${state.clientId === c.id ? "true" : "false"}">
        <span class="cpick-cli__nm">${displayName(c, shared)}</span>
        <span class="cpick-cli__cnt ${n ? "is-on" : ""}">${n ? n : "–"}</span>
      </button>`;
    })}`;
  };

  /* ── 담당자 표 ── */
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
      label: "정산담당", width: "128px", align: "center",
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

  const mainBody = () => {
    const c = clientOf(state.clientId);
    if (!c) {
      return html`<p class="ctc-empty">왼쪽에서 거래처를 고르면 그 거래처의 담당자 명단이 열립니다.</p>`;
    }
    const rows = rowsOf(c.id);
    if (!rows.length) {
      return html`<p class="ctc-empty">등록된 담당자가 없습니다. 아래에서 추가하세요 —
        <b>첫 담당자가 정산·회계 담당이 됩니다.</b></p>`;
    }
    return tableGrid({ columns: cols, rows, rowKey: (r) => r.id, compact: true });
  };

  const capBody = () => {
    const c = clientOf(state.clientId);
    if (!c) return "";
    const rows = rowsOf(c.id);
    const on = rows.filter((r) => r.message === MSG_RECEIVE).length;
    return html`담당자 <strong>${rows.length}</strong>명 · 알림톡 수신 <strong>${on}</strong>명`;
  };

  function render() {
    const shared = sharedBizKeys(clients());
    const c = clientOf(state.clientId);
    setHTML(root, html`
      <div class="page-admin page-contacts">
        <div class="admin-inner">
          ${pageTitle({ imgSrc: "./assets/nav-profile.png", title: "거래처 담당자 관리" })}
          <div class="cpick-shell">
            <aside class="cpick-side">
              <div class="cpick-side__srch">
                ${icon("search", { size: 13, cls: "cpick-side__ic" })}
                <input type="text" data-ctl="q" value="${state.q}" placeholder="거래처·아이디·사업자번호" aria-label="거래처 검색" />
              </div>
              <div class="cpick-side__list" data-slot="side">${sideBody()}</div>
            </aside>
            <section class="cpick-main">
              <header class="cpick-hd">
                <div class="cpick-hd__l">
                  <b class="cpick-hd__co" data-slot="co">${c ? displayName(c, shared) : "거래처를 선택하세요"}</b>
                  <span class="cpick-hd__cap" data-slot="cap">${capBody()}</span>
                </div>
                <button type="button" class="cpick-minibtn" data-action="add" ${c ? "" : "disabled"}>
                  ${icon("user-plus", { size: 14 })} 담당자 추가</button>
              </header>
              <div class="ctc-body" data-slot="main">${mainBody()}</div>
            </section>
          </div>
          <p class="ctc-foot">${icon("info", { size: 13, cls: "tint-blue" })}
            거래처 포털의 '담당자 저장공간'과 <b>같은 명단</b>입니다 — 여기서 고치면 거래처 화면에도 그대로 보입니다.
            알림톡 수신이 켜진 담당자는 모든 주문의 배송완료 알림 대상이 됩니다.</p>
        </div>
      </div>`);
  }

  const slot = (n) => qs(root, `[data-slot='${n}']`);
  const renderSide = () => { const e = slot("side"); if (e) setHTML(e, sideBody()); };
  const renderMain = () => { const e = slot("main"); if (e) setHTML(e, mainBody()); };
  const renderCap = () => {
    const shared = sharedBizKeys(clients());
    const c = clientOf(state.clientId);
    const co = slot("co");
    if (co) setHTML(co, c ? displayName(c, shared) : "거래처를 선택하세요");
    const cap = slot("cap");
    if (cap) setHTML(cap, capBody());
    const add = qs(root, "[data-action='add']");
    if (add) add.disabled = !c;
  };

  render();

  /* 입력은 write-through 만 — 표를 다시 그리면 커서가 날아간다.
     구조가 바뀌는 동작(추가·삭제·정산담당)만 다시 그린다. */
  const patch = (id, p) =>
    store.setContactsOf(state.clientId, (prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const offQ = on(root, "input", "[data-ctl='q']", (e, t) => { state.q = t.value; renderSide(); });

  const offPick = on(root, "click", "[data-pick]", (e, t) => {
    if (state.clientId === t.dataset.pick) return; /* 같은 거래처 재클릭은 no-op */
    state.clientId = t.dataset.pick;
    renderSide(); renderMain(); renderCap();
  });

  const offAdd = on(root, "click", "[data-action='add']", () => {
    if (!state.clientId) return;
    const empty = rowsOf(state.clientId).length === 0;
    store.setContactsOf(state.clientId, (prev) => [...prev, {
      id: newContactId(), name: "", role: "", phone: "", message: MSG_RECEIVE, isBilling: empty,
    }]);
    renderMain(); renderCap(); renderSide();
    const last = qsa(root, "[data-mc='name']").pop();
    if (last) last.focus();
  });

  const offIn = on(root, "input", "[data-mc]", (e, t) => {
    const k = t.dataset.mc;
    patch(t.dataset.id, { [k]: k === "phone" ? onPhoneInput(t) : t.value });
  });

  const offMsg = on(root, "click", "[data-mc-msg]", (e, t) => {
    const id = t.dataset.mcMsg;
    const cur = rowsOf(state.clientId).find((c) => c.id === id);
    const next = cur && cur.message === MSG_RECEIVE ? MSG_NONE : MSG_RECEIVE;
    patch(id, { message: next });
    t.setAttribute("aria-checked", next === MSG_RECEIVE ? "true" : "false");
    renderCap();
  });

  const offBill = on(root, "click", "[data-mc-bill]", (e, t) => {
    store.setBillingContactOf(state.clientId, t.dataset.mcBill);
    const c = rowsOf(state.clientId).find((x) => x.id === t.dataset.mcBill);
    renderMain();
    toast(`정산·회계 담당자를 ${c && c.name ? c.name : "선택한 담당자"}(으)로 변경했습니다`, "ok");
  });

  const offDel = on(root, "click", "[data-mc-del]", (e, t) => {
    const id = t.dataset.mcDel;
    const c = rowsOf(state.clientId).find((x) => x.id === id);
    store.setContactsOf(state.clientId, (prev) => prev.filter((x) => x.id !== id));
    renderMain(); renderCap(); renderSide();
    toast(`${c && c.name ? c.name + " " : ""}담당자를 삭제했습니다`, "warn");
  });

  return () => {
    offQ(); offPick(); offAdd(); offIn(); offMsg(); offBill(); offDel();
    toast.destroy();
  };
}
