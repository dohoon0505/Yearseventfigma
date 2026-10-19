/* ============================================================
   contact-dialog.js — 담당자 등록 · 수정 다이얼로그 (공용)

   쓰는 곳 둘 — **같은 레코드**(`store.contactsByClient`)를 고친다:
   · 포털 담당자 저장공간(`#/app/profile` · profile.js) — '담당자 등록' 과 줄의 '수정'
   · 관리자 담당자 관리 창(util/contacts-modal.js) — '담당자 추가'. 그 창 **위에 스택**된다.

   왜 공용인가 — 관리자 '담당자 추가' 는 예전에 이름·연락처가 빈 줄을 곧바로 저장했다(비어 있던 거래처면
   그 빈 줄이 정산·회계 담당이 됐다). 명세 4.5a '추가'(M52 · 2026-10-03 추천안 채택)와 2026-10-19 사용자 결정
   '정산 담당 연락처는 비울 수 없음' 대로 포털과 **같은 다이얼로그**로 받는다: 성함·연락처가 다 차야 등록이 열리고,
   등록하는 순간 줄이 생긴다. 두 화면이 각자 만들면 필수 규칙·문구가 다시 갈린다.

   필수 판정은 성함(공백 아님) + 연락처 `contactPhoneOk`(util/phone.js — 숫자 10~12자리 · 010 번호는 정확히 11자리 · 2026-10-19
   사용자 결정 ⓔ. 관리자 담당자 관리 창 인라인 · 가입 2단계 · 관리자 신규 거래처 등록의 정산 담당 칸과 같은 판정).
   예전 포털은 연락처가 '비어 있지 않은지'만 봐서 '010' 도 등록됐고, 그다음엔 숫자 10자리 이상이면 받아 휴대폰 끝 한 자리를 빠뜨린
   010-1234-567 이 등록됐다 — 그런 번호로는 알림이 가지 않는다.

   ⚠️ 정산·회계 담당 '지정' 은 **저장할 때** 반영한다. 여기서 바로 store 를 건드리면 아직 명단에 없는 신규 id 로
      모두의 isBilling 을 끄게 되고, fixBilling 이 엉뚱한 사람을 다시 정산담당으로 올린다.
   ⚠️ 이 창은 관리자 담당자 관리 창 위에 스택된다 — 핸들을 호출부의 단일 슬롯에 담지 말 것(포털은 스택하지 않아 담는다).
   스타일은 공용 `.dlg-*` + components.css 의 `.modal-panel--dlg .pf-set*`(두 화면이 같이 쓰므로 profile.css 에서 옮겼다).
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE, newContactId } from "../store.js";
import { openDialog, dlgRule, dlgRow, dlgActions } from "./dialog.js";
import { onContactPhoneInput, contactPhoneOk, contactPhoneNeed, contactPhoneLong, contactPhoneOdd } from "./phone.js";

const trim = (v) => String(v ?? "").trim();

/**
 * openContactForm(o) → openDialog 핸들 { panel, close, setHint, render }
 *
 * @param {object}   o
 * @param {string}   o.clientId   거래처 id — null 이면 로그인 거래처(포털)
 * @param {object}   o.row        수정할 담당자(contactsOf 의 줄) — 없으면 새 담당자 등록
 * @param {string}   o.eyebrow    헤더 소제목(기본 '담당자 저장공간' — 관리자는 거래처 이름)
 * @param {Function} o.onSaved(contact, { isNew })  저장 → 창을 닫고(연 버튼으로 초점이 돌아간 **뒤**) 부른다.
 *                   호출부가 표를 다시 그리고 초점·토스트를 정한다(이 창은 호출부의 표를 모른다)
 * @param {Function} o.onClose    창이 닫힌 뒤(✕·취소·ESC·저장 모두 — 저장이면 onSaved 보다 먼저)
 * 쓰기는 `store.setContactsOf(clientId, …)` 한 길이다(포털 축약형 setContacts 와 같은 함수 — clientId 가 null 이면 로그인 거래처).
 */
