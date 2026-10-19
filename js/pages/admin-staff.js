/* ============================================================
   admin-staff.js — 시스템 관리 > 담당자 계정·권한
   내부 처리 담당자 디렉터리(이름·부서·연락처·알림수신 + 계정·권한)를 관리.
   구 시스템 '사용자 리스트(101)'를 흡수했다 — 한 사람 = 한 레코드.
   accountId 가 비면 로그인 없이 배정·알림만 받는 현장 담당이다.
   - 알림수신은 리스트 인라인 토글로 즉시 반영(카카오 알림톡 수신 허용 여부).
   - 신규 등록·정보 수정·삭제는 모달. 데이터 소스는 data/staff-mock.js.
   - 여기서 추가/삭제한 담당자는 B2C 담당자 지정 피커(staffNames 파생)에도 반영된다.
   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, makeDropdown } from "../ui.js";
import { openDialog, dlgRule, dlgRow, dlgActions } from "../util/dialog.js";
import { onPhoneInput } from "../util/phone.js";
import {
  staffList, staffAdd, staffUpdate, staffRemove, staffSetNotify, staffNewId, STAFF_ROLES,
} from "../data/staff-mock.js";

const TABS = [
  { v: "all", label: "전체" },
  { v: "account", label: "로그인 계정" },
  { v: "on", label: "알림 수신" },
  { v: "off", label: "알림 거부" },
];

export function mount(root, { nav }) {
  const state = { tab: "all", search: "" };
  let activeModal = null;
  const toast = makeToast();

  function closeModal() { const m = activeModal; activeModal = null; if (m) m.close(); }
  /* ── 목록 ─────────────────────────────────────────────── */
  function filtered() {
    const q = state.search.trim();
    return staffList().filter((s) => {
      if (state.tab === "on" && !s.notify) return false;
      if (state.tab === "off" && s.notify) return false;
      if (state.tab === "account" && !s.accountId) return false;
      if (q && !(s.name.includes(q) || (s.dept || "").includes(q) || s.phone.includes(q) || (s.accountId || "").includes(q))) return false;
      return true;
    });
  }
  function tabCount(v) {
    const all = staffList();
    return v === "all" ? all.length
      : v === "account" ? all.filter((s) => !!s.accountId).length
      : all.filter((s) => (v === "on" ? s.notify : !s.notify)).length;
  }
  function tabsBody() {
    return TABS.map((t) => {
      const on_ = state.tab === t.v;
      return html`<button class="bf-tab ${on_ ? "is-active" : ""}" data-action="tab" data-v="${t.v}" aria-pressed="${on_ ? "true" : "false"}">${t.label}<span class="bf-tab__cnt">${tabCount(t.v)}</span></button>`;
    });
  }
  /** 탭은 다시 그리지 않고 선택·건수만 갈아 끼운다 — 다시 그리면 Enter 로 누른 탭이 DOM 에서 떨어져 초점이 body 로 빠졌다
   *  (2026-10-19 실측 · 관리자 정산회계 `syncFilters` 와 같은 수법). 탭 목록(TABS)은 고정이라 버튼 수가 바뀌지 않는다. */
  function syncTabs() {
    qsa(root, "[data-action='tab']").forEach((b) => {
      const on_ = b.dataset.v === state.tab;
      b.classList.toggle("is-active", on_);
      b.setAttribute("aria-pressed", on_ ? "true" : "false");
      const c = qs(b, ".bf-tab__cnt");
      if (c) c.textContent = String(tabCount(b.dataset.v));
    });
  }
  /* ── 표를 다시 그린 뒤의 초점 ─────────────────────────────
     표는 쓰기마다 다시 그려진다 — 누른(또는 창을 연) 표 버튼이 DOM 에서 떨어지면 브라우저가 초점을 body 로 돌려,
     다음 Tab 이 표 첫 줄로 가 하던 자리를 잃는다(실측: 수정 저장 · 삭제 · '알림 수신/거부' 탭에서 토글).
     **초점을 잃었을 때만** 그 자리를 대신하는 버튼으로 옮긴다(거래처 목록 `focusRowBtn`·`focusAfterDelete` 와 같은 규칙):
     같은 사람 줄의 같은 버튼 → 그 줄이 빠졌으면 그 자리에 올라온 줄(마지막이었으면 새 마지막 줄)의 같은 버튼 → 표가 비면 fallback.
     순번은 다시 그리기 **전에** `rowIndex` 로 잰다. */
  const focusLost = () => { const a = document.activeElement; return !a || a === document.body || !a.isConnected; };
  const rowIndex = (id, action) => qsa(root, `[data-action='${action}']`).findIndex((b) => b.dataset.id === id);
  const focusRow = (id, action, idx, fallback) => {
    if (!focusLost()) return;
    const btns = qsa(root, `[data-action='${action}']`);
    const b = btns.find((x) => x.dataset.id === id) || (idx >= 0 && btns[Math.min(idx, btns.length - 1)]) || qs(root, fallback);
    if (b) b.focus();
  };
  function summaryBody() { return html`조회 <strong>${filtered().length}</strong>명`; }

  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r, i) => html`<span class="staff-no">${String(i + 1).padStart(2, "0")}</span>` },
    { label: "이름", width: "1fr", render: (r) => html`<div class="ellipsis"><span class="staff-name">${r.name}</span></div>` },
    { label: "부서", width: "1fr", render: (r) => html`<div class="ellipsis ${r.dept ? "" : "staff-dept--empty"}">${r.dept || "미지정"}</div>` },
    { label: "연락처", width: "150px", align: "center", render: (r) => html`<span class="staff-phone">${r.phone || "-"}</span>` },
    {
      label: "아이디", width: "112px", align: "center",
      render: (r) => (r.accountId
        ? html`<span class="staff-acct">${r.accountId}</span>`
        : html`<span class="staff-dept--empty">없음</span>`),
    },
    {
      label: "권한", width: "96px", align: "center",
      render: (r) => html`<span class="staff-role ${r.role === "최고관리자" ? "staff-role--su" : ""}">${r.role || "담당자"}</span>`,
    },
    {
      label: "알림 수신", width: "120px", align: "center",
      render: (r) => html`<button class="toggle" role="switch" aria-checked="${r.notify ? "true" : "false"}" data-action="toggle-notify" data-id="${r.id}" aria-label="${r.name} 알림 수신 ${r.notify ? "켜짐" : "꺼짐"}"><span class="toggle__knob"></span></button>`,
    },
    {
      label: "관리", width: "120px", align: "center",
      render: (r) => html`<div class="admin-rowact">
        <button class="tbl-edit" data-action="edit" data-id="${r.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>
        <button class="tbl-del" data-action="del" data-id="${r.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>
      </div>`,
    },
  ];
  function tableBody() {
    const rows = filtered();
    if (!rows.length) return html`<div class="admin-empty">조건에 맞는 담당자가 없습니다.</div>`;
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
  }

  function render() {
    setHTML(root, html`
      <div class="page-admin page-staff">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-profile.png",
            title: "담당자 계정·권한",
            action: html`<button class="btn btn-secondary" data-action="new">${icon("user-plus", { size: 14 })} 담당자 등록</button>`,
          })}
          <div class="bf-card">
            <div class="bf-row bf-row--tabs">
              <div class="bf-tabs" data-slot="tabs">${tabsBody()}</div>
            </div>
            <div class="bf-row bf-row--main">
              <div class="bf-srch bf-srch--grow">
                ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                <span class="bf-srch__lbl">담당자</span>
                <span class="bf-srch__dv"></span>
                <input type="text" data-search value="${state.search}" placeholder="이름·부서·연락처·아이디 검색" />
              </div>
            </div>
          </div>
          <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
          <div data-slot="table">${tableBody()}</div>
        </div>
      </div>
    `);
  }
  const refreshList = () => {
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    syncTabs();
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };

  /* ── 등록/수정 다이얼로그 (시안 #8 · 560px) ───────────────
     공용 셸은 js/util/dialog.js. 구역은 카드가 아니라 1.5px 룰 하나로 가른다.
     ⚠️ 입력 중에는 본문을 다시 그리지 않는다 — 섹션 캡션·토글 보조문구·푸터 힌트는
        각자 슬롯만 갈아 끼운다(재렌더하면 커서가 날아간다). */
  function openStaffModal(staff) {
    closeModal();
    const isEdit = !!staff;
    const form = isEdit
      ? { accountId: "", role: "담당자", ...staff }
      : { id: staffNewId(), name: "", dept: "", phone: "", notify: true, accountId: "", role: "담당자" };
    const isValid = () => !!form.name.trim() && !!form.phone.trim();
    const hasAcct = () => !!form.accountId.trim();
    /* 섹션 캡션은 장식이 아니라 "아이디를 비우면 어떻게 되는가"의 답이다 */
    const acctCap = () => (hasAcct() ? "로그인으로 콘솔에 접속합니다" : "아이디가 없으면 알림만 받습니다");
    /* 푸터 힌트는 막는 이유를 그 자리에서 말한다 — 버튼만 흐려 두지 않는다 */
    const hintText = () =>
      !isValid() ? "이름과 연락처는 필수입니다"
      : hasAcct() ? "로그인 계정과 함께 저장됩니다"
      : "로그인 없이 알림만 받는 담당자입니다";
    const ntSub = () => (form.notify ? "카카오 알림톡으로 배정·주문 알림을 받습니다" : "알림톡을 받지 않습니다");
    const onoff = (b) => (b ? "true" : "false");

    const body = html`
      <div data-sec="basic">
        ${dlgRule({ t: "기본 정보", cap: "주문 배정과 알림에 쓰입니다" })}
        <div class="dlg-rows">
          ${dlgRow({ k: "이름", req: true, v: html`<input class="ord-in" data-f="name" value="${form.name}" placeholder="예) 김총무" aria-label="이름" />` })}
          ${dlgRow({ k: "연락처", req: true, v: html`<input class="ord-in ord-in--num" data-f="phone" value="${form.phone}" inputmode="numeric" placeholder="010-0000-0000" aria-label="연락처" />` })}
          ${dlgRow({ k: "부서", v: html`<input class="ord-in ord-in--plain" data-f="dept" value="${form.dept}" placeholder="예) 총무팀 (자유 입력)" aria-label="부서" />` })}
        </div>
      </div>
      <div data-sec="acct">
        ${dlgRule({ t: "계정 · 권한", cap: acctCap() })}
        <div class="dlg-rows">
          ${dlgRow({ k: "접속 아이디", v: html`<input class="ord-in ord-in--plain" data-f="accountId" value="${form.accountId}" placeholder="비우면 로그인 없이 알림만 받습니다" aria-label="접속 아이디" />` })}
          ${dlgRow({ k: "권한", v: html`<div class="dd" data-dd-role>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="권한"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>` })}
          ${dlgRow({ k: "비밀번호", v: html`<button type="button" class="dlg-minibtn" data-action="reset-pw">임시비밀번호 발급</button>` })}
        </div>
        <p class="dlg-hintline" data-pwout>관리자도 기존 비밀번호는 볼 수 없습니다. 발급 후 저장하면 적용됩니다.</p>
      </div>
      <button type="button" class="dlg-tgl" role="switch" aria-checked="${onoff(form.notify)}" data-action="modal-notify">
        <span>
          <b class="dlg-tgl__t">알림 수신</b>
          <span class="dlg-tgl__s" data-slot="ntsub">${ntSub()}</span>
        </span>
        <span class="toggle" aria-checked="${onoff(form.notify)}" aria-hidden="true"><span class="toggle__knob"></span></span>
      </button>
    `;

    /* 권한 드롭다운은 모달마다 생성 → 닫힐 때 destroy (makeDropdown 규약) */
    let roleDd = null;
    const dlg = openDialog({
      width: 560,
      bodyClass: "dlg-body--sections",
      eyebrow: "담당자 계정 · 권한",
      title: isEdit ? `${form.name || "담당자"} 담당자 수정` : "새 담당자를 추가합니다",
      body,
      hint: hintText(),
      hintBlock: !isValid(),
      actions: dlgActions({ ok: isEdit ? "저장" : "등록", disabled: !isValid() }),
      onClose: () => { activeModal = null; if (roleDd) { roleDd.destroy(); roleDd = null; } },
    });
    activeModal = dlg;
    const panel = dlg.panel;
    const roleEl = qs(panel, "[data-dd-role]");
    if (roleEl) {
      roleDd = makeDropdown(roleEl, {
        options: () => STAFF_ROLES,
        get: () => form.role,
        set: (v) => { form.role = v; },
      });
    }
    /* 임시비밀번호 — 화면에 1회만 표시하고 저장 시 적용(admin-clients 와 같은 규약).
       실서비스에서는 서버가 해시를 저장하고 재설정 링크를 보내야 한다. */
    on(panel, "click", "[data-action='reset-pw']", () => {
      const CH = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let pw = "";
      for (let i = 0; i < 10; i++) pw += CH[Math.floor(Math.random() * CH.length)];
      form.password = pw;
      const out = qs(panel, "[data-pwout]");
      if (out) out.textContent = `임시비밀번호 ${pw} — 저장해야 적용됩니다. 이 창을 닫으면 다시 볼 수 없습니다.`;
      toast("임시비밀번호를 발급했습니다");
    });
    const syncFoot = () => {
      const b = qs(panel, "[data-action='ok']");
      if (b) b.disabled = !isValid();
      dlg.setHint(hintText(), !isValid());
    };
    const syncAcctCap = () => {
      const cap = qs(panel, "[data-sec='acct'] .dlg-rule__cap");
      if (cap) cap.textContent = acctCap();
    };
    on(panel, "input", "[data-f]", (e, t) => {
      const k = t.dataset.f;
      form[k] = k === "phone" ? onPhoneInput(t) : t.value;
      if (k === "accountId") syncAcctCap();
      syncFoot();
    });
    on(panel, "click", "[data-action='modal-notify']", (e, t) => {
      form.notify = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", onoff(form.notify));
      const sw = qs(t, ".toggle");
      if (sw) sw.setAttribute("aria-checked", onoff(form.notify));
      const sub = qs(t, "[data-slot='ntsub']");
      if (sub) sub.textContent = ntSub();
    });
    on(panel, "click", "[data-action='ok']", () => {
      if (!isValid()) return;
      const rec = { ...form, name: form.name.trim(), dept: form.dept.trim(), phone: form.phone.trim(), accountId: form.accountId.trim() };
      const idx = rowIndex(rec.id, "edit");
      if (isEdit) staffUpdate(rec); else staffAdd(rec);
      closeModal();
      refreshList();
      /* 수정이면 창이 돌려준 연필이 방금 다시 그려졌다 — 같은 사람 줄의 새 연필로(아이디를 지워 '로그인 계정' 탭에서
         빠졌으면 그 자리에 올라온 줄). 등록은 창을 연 '담당자 등록' 이 표 밖이라 그대로 남는다. */
      focusRow(rec.id, "edit", idx, "[data-action='new']");
      toast(isEdit ? "담당자 정보를 저장했습니다" : `${rec.name} 담당자를 등록했습니다`);
    });
  }

  /* ── 삭제 다이얼로그 (시안 #9 · 440px) ────────────────────
     에어브로가 "누구를 지우는지"를 말하므로 본문은 결과만 설명한다. */
  function openDelete(staff) {
    closeModal();
    const dlg = openDialog({
      width: 440,
      eyebrow: [staff.dept, staff.phone].filter(Boolean).join(" · "),
      title: `${staff.name} 담당자를 삭제할까요?`,
      body: html`<p class="dlg-desc"><b>삭제 후에는 되돌릴 수 없습니다.</b> 기존 주문에 이미 지정된 담당자 이름은 그대로 남고, 앞으로의 배정 목록과 알림 대상에서만 빠집니다.</p>`,
      hint: "배정 이력은 유지됩니다",
      actions: dlgActions({ ok: "담당자 삭제", okClass: "hm-btn--danger" }),
      onClose: () => { activeModal = null; },
    });
    activeModal = dlg;
    on(dlg.panel, "click", "[data-action='ok']", () => {
      const idx = rowIndex(staff.id, "edit");
      staffRemove(staff.id);
      closeModal();
      refreshList();
      focusRow(staff.id, "edit", idx, "[data-action='new']"); // 그 자리에 올라온 줄의 연필 · 표가 비면 '담당자 등록'
      toast(`${staff.name} 담당자를 삭제했습니다`, "warn");
    });
  }

  render();

  /* ── 목록 이벤트 (위임 · root 유지) ────────────────────── */
  const findStaff = (id) => staffList().find((s) => s.id === id);
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; } // 탭은 syncTabs 로 제자리 갱신 — 누른 탭에 초점이 남는다
    if (a === "new") return openStaffModal(null);
    if (a === "toggle-notify") {
      const s = findStaff(t.dataset.id);
      if (!s) return;
      const idx = rowIndex(s.id, "toggle-notify");
      staffSetNotify(s.id, !s.notify);
      if (state.tab === "on" || state.tab === "off") {
        /* '알림 수신/거부' 탭이면 이 줄이 조건에서 빠진다 — 표를 다시 그리고 그 자리에 올라온 줄의 토글로(표가 비면 지금 탭) */
        refreshList();
        focusRow(s.id, "toggle-notify", idx, ".bf-tab.is-active");
      } else {
        /* 줄이 남는 탭이면 표를 다시 그리지 않고 **그 토글 하나만** 바꾼다 — 다시 그리면 누른 토글이 DOM 에서 떨어져
           초점이 body 로 빠졌다(2026-10-19 실측 · 다음 Tab 은 첫 줄 토글). 줄에서 알림 수신에 매인 것은 이 토글뿐이고
           '조회 N명' 도 그대로다 — 탭 건수만 맞춘다. */
        t.setAttribute("aria-checked", s.notify ? "true" : "false");
        t.setAttribute("aria-label", `${s.name} 알림 수신 ${s.notify ? "켜짐" : "꺼짐"}`);
        syncTabs();
      }
      toast(`${s.name} 알림 수신을 ${s.notify ? "켰습니다" : "껐습니다"}`);
      return;
    }
    const s = findStaff(t.dataset.id);
    if (!s) return;
    if (a === "edit") openStaffModal(s);
    else if (a === "del") openDelete(s);
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });
  /* ⚠️ Enter 를 누른 채로 두면 자동 반복 keydown 마다 **초점이 있는 버튼**이 다시 눌린다. 토글은 이제 초점을 지키므로
     (같은 토글 · '알림 수신/거부' 탭에서는 그 자리에 올라온 줄의 토글) 꾹 누른 Enter 한 번이 '알림 수신' 탭의 모든 사람을
     차례로 끄거나(실측: 5명 → 0명) '전체' 탭에서 같은 토글을 반복 횟수만큼 뒤집었다. 반복 keydown 의 Enter 를 버린다 —
     떼었다 다시 누르면 그대로 눌린다(담당자 관리 창 · 포털 담당자 저장공간과 같은 처리). Space 는 뗄 때 한 번만 눌려 해당 없다. */
  const offKey = on(root, "keydown", "[data-action='toggle-notify']", (e) => {
    if (e.repeat && e.key === "Enter") e.preventDefault();
  });

  return () => {
    offClick(); offSearch(); offKey();
    closeModal();
    toast.destroy();
  };
}
