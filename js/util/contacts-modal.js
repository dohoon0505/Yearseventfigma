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
import { tableGrid } from "../ui.js";
import { openDialog } from "./dialog.js";
import { onPhoneInput } from "./phone.js";

/**
 * @param {object} o
 *  - client    { id, companyName, … }
 *  - toast
 *  - onChange()  명단이 바뀔 때마다 호출 — 호출부가 목록·레일을 다시 그린다
 *  - onClose()   (선택) 닫힌 뒤 호출 — openModal 이 연 자리로 포커스를 돌려준 **다음**이다. onChange 가 연 버튼을 다시 그렸으면
 *                그 버튼은 DOM 에서 떨어져 포커스가 body 로 빠지므로, 호출부가 새 버튼으로 옮긴다(거래처 창 '담당자 관리')
 */
export function openContactsModal(o) {
  const cid = o.client.id;
  const rows = () => store.contactsOf(cid);
  const toast = o.toast || (() => {});
  const changed = () => { o.onChange && o.onChange(); };

  /* 줄 버튼의 이름은 **그 줄의 사람**을 부른다. 삭제·지정 뒤 초점이 다른 줄의 같은 버튼으로 옮겨 가므로(아래 focusCol)
     '삭제' 만으로는 화면낭독기가 누구를 지우는 버튼인지 말하지 못한다 — 확인 창 없이 바로 지우는 버튼이다.
     이름 칸을 고치면 그 줄의 이름 셋만 손본다(행을 다시 그리면 커서가 날아간다 — 아래 input 위임). */
  const who = (name) => String(name || "").trim() || "담당자";
  const msgLabel = (name) => `${who(name)} 배송완료 알림톡 수신`;
  const billLabel = (name) => `${who(name)} 정산담당 지정`;
  const delLabel = (name) => `${who(name)} 삭제`;

  /* 열 폭은 시안 값 — 연락처 184px 는 '010-0000-0000' 이 잘리지 않는 최소치다
     (150px 이던 시절 실제로 잘렸다). 이름·부서는 남는 폭을 1 : 1.2 로 나눈다. */
  const cols = [
    { label: "이름", width: "minmax(120px, 1fr)", render: (r) => html`<input class="ord-in" data-mc="name" data-id="${r.id}" value="${r.name ?? ""}" placeholder="성함" />` },
    { label: "부서 · 직위", width: "minmax(140px, 1.2fr)", render: (r) => html`<input class="ord-in" data-mc="role" data-id="${r.id}" value="${r.role ?? ""}" placeholder="예) 총무팀 과장" />` },
    { label: "연락처", width: "184px", render: (r) => html`<input class="ord-in ord-in--num" data-mc="phone" data-id="${r.id}" value="${r.phone ?? ""}" placeholder="010-0000-0000" inputmode="numeric" />` },
    {
      label: "알림톡", width: "84px", align: "center",
      /* ⚠️ 연락처가 비면 켤 수 없다 — 보낼 곳이 없는 수신자를 명단에 넣으면
         발송 시점에 조용히 빠진다. 여기서 막고 그 이유를 title 로 말한다. */
      render: (r) => {
        const noPhone = !String(r.phone || "").trim();
        const on = r.message === MSG_RECEIVE && !noPhone;
        return html`<button type="button" class="toggle" role="switch" data-mc-msg="${r.id}"
          aria-checked="${on ? "true" : "false"}" ${noPhone ? "disabled" : ""}
          title="${noPhone ? "연락처를 먼저 입력하세요" : "배송완료 알림톡 수신"}"
          aria-label="${msgLabel(r.name)}"><span class="toggle__knob"></span></button>`;
      },
    },
    {
      label: "정산 · 회계", width: "124px", align: "center",
      render: (r) => (r.isBilling
        ? html`<span class="pill pill--blue tbl-billing">${icon("check-circle", { size: 12 })} 정산담당</span>`
        : html`<button class="tbl-setbilling" data-mc-bill="${r.id}" aria-label="${billLabel(r.name)}">지정</button>`),
    },
    {
      label: "삭제", width: "44px", align: "center",
      render: (r) => (r.isBilling
        ? html`<span class="tbl-lock" title="정산담당은 바로 삭제할 수 없습니다 — 다른 담당자를 먼저 지정하세요">${icon("trash2", { size: 14 })}</span>`
        : html`<button class="tbl-del" data-mc-del="${r.id}" aria-label="${delLabel(r.name)}">${icon("trash2", { size: 14 })}</button>`),
    },
  ];

  /* 머릿수는 헤더 pill 이 말한다 — 0명인 거래처가 목록에서 보이지 않으면
     아무도 채우지 않는다(이관 19곳 중 18곳이 0명이다). */
  const capBody = () => {
    const list = rows();
    if (!list.length) return html`<b>담당자 0명</b>`;
    const noti = list.filter((c) => c.message === MSG_RECEIVE && String(c.phone || "").trim()).length;
    return html`<b>담당자 ${list.length}명</b> · 알림톡 ${noti}명`;
  };

  const listBody = () => {
    const list = rows();
    if (!list.length) {
      return html`<p class="ctc-empty">등록된 담당자가 없습니다. 아래에서 추가하세요 —
        <b>첫 담당자가 정산·회계 담당이 됩니다.</b></p>`;
    }
    return tableGrid({
      columns: cols, rows: list, rowKey: (r) => r.id, compact: true,
      rowClass: (r) => (r.isBilling ? "is-bill" : ""),
    });
  };

  const m = openDialog({
    width: 960,
    eyebrow: "거래처 정보관리",
    title: `${o.client.companyName} 담당자`,
    headExtra: html`<span class="dlg-hd__count" data-slot="cap">${capBody()}</span>`,
    body: html`
      <div class="ctc-list" data-slot="list">${listBody()}</div>
      <div class="ctc-foot">
        <button type="button" class="ctc-add" data-action="add">${icon("user-plus", { size: 15 })} 담당자 추가</button>
        <span class="ctc-note">거래처 포털의 '담당자 저장공간'과 <b>같은 명단</b>입니다 —
          여기서 고치면 거래처 화면에도 그대로 보입니다. 알림톡 수신이 켜진 담당자는
          모든 주문의 배송완료 알림 대상이 됩니다.</span>
      </div>`,
    hint: "변경 사항은 입력과 동시에 저장됩니다",
    actions: html`<button class="hm-btn hm-btn--primary" data-action="close">닫기</button>`,
    onClose: o.onClose,
  });

  /* 입력은 write-through 만 — 표를 다시 그리면 커서가 날아간다.
     구조가 바뀌는 동작(추가·삭제·정산담당)만 다시 그린다. */
  const renderList = () => { const e = qs(m.panel, "[data-slot='list']"); if (e) setHTML(e, listBody()); };
  const renderCap = () => { const e = qs(m.panel, "[data-slot='cap']"); if (e) setHTML(e, capBody()); };
  const patch = (id, p) =>
    store.setContactsOf(cid, (prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /* ── 다시 그린 뒤 초점 ─────────────────────────────────────
     삭제·정산담당 지정은 표를 다시 그린다 — 누른 버튼이 DOM 에서 떨어져 초점이 body 로 빠졌다(실측: 다음 Tab 이 창 맨 앞 ✕,
     Shift+Tab 이 푸터 '닫기' 부터 다시 — 줄을 하나씩 지우던 사람이 매번 표를 처음부터 다시 훑었다). 거래처·주문 목록의
     focusAfterDelete 와 같은 생각으로 **하던 자리**에 둔다: 누른 열의 버튼을 **그 줄 → 아래 줄 → 위 줄** 순으로 찾는다.
     삭제면 '그 줄' 이 그 자리에 올라온 줄이고, 마지막 줄을 지웠으면 위 줄부터다. 정산담당 줄의 삭제 칸은 잠긴 표지
     (`.tbl-lock` — 버튼이 아니라 초점을 못 받는다)라 그 줄은 건너뛴다. 지정이면 누른 줄의 칸이 정산담당 표지로 바뀌므로
     다음 '지정' 으로 간다. 그 열에 버튼이 하나도 없으면(남은 사람이 정산담당뿐 — 정산담당은 지울 수 없어 표가 비는 일은
     없지만 그때도 같다) 다음 조작 '담당자 추가' 로. 순번은 다시 그리기 **전에** 잰다.
     초점을 잃었을 때만 옮긴다 — 사람이 이미 다른 곳에 둔 초점은 건드리지 않는다. */
  const rowEls = () => qsa(m.panel, "[data-slot='list'] .table-grid__row");
  const rowIndexOf = (id) => rowEls().findIndex((r) => r.dataset.rowkey === id);
  function focusCol(attr, idx) {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const list = rowEls();
    const start = Math.min(Math.max(idx, 0), list.length - 1);
    const order = [...list.slice(start), ...list.slice(0, Math.max(start, 0)).reverse()];
    for (const r of order) {
      const b = qs(r, `[${attr}]`);
      if (b && !b.disabled) { b.focus(); return; }
    }
    const add = qs(m.panel, "[data-action='add']");
    if (add) add.focus();
  }
  /* ⚠️ Enter 를 누른 채로 두면 자동 반복 keydown 마다 **초점이 있는 버튼**이 다시 눌린다. focusCol 이 초점을 다음 줄의 같은 버튼에
     두므로, 확인 창 없이 바로 지우는 이 창에서는 길게 누른 Enter 한 번이 지울 수 있는 줄을 전부 지우고 '담당자 추가' 로 빈 줄까지
     만들었다(실측: 6명 → 정산담당 + 빈 줄 · 지정은 두 사람 사이를 오가다 엉뚱한 사람에서 멈췄다). focusCol 이 초점을 옮기는 세 버튼에서는
     **반복 keydown 의 Enter 를 버린다** — 떼었다 다시 누르면 그대로 눌린다(한 번 누를 때 한 줄). Space 는 뗄 때 한 번만 눌려 해당 없다. */
  on(m.panel, "keydown", "[data-mc-del], [data-mc-bill], [data-action='add']", (e) => {
    if (e.repeat && e.key === "Enter") e.preventDefault();
  });

  /* 닫기 위임은 openDialog 가 이미 건다([data-action='close']) — 여기서 또 걸지 않는다. */

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
    const v = k === "phone" ? onPhoneInput(t) : t.value;
    patch(t.dataset.id, { [k]: v });
    /* 이름을 고치면 그 줄 버튼들의 이름만 바꾼다(위 who — 다시 그리지 않는다). */
    if (k === "name") {
      const id = t.dataset.id;
      const set = (sel, label) => { const b = qs(m.panel, sel); if (b) b.setAttribute("aria-label", label); };
      set(`[data-mc-msg="${id}"]`, msgLabel(v));
      set(`[data-mc-bill="${id}"]`, billLabel(v));
      set(`[data-mc-del="${id}"]`, delLabel(v));
    }
    /* 연락처를 채우면 그 줄의 알림톡 토글이 살아난다 — 행을 다시 그리면 커서가
       날아가므로 **그 버튼 하나만** 손본다. */
    if (k === "phone") {
      const tg = qs(m.panel, `[data-mc-msg="${t.dataset.id}"]`);
      if (tg) {
        const ok = !!String(v).trim();
        tg.disabled = !ok;
        tg.title = ok ? "배송완료 알림톡 수신" : "연락처를 먼저 입력하세요";
        const rec = rows().find((c) => c.id === t.dataset.id);
        tg.setAttribute("aria-checked", ok && rec && rec.message === MSG_RECEIVE ? "true" : "false");
      }
    }
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
    const idx = rowIndexOf(t.dataset.mcBill); // 다시 그리기 전 순번 — 그 줄의 칸은 정산담당 표지가 된다(focusCol)
    store.setBillingContactOf(cid, t.dataset.mcBill);
    const c = rows().find((x) => x.id === t.dataset.mcBill);
    renderList(); changed();
    focusCol("data-mc-bill", idx);
    toast(`정산·회계 담당자를 ${c && c.name ? c.name : "선택한 담당자"}(으)로 변경했습니다`, "ok");
  });

  on(m.panel, "click", "[data-mc-del]", (e, t) => {
    const id = t.dataset.mcDel;
    const idx = rowIndexOf(id); // 지우기 전 순번 — 그 자리에 올라온 줄로(focusCol)
    const c = rows().find((x) => x.id === id);
    store.setContactsOf(cid, (prev) => prev.filter((x) => x.id !== id));
    renderList(); renderCap(); changed();
    focusCol("data-mc-del", idx);
    toast(`${c && c.name ? c.name + " " : ""}담당자를 삭제했습니다`, "warn");
  });

  return m;
}