export function openContactForm({ clientId = null, row = null, eyebrow = "담당자 저장공간", onSaved, onClose } = {}) {
  const isNew = !row;
  /* 비어 있던 거래처의 첫 담당자는 정산·회계 담당이 된다(명세 4.5a '첫 담당자' · store.fixBilling 이 보장).
     그 사실을 창이 먼저 말한다 — '지정' 버튼을 띄워 두면 누르지 않아도 지정되는 버튼이 된다. */
  const first = isNew && store.contactsOf(clientId).length === 0;
  const form = isNew
    ? { id: newContactId(), name: "", role: "", phone: "", message: MSG_RECEIVE, isBilling: first }
    : (({ no, ...r }) => ({ ...r }))(row); // `no` 는 contactsOf 가 매번 파생하는 표시 순번이라 저장하지 않는다

  const need = () => {
    const out = [];
    if (!trim(form.name)) out.push("성함");
    if (!contactPhoneOk(form.phone)) out.push("연락처");
    return out;
  };
  const ok = () => need().length === 0;

  const HINT_OK = first ? "첫 담당자라 정산 · 회계 담당이 됩니다" : "정산담당을 옮기려면 다른 담당자를 지정하세요";
  /* ⚠️ 버튼만 흐려 두지 않는다 — **무엇이** 남았는지 그 자리에서 말한다(규약). 연락처를 적다 만 경우는 '남았습니다' 가 아니라
     무엇이 모자란지 말한다 — 칸에 글자가 있는데 '연락처가 남았다' 고 하면 이유를 찾아 헤맨다. 모자란 것은 contactPhoneNeed 가
     말한다(010 으로 시작하면 '010 번호는 숫자 11자리' — 기준을 화면에 손으로 적지 않는다). */
  const hintNo = () => {
    const n = need();
    const partial = !!trim(form.phone) && !contactPhoneOk(form.phone);
    /* 칸이 자르지 않으므로(fmtContactPhone) 숫자가 많은 번호도 남는다 — 그때는 '끝까지' 가 아니라 '많다' 고 말한다. 숫자 밖의 글자
       ('+82' 등)가 섞인 값은 칸이 정형하지 않고 그대로 두므로 그 사실을 먼저 말한다. */
    const lead = contactPhoneOdd(form.phone) ? "연락처에 다른 글자가 섞였습니다"
      : contactPhoneLong(form.phone) ? "연락처 숫자가 너무 많습니다" : "연락처를 끝까지 입력하세요";
    if (n.length === 1 && partial) return `${lead} — ${contactPhoneNeed(form.phone)}`;
    return `필수 항목이 남았습니다 — ${n.map((k) => (k === "연락처" && partial ? `연락처(${contactPhoneNeed(form.phone)})` : k)).join(" · ")}`;
  };

  /* '지정됨' 표지의 tabindex=-1 은 '지정' 을 누른 직후 초점이 머무를 자리다(아래 setbill — 탭 순서에는 끼지 않는다). */
  const billBody = () =>
    form.isBilling
      ? html`<span class="pf-billon pf-billon--sm" tabindex="-1">${icon("check", { size: 13 })}지정됨</span>`
      : html`<button type="button" class="pf-billset" data-action="setbill">지정</button>`;

  const body = html`
    ${dlgRule({ t: "기본 정보", cap: "주문 요청자 목록에 함께 뜹니다" })}
    ${dlgRow({
      k: "성함", req: true, htmlFor: "pf-name",
      v: html`<input class="ord-in" id="pf-name" data-f="name" value="${form.name ?? ""}" placeholder="예) 홍길동" />`,
    })}
    ${dlgRow({
      k: "부서 · 직위", htmlFor: "pf-role",
      v: html`<input class="ord-in" id="pf-role" data-f="role" value="${form.role ?? ""}" placeholder="예) 재경부" />`,
    })}
    ${dlgRow({
      k: "연락처", req: true, htmlFor: "pf-phone",
      v: html`<input class="ord-in ord-in--num" id="pf-phone" data-f="phone" value="${form.phone ?? ""}" placeholder="010-0000-0000" inputmode="numeric" />`,
    })}
    ${dlgRule({ t: "알림 · 정산", cap: "정산 · 회계 담당은 항상 1명" })}
    <div class="pf-set">
      <span class="pf-set__l">
        <b>배송완료 알림톡</b>
        <span>주문마다 배송완료 알림을 받습니다</span>
      </span>
      <button type="button" class="toggle" role="switch" data-action="msg"
              aria-checked="${form.message === MSG_RECEIVE ? "true" : "false"}"
              aria-label="배송완료 알림톡 수신"><span class="toggle__knob"></span></button>
    </div>
    <div class="pf-set">
      <span class="pf-set__l">
        <b>정산 · 회계 담당</b>
        <span>거래명세서 · 입금요청 알림톡을 받습니다</span>
      </span>
      <span data-slot="bill">${billBody()}</span>
    </div>
  `;

  const d = openDialog({
    eyebrow,
    title: isNew ? "새 담당자를 등록합니다" : `${row.name} 담당자 수정`,
    width: 560,
    body,
    hint: ok() ? HINT_OK : hintNo(),
    hintBlock: !ok(),
    actions: dlgActions({ ok: isNew ? "등록" : "저장", disabled: !ok() }),
    onClose,
  });

  const p = d.panel;
  const okBtn = qs(p, "[data-action='ok']");
  const lostFocus = () => {
    const a = document.activeElement;
    return !a || a === document.body || !a.isConnected;
  };
  const syncFooter = () => {
    const good = ok();
    okBtn.disabled = !good;
    /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다(규약). */
    d.setHint(good ? HINT_OK : hintNo(), !good);
  };

  /* ⚠️ 입력 중에는 절대 본문을 다시 그리지 않는다 — 커서가 날아간다. form 에 write-through 하고 푸터만 갱신한다. */
  on(p, "input", "[data-f]", (e, t) => {
    const k = t.dataset.f;
    form[k] = k === "phone" ? onContactPhoneInput(t) : t.value;
    syncFooter();
  });

  on(p, "click", "[data-action='msg']", (e, t) => {
    form.message = form.message === MSG_RECEIVE ? MSG_NONE : MSG_RECEIVE;
    t.setAttribute("aria-checked", form.message === MSG_RECEIVE ? "true" : "false");
  });

  /* 정산담당 지정은 **저장할 때** 반영한다(머리 주석). */
  on(p, "click", "[data-action='setbill']", () => {
    form.isBilling = true;
    const slot = qs(p, "[data-slot='bill']");
    if (slot) setHTML(slot, billBody());
    /* 누른 '지정' 이 '지정됨' 표지로 바뀌며 DOM 에서 떨어져 초점이 body 로 빠졌다 — 다음 Tab 이 창 맨 앞 ✕ 로 튀었다(실측).
       그 자리의 표지(tabindex=-1 · 탭 순서 밖)에 둔다: 다음 Tab 은 푸터 '취소', Shift+Tab 은 바로 위 알림톡 스위치다.
       명세서 동의 직후 카드 제목에 초점을 두는 것과 같은 수법이다. 초점을 잃었을 때만. */
    const chip = slot && qs(slot, ".pf-billon");
    if (chip && lostFocus()) chip.focus();
  });

  on(p, "click", "[data-action='ok']", () => {
    if (!ok()) return;
    const next = { ...form, name: trim(form.name), role: trim(form.role), phone: trim(form.phone) };
    store.setContactsOf(clientId, (prev) => (isNew ? [...prev, next] : prev.map((x) => (x.id === next.id ? { ...x, ...next } : x))));
    /* 명단에 있는 id 로만 지정한다 — 없는 id 로 지정하면 모두의 isBilling 이 꺼져 fixBilling 이 첫 줄을 정산담당으로 올린다
       (수정하던 사람이 그사이 다른 경로로 지워졌을 때). */
    if (next.isBilling && store.contactsOf(clientId).some((x) => x.id === next.id)) store.setBillingContactOf(clientId, next.id);
    d.close();
    if (onSaved) onSaved(next, { isNew });
  });

  return d;
}
