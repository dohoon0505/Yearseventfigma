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
   없애면 안 된다 — 처음 만들 때는 구 시스템에 담당자 필드가 없어 이관 거래처 19곳 중 **18곳이
   담당자 0명**이었고(2026-09-29 이관 취소로 그 데이터는 없다), 담당자는 주문 요청자·배송완료 알림 수신자·정산 명세서 수신자의
   출처다. 그래서 원장에서 빼고 이 다이얼로그로 옮겼다.

   ⚠️ 불변식 두 가지는 포털과 **반드시** 같아야 한다(다르면 버그로 읽힌다):
   · 담당자가 1명 이상이면 정산·회계 담당은 **정확히 1명**
   · **정산담당은 직접 삭제할 수 없다** — 다른 사람을 먼저 지정해야 한다

   ⚠️ 이 다이얼로그는 거래처 모달 **위에 스택**될 수 있다. 핸들을 호출부의 단일
      `activeModal` 슬롯에 담지 말 것 — 담으면 아래 모달의 핸들이 사라져 X·취소가 죽는다.

   이름·연락처는 **비울 수 없다**(명세 4.5a · 5.8 `400 CONTACT_FIELD_REQUIRED` · M52 · 2026-10-19 사용자 결정
   '정산 담당 연락처는 비울 수 없음'). 예전엔 '담당자 추가' 가 빈 줄을 곧바로 저장했고(비어 있던 거래처면 그 빈 줄이
   정산담당이 됐다) 기존 줄의 이름·연락처를 지워도 그대로 저장했다. 지금은:
   · 추가 = 포털 담당자 저장공간과 **같은 등록 창**(util/contact-dialog.js)이 이 창 위에 스택된다 — 성함·연락처가 다 차야
     등록이 열리고, 등록하는 순간 줄이 생긴다.
   · 기존 줄 = 칸마다 바로 저장은 그대로다. 단 이름을 비우거나 연락처가 담당자 연락처 기준(`contactPhoneOk` — 숫자 10~12자리 ·
     010 번호는 정확히 11자리 · 2026-10-19 사용자 결정 ⓔ)에 맞지 않으면 저장소에 쓰지 않고 칸을 `.is-bad` 로 칠해 푸터가 이유를
     말하며, 칸을 떠나면(focusout) 또는 창을 닫으면 **칸에 들어올 때의 값**으로 칸과 저장소를 함께 되돌린다(아래 '기존 줄 고치기').
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE } from "../store.js";
import { tableGrid } from "../ui.js";
import { openDialog, linkReason } from "./dialog.js";
import { openContactForm } from "./contact-dialog.js";
import { onContactPhoneInput, contactPhoneOk, contactPhoneNeed, contactPhoneLong, contactPhoneOdd } from "./phone.js";

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
     아무도 채우지 않는다(처음 근거는 이관 19곳 중 18곳이 0명이던 데이터 — 2026-09-29 이관 취소). */
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

  const HINT_OK = "변경 사항은 입력과 동시에 저장됩니다";

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
    hint: HINT_OK,
    actions: html`<button class="hm-btn hm-btn--primary" data-action="close">닫기</button>`,
    /* 칸에 맞지 않는 값을 둔 채 ESC·✕·닫기로 닫으면 그 칸은 focusout 을 못 받을 수 있다(창째 DOM 에서 빠진다) — 칸을 떠날 때와 같은
       규칙으로 정리한 **뒤** 호출부의 onClose 를 부른다(정리가 onChange 로 연 버튼을 다시 그려도 호출부가 초점을 새 버튼으로 옮긴다). */
    onClose: () => { settleHeld(); if (o.onClose) o.onClose(); },
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

  /* 추가 = 포털과 같은 등록 창(util/contact-dialog.js)을 이 창 **위에 스택**한다 — 성함·연락처가 다 차야 등록이 열리고,
     등록하는 순간 줄이 생긴다(명세 4.5a '추가' · M52). 예전엔 빈 줄을 곧바로 저장하고 그 줄의 이름 칸으로 초점을 옮겼다.
     ⚠️ 핸들을 담아 두지 않는다 — 스택이라 단일 슬롯에 담으면 아래 창의 핸들을 덮는다(머리 주석). 닫히면 openModal 이
     '담당자 추가' 로 초점을 돌려준다. 이 버튼은 표 밖이라 다시 그려지지 않으므로 등록 뒤에도 초점이 그대로 남는다 —
     포털 '담당자 등록' 과 같다(이어서 한 명 더 등록하는 흐름이 흔하다). 새 줄은 표 맨 끝에 붙으니 보이게 굴린다. */
  on(m.panel, "click", "[data-action='add']", () => {
    openContactForm({
      clientId: cid,
      eyebrow: o.client.companyName,
      onSaved: (c) => {
        renderList(); renderCap(); changed();
        const row = rowEls().find((r) => r.dataset.rowkey === c.id);
        if (row) row.scrollIntoView({ block: "nearest" });
        const add = qs(m.panel, "[data-action='add']");
        const a = document.activeElement;
        if (add && (!a || a === document.body || !a.isConnected)) add.focus();
        const rec = rows().find((x) => x.id === c.id);
        toast(`${c.name} 담당자를 등록했습니다${rec && rec.isBilling ? " · 정산·회계 담당자입니다" : ""}`, "ok");
      },
    });
  });

  /* ── 기존 줄 고치기 — 칸마다 바로 저장, 단 이름·연락처는 맞는 값만 ──────────────
     이름이 비거나 연락처가 담당자 연락처 기준(util/phone.js `contactPhoneOk` — 숫자 10~12자리 · 010 번호는 정확히 11자리 · 2026-10-19
     사용자 결정 ⓔ · 등록 창과 같은 판정)에 맞지 않으면 **저장소에 쓰지 않는다**. 칸을 `.is-bad`(금액 칸과 같은 '저장되지 않은 값' 표시)로
     칠하고 푸터가 이유를 막는 색으로 말하며, 그 이유를 칸에 잇는다(linkReason — 힌트 자리 자체는 live 가 아니다).
     칸을 떠나면(focusout — blur 는 위임이 안 된다) 값이 맞지 않을 때 **칸에 들어올 때의 저장값**으로 칸과 저장소를 함께 되돌리고 무엇을
     되돌렸는지 말한다. ⚠️ '마지막으로 맞았던 값' 으로 되돌리면 안 된다 — 칸은 글자마다 저장되므로 하나씩 지우는 동안 맞는 중간 값이
     저장된다(실측: '오임찬' 을 다 지우고 Tab → '오' 가 남아 '원래 값(오)으로 되돌렸습니다' · 010-3333-4444 끝 한 자리를 지운 10자리
     번호가 그대로 저장됐다). 창을 ESC·✕ 로 닫아도 같다(onClose 가 칸에 남은 값을 같은 규칙으로 정리한다 — 서버 `400
     CONTACT_FIELD_REQUIRED` 의 데모 대역 · 명세 4.5a '기존 행 수정' · 6.7).
     들어올 때의 값 자체가 기준에 맞지 않는 옛 줄(연락처 없이 저장돼 있던 줄 등 — 예전 '담당자 추가' 가 빈 줄을 저장했다)에서는
     '원래 값으로 돌아갑니다' 라고 말하지 않는다 — 그 값으로는 정산 알림이 가지 않는다. 맞는 값을 적어야 저장된다는 사실만 말한다.
     ⚠️ 입력 중에는 표를 다시 그리지 않는다(커서) — 칸 클래스·푸터·그 줄의 버튼 이름·토글만 손본다. */
  const recOf = (id) => rows().find((c) => c.id === id) || null;
  const fieldOk = (k, v) => (k === "name" ? !!String(v ?? "").trim() : contactPhoneOk(v));
  const EDIT_SEL = "[data-mc='name'], [data-mc='phone']";
  /** 칸마다(줄 id + 칸) 들어올 때의 저장값 — focusin 에서 담고, 칸을 떠나거나 창이 닫힐 때 쓰고 지운다. */
  const held = new Map();
  const keyOf = (t) => `${t.dataset.id}|${t.dataset.mc}`;
  const storedOf = (id, k) => String((recOf(id) || {})[k] ?? "");
  const wasOf = (t) => { const h = held.get(keyOf(t)); return h ? h.was : storedOf(t.dataset.id, t.dataset.mc); };

  /** 막는 이유 — 칸에 맞지 않는 글자가 남아 있는 동안 푸터가 말한다. 정산담당 줄의 연락처는 왜 안 되는지까지 말한다.
   *  `was`(들어올 때의 값)가 맞는 값일 때만 '원래 값으로 돌아갑니다' 라고 말한다(위 머리 주석 — 옛 줄). */
  const badText = (k, v, id, was) => {
    const back = fieldOk(k, was);
    if (k === "name") return `이름은 비울 수 없습니다 — ${back ? "칸을 떠나면 원래 값으로 돌아갑니다" : "이름을 적어야 저장됩니다"}`;
    const bill = !!(recOf(id) || {}).isBilling;
    const tail = back ? "칸을 떠나면 원래 값으로 돌아갑니다" : "맞는 번호를 적어야 저장됩니다";
    if (!String(v).trim()) {
      return bill
        ? `정산 담당 연락처는 비울 수 없습니다 — 정산 알림이 갈 곳이 없어집니다 · ${tail}`
        : `연락처는 비울 수 없습니다 — ${tail}`;
    }
    /* 칸이 자르지 않으므로(fmtContactPhone) 숫자가 많은 번호도 남는다 — 그때는 '끝까지' 가 아니라 '많다' 고 말한다. 숫자 밖의 글자
       ('+82' 등)가 섞인 값은 칸이 정형하지 않고 그대로 두므로 그 사실을 먼저 말한다. */
    const lead = contactPhoneOdd(v) ? "에 다른 글자가 섞였습니다" : contactPhoneLong(v) ? " 숫자가 너무 많습니다" : "를 끝까지 입력하세요";
    return `${bill ? "정산 담당 " : ""}연락처${lead} — ${contactPhoneNeed(v)} · ${tail}`;
  };
  /** 칸을 떠날 때 되돌린 뒤의 말 — 그때 사실이어야 한다(되돌린 값을 괄호로 함께 말한다). */
  const backText = (k, v, id, was) => {
    const name = (recOf(id) || {}).name;
    if (fieldOk(k, was)) {
      if (k === "name") return `이름은 비울 수 없어 원래 값(${String(was).trim()})으로 되돌렸습니다`;
      const why = !String(v).trim() ? "는 비울 수 없어" : contactPhoneOdd(v) ? "에 다른 글자가 섞여"
        : contactPhoneLong(v) ? " 숫자가 너무 많아" : "를 끝까지 적지 않아";
      return `${who(name)} 연락처${why} 원래 값(${was})으로 되돌렸습니다`;
    }
    if (k === "name") return "이름이 비어 있어 저장하지 않았습니다 — 이름을 적어야 저장됩니다";
    return `${who(name)} 연락처는 저장하지 않았습니다 — 맞는 번호(${contactPhoneNeed(v)})를 적어야 저장됩니다`;
  };
  /* 푸터 힌트를 칸의 설명으로 잇는다 — 화면낭독기가 칸에서 이유를 읽는다(힌트 자리 자체는 live 가 아니다). */
  const hintEl = qs(m.panel, "[data-slot='dlghint']");
  if (hintEl && !hintEl.id) hintEl.id = `ctc-hint-${cid}`;
  const markBad = (t, bad) => {
    t.classList.toggle("is-bad", bad);
    linkReason(t, hintEl, bad);
    if (!bad) t.removeAttribute("aria-invalid");
  };
  let hintIsDefault = true;
  const setHint = (text, block) => { m.setHint(text, block); hintIsDefault = text === HINT_OK; };

  /** 저장소에 칸 값을 쓴 뒤 — 그 줄의 버튼 이름(이름 칸)·알림톡 토글(연락처 칸)만 손보고 머리 인원·호출부를 갱신한다(다시 그리지 않는다). */
  const afterWrite = (k, id, v) => {
    /* 이름을 고치면 그 줄 버튼들의 이름만 바꾼다(위 who — 다시 그리지 않는다). */
    if (k === "name") {
      const set = (sel, label) => { const b = qs(m.panel, sel); if (b) b.setAttribute("aria-label", label); };
      set(`[data-mc-msg="${id}"]`, msgLabel(v));
      set(`[data-mc-bill="${id}"]`, billLabel(v));
      set(`[data-mc-del="${id}"]`, delLabel(v));
    }
    /* 연락처를 채우면 그 줄의 알림톡 토글이 살아난다 — 행을 다시 그리면 커서가 날아가므로 **그 버튼 하나만** 손본다.
       (입력 중에는 맞는 번호만 저장되므로 살아나는 쪽이다. 꺼지는 쪽은 옛 줄을 빈 값으로 되돌릴 때와 열 때의 렌더다.) */
    if (k === "phone") {
      const tg = qs(m.panel, `[data-mc-msg="${id}"]`);
      if (tg) {
        const ok = !!String(v).trim();
        tg.disabled = !ok;
        tg.title = ok ? "배송완료 알림톡 수신" : "연락처를 먼저 입력하세요";
        const rec = recOf(id);
        tg.setAttribute("aria-checked", ok && rec && rec.message === MSG_RECEIVE ? "true" : "false");
      }
    }
    renderCap(); changed();
  };

  on(m.panel, "focusin", EDIT_SEL, (e, t) => {
    const key = keyOf(t);
    /* 담아 둔 값이 있으면 덮지 않는다 — 창이 포커스를 잃었다 돌아온 칸(아래 focusout)이 그 경우다. 표를 다시 그려 칸이 새로
       만들어졌으면 옛 칸의 몫은 버리고 지금 저장값을 담는다. */
    const h = held.get(key);
    if (!h || h.el !== t) held.set(key, { el: t, was: storedOf(t.dataset.id, t.dataset.mc) });
  });

  on(m.panel, "input", "[data-mc]", (e, t) => {
    const k = t.dataset.mc;
    const id = t.dataset.id;
    const v = k === "phone" ? onContactPhoneInput(t) : t.value;
    if ((k === "name" || k === "phone") && !fieldOk(k, v)) {
      markBad(t, true);
      setHint(badText(k, v, id, wasOf(t)), true);
      return; // 저장소에 쓰지 않는다 — 칸을 떠나면 들어올 때의 값으로 돌아간다(아래 settle)
    }
    if (t.classList.contains("is-bad")) markBad(t, false);
    if (!hintIsDefault) setHint(HINT_OK, false);
    patch(id, { [k]: v });
    afterWrite(k, id, v);
  });

  /** 칸 하나를 정리한다 — 맞는 값이면 이름 앞뒤 공백만 덜어 저장하고(포털 등록 창이 저장할 때 trim 하는 것과 같은 모양 — 입력 중에
   *  덜면 커서가 튄다), 맞지 않으면 들어올 때의 값 `was` 로 칸과 저장소를 함께 되돌린다. 돌려주는 값은 푸터에 할 말(없으면 "").
   *  손대지 않은 옛 값(맞지 않지만 들어올 때 그대로 — .is-bad 가 아니다)은 그대로 둔다. */
  function settle(t, was) {
    const k = t.dataset.mc;
    const id = t.dataset.id;
    if (!recOf(id)) return "";
    const v = t.value;
    if (fieldOk(k, v)) {
      if (k === "name" && v !== v.trim()) { t.value = v.trim(); patch(id, { name: t.value }); afterWrite(k, id, t.value); }
      return "";
    }
    if (!t.classList.contains("is-bad")) return "";
    t.value = was;
    markBad(t, false);
    if (storedOf(id, k) !== was) { patch(id, { [k]: was }); afterWrite(k, id, was); }
    return backText(k, v, id, was);
  }

  on(m.panel, "focusout", EDIT_SEL, (e, t) => {
    /* 브라우저 창 자체가 포커스를 잃을 때(Alt+Tab · 다른 프로그램 클릭)도 focusout 이 온다 — 칸을 떠난 것이 아니므로 정리하지 않고
       담아 둔 값을 남긴다(돌아오면 같은 칸에 focusin 이 오고 위에서 덮지 않는다). 예전엔 적다 만 번호가 그때 들어올 때 값으로
       되돌아가 돌아와 보면 적던 숫자가 사라져 있었다. ESC·✕ 로 창을 닫을 때는 문서가 포커스를 쥐고 있어 그대로 정리되고,
       돌아오지 않은 채 창이 닫히면 settleHeld 가 같은 규칙으로 정리한다. */
    if (!document.hasFocus()) return;
    const was = wasOf(t);
    held.delete(keyOf(t));
    const say = settle(t, was);
    if (say) setHint(say, false);
  });
  /* 창이 닫힐 때 — 아직 떠나지 않은 칸(위 onClose). 창이 없으니 할 말은 버린다. */
  function settleHeld() {
    for (const [key, h] of [...held]) { held.delete(key); settle(h.el, h.was); }
  }

  on(m.panel, "click", "[data-mc-msg]", (e, t) => {
    const id = t.dataset.mcMsg;
    const cur = rows().find((c) => c.id === id);
    const next = cur && cur.message === MSG_RECEIVE ? MSG_NONE : MSG_RECEIVE;
    patch(id, { message: next });
    t.setAttribute("aria-checked", next === MSG_RECEIVE ? "true" : "false");
    renderCap(); changed();
  });

  on(m.panel, "click", "[data-mc-bill]", (e, t) => {
    /* 연락처가 담당자 연락처 기준(contactPhoneOk — 숫자 10~12자리 · 010 번호는 11자리)에 맞지 않는 사람은 정산담당으로 지정하지
       않는다 — 정산 알림(T3~T8)이 갈 곳이 없어진다(2026-10-19 사용자 결정 '정산 담당 연락처는 비울 수 없음' · ⓔ). 지금은 맞는 번호만
       저장되므로 그런 번호로 저장돼 있던 옛 줄만 해당한다. 그 줄의 연락처 칸을 고치던 중이면(.is-bad) 누르는 순간 focusout 이 들어올
       때의 값으로 되돌린 뒤라 저장된 값으로 판정한다. */
    const cand = recOf(t.dataset.mcBill);
    if (cand && !contactPhoneOk(cand.phone)) {
      toast(String(cand.phone || "").trim()
        ? `${who(cand.name)}의 연락처가 맞지 않아(${contactPhoneNeed(cand.phone)}) 정산담당으로 지정할 수 없습니다 — 연락처 칸을 먼저 고치세요`
        : `${who(cand.name)}의 연락처가 없어 정산담당으로 지정할 수 없습니다 — 연락처 칸을 먼저 채우세요`, "warn");
      return;
    }
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
