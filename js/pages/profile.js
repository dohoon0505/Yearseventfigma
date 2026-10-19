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
      담당자 등록·수정 창은 관리자 '담당자 추가' 와 **같은 창**이다(js/util/contact-dialog.js — 성함·연락처 필수).
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, newProfileId } from "../store.js";
import { currentClientName } from "../util/client.js";
import { pageHead, tableGrid } from "../ui.js";
import { openDialog, dlgRule, dlgRow, dlgActions, openDeleteConfirm } from "../util/dialog.js";
import { openContactForm } from "../util/contact-dialog.js";
import { onPhoneInput, contactPhoneOk, contactPhoneNeed } from "../util/phone.js";
import { makeToast } from "../toast.js";
import { takeFocusSection } from "../session.js";

const trim = (v) => String(v ?? "").trim();

export function mount(root) {
  const toast = makeToast();
  /* 이 화면의 다이얼로그는 서로 위에 쌓이지 않는다(목록 → 하나). 열려 있는 것만 잡아 둔다. */
  let dlg = null;
  const closeDlg = () => { if (dlg) { dlg.close(); dlg = null; } };

  /* 로그인 거래처의 프로필만 — 담당자(contactsOf)와 같은 스코프 규칙이다. */
  const profiles = () => store.profilesOf();
  const contacts = () => store.contactsOf(); // 로그인 거래처의 담당자만

  /* ── 표 셀 조각 ───────────────────────────────────────── */
  /* 줄 버튼의 이름은 **그 줄의 사람**을 부른다. 삭제·수정·지정 뒤 초점이 그 자리에 올라온 다른 줄의 같은 버튼으로
     옮겨 가므로(아래 focusCol) '삭제' 만으로는 화면낭독기가 누구의 버튼인지 말하지 못한다(관리자 담당자 관리 창과 같은 처리).
     표는 다이얼로그가 닫힌 뒤에만 다시 그리므로 이름이 바뀌면 이 글자도 같이 바뀐다. */
  const who = (name) => trim(name) || "담당자";
  const rowActs = (kind, r, lockDel) => html`
    <button class="pf-act" data-action="edit" data-kind="${kind}" data-id="${r.id}" aria-label="${who(r.name)} 수정">${icon("pencil", { size: 15 })}</button>
    ${lockDel
      ? html`<span class="pf-act is-lock" title="정산 · 회계 담당자는 삭제할 수 없습니다" aria-hidden="true">${icon("trash2", { size: 15 })}</span>`
      : html`<button class="pf-act" data-action="del" data-kind="${kind}" data-id="${r.id}" aria-label="${who(r.name)} 삭제">${icon("trash2", { size: 15 })}</button>`}
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
    { label: "관리", width: "var(--pf-acts, 96px)", align: "center", render: (r) => rowActs("profile", r, false) },
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
        : html`<button class="pf-billset" data-action="set-billing" data-id="${r.id}" aria-label="${who(r.name)} 정산 · 회계 담당 지정">지정</button>`),
    },
    /* 정산담당은 삭제 버튼 자리에 잠긴 아이콘을 둔다 — 자리를 비우면 행마다 관리 칸이
       들쭉날쭉해지고 '왜 못 지우는지'도 사라진다(관리자 화면과 같은 처리). */
    { label: "관리", width: "var(--pf-acts, 96px)", align: "center", render: (r) => rowActs("contact", r, r.isBilling) },
  ];

  /* ── 화면 ─────────────────────────────────────────────── */
  /* `sec` 는 다른 화면이 이 카드를 지목할 때 쓰는 이름이다(정산회계 조회 › 정산 담당 '변경' → 담당자).
     제목에 tabindex=-1 을 둔 것은 그때 포커스를 옮겨 화면 낭독기가 어디에 왔는지 읽게 하려는 것이다. */
  const section = ({ sec, slot, title, count, desc, addAction, addLabel, table }) => html`
    <section class="pf-card" data-sec="${sec}">
      <div class="pf-card__hd">
        <div class="pf-card__hdl">
          <h2 tabindex="-1">${title} <span class="pf-count">${count}</span></h2>
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

  /* ── 다시 그린 뒤 초점 ─────────────────────────────────────
     삭제 확정·수정 저장·표의 '지정' 은 표를 다시 그린다 — 창이 닫히며 연 버튼으로 돌려준 초점이 그 버튼과 함께 DOM 에서
     떨어져 body 로 빠졌다(실측: 두 카드의 삭제 확정 · 수정 저장 · 표 '지정' 모두 — 링이 사라지고 화면낭독기는 어디인지 말하지 못했다).
     관리자 담당자 관리 창의 focusCol 과 같은 생각으로 **하던 자리**에 둔다: 누른 열의 버튼을 **그 줄 → 아래 줄 → 위 줄** 순으로
     찾는다. 삭제면 '그 줄' 이 그 자리에 올라온 줄이고, 마지막 줄을 지웠으면 위 줄부터다. 정산담당 줄의 삭제 칸은 잠긴 표지
     (`.pf-act.is-lock` — span 이라 초점을 못 받는다)라 그 줄은 건너뛴다. 표의 '지정' 이면 누른 줄의 칸이 '담당' 표지로 바뀌므로
     다음 '지정' 으로 간다. 그 열에 버튼이 하나도 없으면(프로필을 다 지웠다 · 남은 담당자가 정산담당뿐) 그 카드의 등록 버튼으로.
     순번은 다시 그리기 **전에** 잰다. 초점을 잃었을 때만 옮긴다 — 사람이 이미 다른 곳에 둔 초점은 건드리지 않는다
     (등록 저장은 연 버튼 '… 등록' 이 머리글에 있어 다시 그려지지 않으므로 창이 돌려준 그 자리에 그대로 남는다 — 실측). */
  const slotOf = (kind) => (kind === "profile" ? "ptable" : "ctable");
  const rowEls = (kind) => qsa(root, `[data-slot='${slotOf(kind)}'] .table-grid__row`);
  const rowIndexOf = (kind, id) => rowEls(kind).findIndex((r) => r.dataset.rowkey === id);
  const lostFocus = () => {
    const a = document.activeElement;
    return !a || a === document.body || !a.isConnected;
  };
  const focusAdd = (kind) => {
    const add = qs(root, `[data-action='${kind === "profile" ? "new-profile" : "new-contact"}']`);
    if (add) add.focus();
  };
  function focusCol(kind, action, idx) {
    if (!lostFocus()) return;
    const list = rowEls(kind);
    const start = Math.min(Math.max(idx, 0), list.length - 1);
    const order = [...list.slice(start), ...list.slice(0, Math.max(start, 0)).reverse()];
    for (const r of order) {
      const b = qs(r, `button[data-action='${action}']`);
      if (b && !b.disabled) { b.focus(); return; }
    }
    focusAdd(kind);
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
                sec: "profiles",
                slot: "ptable",
                title: "발송인 프로필",
                count: html`<span data-slot="pcount">${profiles().length}</span>`,
                desc: "화환 리본에 찍히는 발신인입니다. 고정문구를 적어두면 주문할 때마다 다시 쓰지 않아도 됩니다.",
                addAction: "new-profile",
                addLabel: "프로필 등록",
                table: profileTable(),
              })}
              ${section({
                sec: "contacts",
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
     담당자는 공용 다이얼로그다(util/contact-dialog.js — 관리자 담당자 관리 창의 '담당자 추가' 와 같은 창).
     예전엔 이 함수 한 셸이 프로필·담당자 둘 다 그렸는데, 관리자 화면이 같은 담당자 창을 써야 해서(명세 4.5a · M52)
     담당자 쪽을 꺼냈다. 여기 남은 것은 발송인 프로필뿐이다. */
  function openForm(kind, row) {
    closeDlg();
    if (kind === "contact") {
      dlg = openContactForm({
        row,
        onClose: () => { dlg = null; },
        onSaved: (next, { isNew }) => {
          /* 창은 이미 닫혔고 표는 아직 그대로다 — 다시 그리기 전 순번을 잰다(수정이면 그 줄의 새 '수정' 버튼으로 · focusCol). */
          const idx = isNew ? -1 : rowIndexOf("contact", next.id);
          refresh();
          /* 등록 = 창이 돌려준 '담당자 등록' 이 그대로 남는다(아래 프로필 저장의 주석과 같다). */
          if (isNew) { if (lostFocus()) focusAdd("contact"); }
          else focusCol("contact", "edit", idx);
          toast(isNew ? "등록했습니다" : "저장했습니다");
        },
      });
      return;
    }
    const isNew = !row;
    const form = isNew ? { id: newProfileId(), name: "", role: "", phone: "", greeting: "" } : { ...row };

    /* 필수 항목 — 프로필은 고정문구까지 받는다. 비워 두면 리본에 찍을 글자가 없어서,
       빈 값을 저장하느니 등록을 막는다(2026-09-17 사용자 결정). 자동생성은 하지 않는다. */
    const REQUIRED = [["name", "성함"], ["phone", "수신번호"], ["greeting", "고정문구"]];
    const missing = () => REQUIRED.filter(([k]) => !trim(form[k])).map(([, label]) => label);
    const ok = () => missing().length === 0;

    const HINT_OK = "주문 화면에서 문구는 다시 고칠 수 있습니다";
    /* ⚠️ 버튼만 흐려 두지 않는다 — **무엇이** 남았는지 그 자리에서 말한다(규약).
       시안의 고정 문구("성함과 연락처는 필수입니다")를 그대로 쓰면 고정문구가 빠졌을 때
       막힌 이유를 거짓으로 말하게 된다. */
    const hintNo = () => `필수 항목이 남았습니다 — ${missing().join(" · ")}`;

    const previewBody = () => html`
      <p class="pf-pv__k">리본 미리보기</p>
      <p class="pf-pv__v">${trim(form.greeting) || "고정문구를 입력하면 여기에 보입니다"}</p>
    `;

    const body = html`
      ${dlgRule({ t: "발송인 정보", cap: "리본과 배송완료 알림에 쓰입니다" })}
      ${dlgRow({
        k: "성함", req: true, htmlFor: "pf-name",
        v: html`<input class="ord-in" id="pf-name" data-f="name" value="${form.name ?? ""}" placeholder="예) 홍길동" />`,
      })}
      ${dlgRow({
        k: "직위", htmlFor: "pf-role",
        v: html`<input class="ord-in" id="pf-role" data-f="role" value="${form.role ?? ""}" placeholder="예) 대표이사" />`,
      })}
      ${dlgRow({
        k: "수신번호", req: true, htmlFor: "pf-phone",
        v: html`<input class="ord-in ord-in--num" id="pf-phone" data-f="phone" value="${form.phone ?? ""}" placeholder="010-0000-0000" inputmode="numeric" />`,
      })}

      ${dlgRule({ t: "리본 문구", cap: "리본에 그대로 인쇄됩니다" })}
      ${dlgRow({
        k: "고정문구", req: true, htmlFor: "pf-greeting",
        v: html`<input class="ord-in" id="pf-greeting" data-f="greeting" value="${form.greeting ?? ""}" placeholder="예) ${currentClientName()} 대표이사 홍길동" />`,
      })}
      <div class="pf-pv" data-slot="pv">${previewBody()}</div>
    `;

    dlg = openDialog({
      eyebrow: "발송인 프로필관리",
      title: isNew ? "새 발송인 프로필을 등록합니다" : `${row.name} 프로필 수정`,
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
      const pv = qs(p, "[data-slot='pv']");
      if (pv) setHTML(pv, previewBody());
      syncFooter();
    });

    on(p, "click", "[data-action='ok']", () => {
      if (!ok()) return;
      const idx = isNew ? -1 : rowIndexOf(kind, form.id); // 다시 그리기 전 순번 — 수정이면 그 줄의 새 '수정' 버튼으로(focusCol)
      const next = { ...form, name: trim(form.name), role: trim(form.role), phone: trim(form.phone), greeting: trim(form.greeting) };
      store.setProfiles((prev) => (isNew ? [...prev, next] : prev.map((x) => (x.id === next.id ? { ...x, ...next } : x))));
      closeDlg();
      refresh();
      /* 수정 = 그 줄의 '수정'(줄이 다시 그려졌으니 같은 줄의 새 버튼) · 등록 = 창이 돌려준 '… 등록' 이 그대로 남는다
         (머리글은 다시 그리지 않는다 — 이어서 한 명 더 등록하는 흐름이 흔하고 ✕·취소·ESC 도 그 자리로 돌아간다.
         새 줄은 표 맨 끝에 붙고 '등록했습니다' 가 읽힌다). 등록인데 초점을 잃었다면 그 등록 버튼으로. */
      if (isNew) { if (lostFocus()) focusAdd(kind); }
      else focusCol(kind, "edit", idx);
      toast(isNew ? "등록했습니다" : "저장했습니다");
    });
  }

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
        /* 확인 창은 닫히며 이 줄의 '삭제' 로 초점을 돌려준 뒤 이 함수를 부른다 — 곧 그 버튼이 표와 함께 사라진다.
           지우기 전 순번을 재 두었다가 그 자리에 올라온 줄의 '삭제' 로(focusCol). ESC·돌아가기는 표를 그리지 않아 그 줄 '삭제' 그대로다. */
        const idx = rowIndexOf(kind, row.id);
        if (isProfile) store.setProfiles((prev) => prev.filter((x) => x.id !== row.id));
        else store.setContacts((prev) => prev.filter((x) => x.id !== row.id));
        dlg = null;
        refresh();
        focusCol(kind, "del", idx);
        toast("삭제했습니다");
      },
    });
    /* openDeleteConfirm 은 자기가 닫으므로 핸들만 비워 둔다(이중 close 방지). */
    const prevClose = dlg.close;
    dlg = { ...dlg, close: () => { prevClose(); dlg = null; } };
  }

  render();

  /* 다른 화면이 구역을 지목하고 왔다 — 그 카드를 화면에 올리고 제목에 포커스를 둔다.
     담당자 카드는 발송인 프로필 카드 아래라, 그냥 이동하면 프로필이 많은 거래처에서는 첫 화면에 안 보인다.
     (도착 표시 테두리는 2026-10-15 사용자 결정으로 뺐다 — 시안에 없는 모양이다.) */
  let focusRaf = 0;
  const focusSec = takeFocusSection("profile");
  const target = focusSec ? qs(root, `[data-sec='${focusSec}']`) : null;
  if (target) {
    /* ⚠️ 다음 프레임에 스크롤한다 — 라우터가 mount() 가 끝나자마자 `target.scrollTop = 0` 으로 되돌린다
       (router.js). 여기서 바로 scrollIntoView 하면 그 한 줄에 지워져 카드가 첫 화면 아래에 남는다(1366x768 실측). */
    focusRaf = requestAnimationFrame(() => {
      focusRaf = 0;
      target.scrollIntoView({ block: "start" });
      const h = qs(target, "h2");
      if (h) h.focus({ preventScroll: true });
    });
  }

  const off = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "new-profile") return openForm("profile", null);
    if (a === "new-contact") return openForm("contact", null);
    if (a === "set-billing") {
      const c = contacts().find((x) => x.id === t.dataset.id);
      /* 연락처가 없거나 담당자 연락처 기준(util/phone.js contactPhoneOk — 숫자 10~12자리 · 010 번호는 11자리 · 2026-10-19 사용자
         결정 ⓔ)에 맞지 않는 사람은 정산 · 회계 담당으로 지정하지 않는다 — 정산 알림이 갈 곳이 없어진다('정산 담당 연락처는 비울 수
         없음'). 지금 등록·수정 창은 그런 번호를 받지 않으므로 예전에 저장된 줄만 해당한다. 초점은 누른 '지정' 그대로다(다시 그리지 않는다). */
      if (c && !contactPhoneOk(c.phone)) {
        toast(trim(c.phone)
          ? `${who(c.name)}님은 연락처가 맞지 않아(${contactPhoneNeed(c.phone)}) 정산 · 회계 담당으로 지정할 수 없습니다 — 수정에서 연락처를 먼저 고치세요`
          : `${who(c.name)}님은 연락처가 없어 정산 · 회계 담당으로 지정할 수 없습니다 — 수정에서 연락처를 먼저 입력하세요`, "warn");
        return;
      }
      const idx = rowIndexOf("contact", t.dataset.id); // 다시 그리기 전 순번 — 그 줄의 칸은 '담당' 표지가 된다(focusCol)
      store.setBillingContactOf(null, t.dataset.id);
      refresh();
      focusCol("contact", "set-billing", idx);
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

  /* ⚠️ Enter 를 누른 채로 두면 자동 반복 keydown 마다 **초점이 있는 버튼**이 다시 눌린다. 위 focusCol 이 초점을 다음 줄의 같은
     버튼에 두므로 표의 '지정' 을 길게 누르면 정산·회계 담당이 줄마다 옮겨 다니다 엉뚱한 사람에서 멈췄다(실측: 할다운을 눌렀는데
     김현수). 삭제 확정을 길게 누르면 다음 줄의 확인 창이, 수정 저장·등록을 길게 누르면 같은 창이 저절로 열렸다 닫혔다(실측 3번씩 —
     등록은 예전부터). 초점이 내려앉는 버튼(줄의 지정·수정·삭제 · 두 카드의 등록)에서는 **반복 keydown 의 Enter 를 버린다** —
     떼었다 다시 누르면 그대로 눌린다(관리자 담당자 관리 창과 같은 처리).
     Space 는 뗄 때 한 번만 눌려 해당 없다. */
  const offKey = on(root, "keydown", "[data-action='set-billing'], [data-action='edit'], [data-action='del'], [data-action='new-profile'], [data-action='new-contact']", (e) => {
    if (e.repeat && e.key === "Enter") e.preventDefault();
  });

  return () => {
    off();
    offKey();
    closeDlg();
    toast.destroy();
    if (focusRaf) cancelAnimationFrame(focusRaf);
  };
}
