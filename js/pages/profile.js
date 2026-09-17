/* ============================================================
   profile.js — 프로필 저장공간 (#/app/profile)
   시안: claude.ai/design '프로필 저장공간 - 리모델링.dc.html'

   두 섹션 카드 — 발송인 프로필(리본에 찍히는 발신인)과 담당자(배송완료 알림 수신자).
   등록·수정·삭제는 전부 **공용 다이얼로그 규격**(js/util/dialog.js)을 쓴다. 시안 주석도
   'admin dialog.js 규격'이라 적고 있고, 예전처럼 `.hm__head`/`.hm__foot` 로 손수 짜면
   제목 크기도 버튼 모양도 화면마다 갈린다(규약).

   ⚠️ 담당자는 **관리자 화면과 같은 레코드**다(`store.contactsByClient`). 관리자 쪽
      진입점은 `js/util/contacts-modal.js` 이고, 불변식 둘은 양쪽이 반드시 같아야 한다:
      · 담당자가 1명 이상이면 정산·회계 담당은 **정확히 1명**(store.fixBilling 이 보장)
      · **정산담당은 직접 삭제할 수 없다** — 다른 사람을 먼저 지정해야 한다
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE, newContactId, newProfileId } from "../store.js";
import { currentClientName } from "../util/client.js";
import { pageHead, tableGrid } from "../ui.js";
import { openDialog, dlgRule, dlgRow, dlgActions, openDeleteConfirm } from "../util/dialog.js";
import { onPhoneInput } from "../util/phone.js";
import { makeToast } from "../toast.js";

const trim = (v) => String(v ?? "").trim();

export function mount(root) {
  const toast = makeToast();
  /* 이 화면의 다이얼로그는 서로 위에 쌓이지 않는다(목록 → 하나). 열려 있는 것만 잡아 둔다. */
  let dlg = null;
  const closeDlg = () => { if (dlg) { dlg.close(); dlg = null; } };

  const profiles = () => store.get().profiles;
  const contacts = () => store.contactsOf(); // 로그인 거래처의 담당자만

  /* ── 표 셀 조각 ───────────────────────────────────────── */
  const rowActs = (kind, id, lockDel) => html`
    <button class="pf-act" data-action="edit" data-kind="${kind}" data-id="${id}" aria-label="수정">${icon("pencil", { size: 15 })}</button>
    ${lockDel
      ? html`<span class="pf-act is-lock" title="정산 · 회계 담당자는 삭제할 수 없습니다" aria-hidden="true">${icon("trash2", { size: 15 })}</span>`
      : html`<button class="pf-act" data-action="del" data-kind="${kind}" data-id="${id}" aria-label="삭제">${icon("trash2", { size: 15 })}</button>`}
  `;

  /* ⚠️ 폭을 `var(--pf-*)` 로 넘기는 이유는 상품 규격 안내와 같다 — tableGrid 가
     grid-template-columns 를 **인라인 style 로** 찍어 미디어쿼리가 못 이긴다.
     폴백을 반드시 함께 적을 것(미정의면 전 셀이 한 열에 쌓인다). */
  const profileCols = [
    { label: "순번", width: "var(--pf-no, 54px)", align: "center", render: (r) => html`<span class="pf-no">${r.no}</span>` },
    { label: "성함", width: "var(--pf-name, 110px)", render: (r) => html`<span class="pf-strong">${r.name}</span>` },
    { label: "직위", width: "var(--pf-role, 130px)", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "var(--pf-phone, 180px)", render: (r) => html`<span class="pf-num">${r.phone}</span>` },
    { label: "리본 고정문구", width: "var(--pf-rest, minmax(0,1fr))", render: (r) => html`<span class="pf-ink">${r.greeting}</span>` },
    { label: "관리", width: "var(--pf-acts, 96px)", align: "center", render: (r) => rowActs("profile", r.id, false) },
  ];

  const contactCols = [
    { label: "순번", width: "var(--pf-no, 54px)", align: "center", render: (r) => html`<span class="pf-no">${r.no}</span>` },
    { label: "성함", width: "var(--pf-name, 110px)", render: (r) => html`<span class="pf-strong">${r.name}</span>` },
    { label: "부서 · 직위", width: "var(--pf-role, 130px)", render: (r) => r.role },
    { label: "연락처", width: "var(--pf-cphone, 170px)", render: (r) => html`<span class="pf-num">${r.phone}</span>` },
    {
      label: "배송완료 알림", width: "var(--pf-rest, minmax(0,1fr))",
      render: (r) => (r.message === MSG_RECEIVE
        ? html`<span class="pf-ink">수신함</span>`
        : html`<span class="pf-dim">수신 안 함</span>`),
    },
    {
      label: "정산 · 회계 담당", width: "var(--pf-bill, 160px)", align: "center",
      render: (r) => (r.isBilling
        ? html`<span class="pf-billon">${icon("check", { size: 13 })}담당</span>`
        : html`<button class="pf-billset" data-action="set-billing" data-id="${r.id}">지정</button>`),
    },
    /* 정산담당은 삭제 버튼 자리에 잠긴 아이콘을 둔다 — 자리를 비우면 행마다 관리 칸이
       들쭉날쭉해지고 '왜 못 지우는지'도 사라진다(관리자 화면과 같은 처리). */
    { label: "관리", width: "var(--pf-acts, 96px)", align: "center", render: (r) => rowActs("contact", r.id, r.isBilling) },
  ];

  /* ── 화면 ─────────────────────────────────────────────── */
  const section = ({ slot, title, count, desc, addAction, addLabel, table }) => html`
    <section class="pf-card">
      <div class="pf-card__hd">
        <div class="pf-card__hdl">
          <h2>${title} <span class="pf-count">${count}</span></h2>
          <p>${desc}</p>
        </div>
        <button class="pf-add" data-action="${addAction}">${addLabel}</button>
      </div>
      <div class="pf-table" data-slot="${slot}">${table}</div>
    </section>
  `;

  const profileTable = () =>
    tableGrid({ columns: profileCols, rows: profiles(), rowKey: (r) => r.id, compact: true });
  const contactTable = () =>
    tableGrid({ columns: contactCols, rows: contacts(), rowKey: (r) => r.id, compact: true });

  /* 섹션 하나만 다시 그린다 — 머리글 개수까지 같이 맞춰야 해서 카드 통째로 patch 한다.
     다이얼로그가 닫힌 뒤에만 도므로 입력 커서를 날릴 걱정은 없다. */
  function refresh() {
    const p = qs(root, "[data-slot='ptable']");
    const c = qs(root, "[data-slot='ctable']");
    if (p) setHTML(p, profileTable());
    if (c) setHTML(c, contactTable());
    const pc = qs(root, "[data-slot='pcount']");
    const cc = qs(root, "[data-slot='ccount']");
    if (pc) pc.textContent = String(profiles().length);
    if (cc) cc.textContent = String(contacts().length);
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-profile">
          <div class="pf-inner">
            ${pageHead({
              imgSrc: "./assets/nav-profile.png",
              title: "프로필 저장공간",
              desc: "화환 리본에 들어갈 발송인과, 알림을 받을 담당자를 관리합니다.",
              rule: true,
            })}
            <div class="pf-secs">
              ${section({
                slot: "ptable",
                title: "발송인 프로필",
                count: html`<span data-slot="pcount">${profiles().length}</span>`,
                desc: "화환 리본에 찍히는 발신인입니다. 고정문구를 적어두면 주문할 때마다 다시 쓰지 않아도 됩니다.",
                addAction: "new-profile",
                addLabel: "프로필 등록",
                table: profileTable(),
              })}
              ${section({
                slot: "ctable",
                title: "담당자",
                count: html`<span data-slot="ccount">${contacts().length}</span>`,
                desc: "배송 완료 알림을 받을 사내 담당자입니다. 정산 · 회계 담당자는 이 목록에서 한 명을 지정합니다.",
                addAction: "new-contact",
                addLabel: "담당자 등록",
                table: contactTable(),
              })}
            </div>
          </div>
        </div>
      `
    );
  }

  /* ── 등록 · 수정 다이얼로그 ────────────────────────────
     한 셸로 프로필·담당자 둘 다 그린다 — 다른 것은 **필드 서술자와 둘째 구역**뿐이다. */
  function openForm(kind, row) {
    closeDlg();
    const isProfile = kind === "profile";
    const isNew = !row;
    const form = isNew
      ? (isProfile
        ? { id: newProfileId(), name: "", role: "", phone: "", greeting: "" }
        : { id: newContactId(), name: "", role: "", phone: "", message: MSG_RECEIVE, isBilling: false })
      : { ...row };

    /* 필수 항목 — 프로필은 고정문구까지 받는다. 비워 두면 리본에 찍을 글자가 없어서,
       빈 값을 저장하느니 등록을 막는다(2026-09-17 사용자 결정). 자동생성은 하지 않는다. */
    const REQUIRED = isProfile
      ? [["name", "성함"], ["phone", "수신번호"], ["greeting", "고정문구"]]
      : [["name", "성함"], ["phone", "연락처"]];
    const missing = () => REQUIRED.filter(([k]) => !trim(form[k])).map(([, label]) => label);
    const ok = () => missing().length === 0;

    const HINT_OK = isProfile
      ? "주문 화면에서 문구는 다시 고칠 수 있습니다"
      : "정산담당을 옮기려면 다른 담당자를 지정하세요";
    /* ⚠️ 버튼만 흐려 두지 않는다 — **무엇이** 남았는지 그 자리에서 말한다(규약).
       시안의 고정 문구("성함과 연락처는 필수입니다")를 그대로 쓰면 고정문구가 빠졌을 때
       막힌 이유를 거짓으로 말하게 된다. */
    const hintNo = () => `필수 항목이 남았습니다 — ${missing().join(" · ")}`;

    const previewBody = () => html`
      <p class="pf-pv__k">리본 미리보기</p>
      <p class="pf-pv__v">${trim(form.greeting) || "고정문구를 입력하면 여기에 보입니다"}</p>
    `;

    const body = html`
      ${dlgRule({
        t: isProfile ? "발송인 정보" : "기본 정보",
        cap: isProfile ? "리본과 배송완료 알림에 쓰입니다" : "주문 요청자 목록에 함께 뜹니다",
      })}
      ${dlgRow({
        k: "성함", req: true, htmlFor: "pf-name",
        v: html`<input class="ord-in" id="pf-name" data-f="name" value="${form.name ?? ""}" placeholder="예) 홍길동" />`,
      })}
      ${dlgRow({
        k: isProfile ? "직위" : "부서 · 직위", htmlFor: "pf-role",
        v: html`<input class="ord-in" id="pf-role" data-f="role" value="${form.role ?? ""}" placeholder="${isProfile ? "예) 대표이사" : "예) 재경부"}" />`,
      })}
      ${dlgRow({
        k: isProfile ? "수신번호" : "연락처", req: true, htmlFor: "pf-phone",
        v: html`<input class="ord-in ord-in--num" id="pf-phone" data-f="phone" value="${form.phone ?? ""}" placeholder="010-0000-0000" inputmode="numeric" />`,
      })}

      ${isProfile
        ? html`
            ${dlgRule({ t: "리본 문구", cap: "리본에 그대로 인쇄됩니다" })}
            ${dlgRow({
              k: "고정문구", req: true, htmlFor: "pf-greeting",
              v: html`<input class="ord-in" id="pf-greeting" data-f="greeting" value="${form.greeting ?? ""}" placeholder="예) ${currentClientName()} 대표이사 홍길동" />`,
            })}
            <div class="pf-pv" data-slot="pv">${previewBody()}</div>
          `
        : html`
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
              <span data-slot="bill">${billBody(form)}</span>
            </div>
          `}
    `;

    dlg = openDialog({
      eyebrow: isProfile ? "발송인 프로필관리" : "담당자 저장공간",
      title: isNew
        ? (isProfile ? "새 발송인 프로필을 등록합니다" : "새 담당자를 등록합니다")
        : (isProfile ? `${row.name} 프로필 수정` : `${row.name} 담당자 수정`),
      width: 560,
      body,
      hint: ok() ? HINT_OK : hintNo(),
      hintBlock: !ok(),
      actions: dlgActions({ ok: isNew ? "등록" : "저장", disabled: !ok() }),
      onClose: () => { dlg = null; },
    });

    const p = dlg.panel;
    const okBtn = qs(p, "[data-action='ok']");
    const syncFooter = () => {
      const good = ok();
      okBtn.disabled = !good;
      /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다(규약). */
      dlg.setHint(good ? HINT_OK : hintNo(), !good);
    };

    /* ⚠️ 입력 중에는 절대 본문을 다시 그리지 않는다 — 커서가 날아간다.
       form 에 write-through 하고 슬롯(미리보기)과 푸터만 갱신한다. */
    on(p, "input", "[data-f]", (e, t) => {
      const k = t.dataset.f;
      form[k] = k === "phone" ? onPhoneInput(t) : t.value;
      if (isProfile) {
        const pv = qs(p, "[data-slot='pv']");
        if (pv) setHTML(pv, previewBody());
      }
      syncFooter();
    });

    if (!isProfile) {
      on(p, "click", "[data-action='msg']", (e, t) => {
        form.message = form.message === MSG_RECEIVE ? MSG_NONE : MSG_RECEIVE;
        t.setAttribute("aria-checked", form.message === MSG_RECEIVE ? "true" : "false");
      });
      /* 정산담당 지정은 **저장할 때** 반영한다. 여기서 바로 store 를 건드리면 아직
         명단에 없는 신규 id 로 모두의 isBilling 을 끄게 되고, fixBilling 이 엉뚱한
         사람을 다시 정산담당으로 올린다. */
      on(p, "click", "[data-action='setbill']", () => {
        form.isBilling = true;
        const slot = qs(p, "[data-slot='bill']");
        if (slot) setHTML(slot, billBody(form));
      });
    }

    on(p, "click", "[data-action='ok']", () => {
      if (!ok()) return;
      if (isProfile) {
        const next = { ...form, name: trim(form.name), role: trim(form.role), phone: trim(form.phone), greeting: trim(form.greeting) };
        store.setProfiles((prev) => (isNew ? [...prev, next] : prev.map((x) => (x.id === next.id ? { ...x, ...next } : x))));
      } else {
        const next = { ...form, name: trim(form.name), role: trim(form.role), phone: trim(form.phone) };
        store.setContacts((prev) => (isNew ? [...prev, next] : prev.map((x) => (x.id === next.id ? { ...x, ...next } : x))));
        if (next.isBilling) store.setBillingContactOf(null, next.id);
      }
      closeDlg();
      refresh();
      toast(isNew ? "등록했습니다" : "저장했습니다");
    });
  }

  const billBody = (form) =>
    form.isBilling
      ? html`<span class="pf-billon pf-billon--sm">${icon("check", { size: 13 })}지정됨</span>`
      : html`<button type="button" class="pf-billset" data-action="setbill">지정</button>`;

  /* ── 삭제 ─────────────────────────────────────────────── */
  function openDel(kind, row) {
    closeDlg();
    const isProfile = kind === "profile";
    const meta = [row.role, row.phone].filter(Boolean).join(" · ");

    /* 정산담당은 직접 지울 수 없다 — 거래명세서·입금요청 알림톡을 받을 사람이 사라진다.
       버튼을 흐려 두는 대신 왜 막혔는지와 다음 행동을 말한다. */
    if (!isProfile && row.isBilling) {
      dlg = openDialog({
        eyebrow: meta,
        title: `${row.name} 담당자는 삭제할 수 없어요`,
        width: 520,
        body: html`<p class="dlg-desc">정산 · 회계 담당자는 항상 한 명이 지정되어 있어야 합니다.
          거래명세서 발급과 입금요청 알림톡을 받을 사람이 사라지기 때문입니다.</p>`,
        hint: "먼저 다른 담당자를 정산담당으로 지정하세요",
        actions: html`<button class="hm-btn hm-btn--primary" data-action="close">확인</button>`,
        onClose: () => { dlg = null; },
      });
      return;
    }

    dlg = openDeleteConfirm({
      eyebrow: meta,
      title: isProfile ? `${row.name} 프로필을 삭제할까요?` : `${row.name} 담당자를 삭제할까요?`,
      desc: isProfile
        ? html`이미 발송된 주문의 리본 문구는 그대로 남고, 앞으로의 주문 선택 목록에서만 빠집니다.`
        : html`관리자 화면의 담당자 명단에서도 함께 사라지고, 배송완료 알림톡 대상에서 빠집니다.`,
      okLabel: isProfile ? "프로필 삭제" : "담당자 삭제",
      onConfirm: () => {
        if (isProfile) store.setProfiles((prev) => prev.filter((x) => x.id !== row.id));
        else store.setContacts((prev) => prev.filter((x) => x.id !== row.id));
        dlg = null;
        refresh();
        toast("삭제했습니다");
      },
    });
    /* openDeleteConfirm 은 자기가 닫으므로 핸들만 비워 둔다(이중 close 방지). */
    const prevClose = dlg.close;
    dlg = { ...dlg, close: () => { prevClose(); dlg = null; } };
  }

  render();

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "new-profile") return openForm("profile", null);
    if (a === "new-contact") return openForm("contact", null);
    if (a === "set-billing") {
      const c = contacts().find((x) => x.id === t.dataset.id);
      store.setBillingContactOf(null, t.dataset.id);
      refresh();
      toast(`${c ? c.name : "담당자"}님을 정산 · 회계 담당자로 지정했습니다`);
      return;
    }
    if (a !== "edit" && a !== "del") return;
    const kind = t.dataset.kind;
    const row = (kind === "contact" ? contacts() : profiles()).find((x) => x.id === t.dataset.id);
    if (!row) return;
    if (a === "edit") openForm(kind, row);
    else openDel(kind, row);
  });

  return () => {
    off();
    closeDlg();
    toast.destroy();
  };
}
