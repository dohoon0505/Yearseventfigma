/* ============================================================
   register.js — ports Register.tsx (3-step wizard + done screen)
   ============================================================ */
import { html, raw, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, newContactId } from "../store.js";
import { openTermsDialog, termsStamp } from "../util/terms-dialog.js";
import { TERMS_VERSION } from "../data/terms.js";
import { attachmentOf, fileSizeLabel } from "../util/image.js";

const STEPS = ["계정 설정", "담당자 정보", "사업자 정보"];
const BENEFITS = [
  "신규 가입 기업 경조사 상품 1회 무료 제공",
  "실시간 주문·배송 현황 통합 관리",
  "거래명세서·계산서 자동 발급 및 월 후불 정산",
  "전담 운영팀 기업 맞춤 1:1 지원",
];

function pwStrength(p) {
  if (!p) return null;
  if (p.length < 4) return { level: 0, label: "너무 짧음", color: "var(--c-error-border)" };
  if (p.length < 8) return { level: 1, label: "약함", color: "var(--c-strength-weak)" };
  if (/[^a-zA-Z0-9]/.test(p) && /[0-9]/.test(p) && /[a-zA-Z]/.test(p))
    return { level: 3, label: "강함", color: "var(--c-strength-strong)" };
  return { level: 2, label: "보통", color: "var(--c-orange)" };
}

export function mount(root, { nav }) {
  const state = {
    step: 1, // 1 | 2 | 3 | "done"
    showPw: false,
    showPwC: false,
    errors: {},
    form: {
      userId: "", password: "", passwordConfirm: "",
      managerName: "", department: "", contact: "",
      bizNumber: "", companyName: "", ceoName: "", address: "", email: "",
      /* 사업자등록증 — 관리자가 승인 전에 확인할 증빙. 이미지는 축소해 보관하고
         PDF 는 파일명만 남긴다(실서비스에서는 서버 업로드 후 URL 만 저장). */
      bizLicense: null,
      /* 이용약관 동의 — 사업자등록증과 같은 게이트다. 체크 없이는 가입이 끝나지 않는다(2026-09-17 결정). */
      termsAgreed: false,
    },
  };
  let termsDlg = null;

  // ── field factory ──────────────────────────────────────
  function field({ label, name, type = "text", placeholder, hint, eye }) {
    const err = state.errors[name];
    const val = state.form[name];
    const inputType = eye ? (state[eye] ? "text" : "password") : type;
    return html`
      <div class="rf" data-field="${name}">
        <label class="rf__label" for="rf-${name}">${label}</label>
        <div class="rf__wrap">
          <input
            class="rf__input ${err ? "is-error" : ""} ${eye ? "has-suffix" : ""}"
            id="rf-${name}"
            name="${name}"
            type="${inputType}"
            placeholder="${placeholder}"
            value="${val}"
          />
          ${eye
            ? html`<button
                type="button"
                class="rf__eye"
                data-action="toggle-pw"
                data-eye="${eye}"
                aria-label="비밀번호 표시"
                aria-pressed="${String(state[eye])}"
              >
                ${icon(state[eye] ? "eye-off" : "eye", { size: 16 })}
              </button>`
            : ""}
        </div>
        ${err
          ? html`<p class="rf__msg rf__msg--error">
              ${icon("alert-circle", { size: 11 })} ${err}
            </p>`
          : hint
          ? html`<p class="rf__hint">${hint}</p>`
          : ""}
      </div>
    `;
  }

  // ── per-step body ──────────────────────────────────────
  function strengthBlock() {
    const s = pwStrength(state.form.password);
    if (!s) return "";
    const bars = [0, 1, 2, 3]
      .map(
        (i) =>
          `<div class="rf-strength__bar" style="background:${
            i <= s.level ? s.color : "var(--c-fill-3)"
          }"></div>`
      )
      .join("");
    return html`<div class="rf-strength__bars">${raw(bars)}</div>
      <p class="rf-strength__label" style="color:${s.color}">
        비밀번호 강도: ${s.label}
      </p>`;
  }

  function matchBlock() {
    const { password, passwordConfirm } = state.form;
    if (passwordConfirm && !state.errors.passwordConfirm && password === passwordConfirm) {
      return html`<p class="rf-match">
        ${icon("check", { size: 11 })} 비밀번호가 일치합니다
      </p>`;
    }
    return "";
  }

  function stepBody() {
    if (state.step === 1) {
      return html`
        ${field({ label: "접속 아이디", name: "userId", placeholder: "4자 이상의 아이디를 입력해주세요", hint: "영문 소문자와 숫자 조합을 권장합니다" })}
        ${field({ label: "접속 비밀번호", name: "password", placeholder: "8자 이상 입력해주세요", eye: "showPw" })}
        <div class="rf-strength" data-slot="strength">${strengthBlock()}</div>
        ${field({ label: "비밀번호 확인", name: "passwordConfirm", placeholder: "비밀번호를 한번 더 입력해주세요", eye: "showPwC" })}
        <div data-slot="match">${matchBlock()}</div>
      `;
    }
    if (state.step === 2) {
      return html`
        ${field({ label: "경조사 담당자명", name: "managerName", placeholder: "담당자 성명을 입력해주세요" })}
        ${field({ label: "부서·직위", name: "department", placeholder: "예) 총무팀 / 인사부 대리 / 영업본부 팀장" })}
        ${field({ label: "담당자 연락처", name: "contact", placeholder: "010-0000-0000" })}
        <div class="rf-note">
          ${icon("info", { size: 13 })}
          <p>담당자 정보는 주문 접수, 서비스 운영, 가입 승인 안내 등 중요 연락에 활용됩니다.</p>
        </div>
      `;
    }
    // step 3
    return html`
      <div class="rf-grid2">
        ${field({ label: "사업자번호", name: "bizNumber", placeholder: "000-00-00000" })}
        ${field({ label: "회사명", name: "companyName", placeholder: "법인명을 입력해주세요" })}
      </div>
      ${field({ label: "대표자명", name: "ceoName", placeholder: "대표자 성명을 입력해주세요" })}
      ${field({ label: "사업장 소재지", name: "address", placeholder: "사업자등록증 상의 주소를 입력해주세요" })}
      ${field({ label: "계산서 수신 이메일", name: "email", type: "email", placeholder: "계산서를 수신할 이메일 주소" })}
      <div class="rf" data-field="bizLicense">
        <label class="rf__label">사업자등록증<span class="rf__req">*</span></label>
        <input type="file" accept="image/*,application/pdf" data-license-input hidden />
        <button type="button" class="rf-file" data-action="pick-license">
          ${state.form.bizLicense
            ? html`<span class="rf-file__name">${state.form.bizLicense.name} · ${fileSizeLabel(state.form.bizLicense.size)}</span><span class="rf-file__re">다시 선택</span>`
            : html`<span class="rf-file__name rf-file__name--empty">파일을 선택해주세요 (이미지 또는 PDF)</span><span class="rf-file__re">파일 선택</span>`}
        </button>
        <p class="rf__hint">가입 승인 심사에 쓰입니다. 사업자번호·대표자명이 등록증과 일치해야 합니다.</p>
      </div>
      <button type="button" class="rf-sign">
        <span class="rf-sign__l">${icon("check-circle", { size: 14 })} 계약서 전자서명</span>
        <span class="rf-sign__r">서명하기 ${icon("arrow-right", { size: 10 })}</span>
      </button>
      <!-- 이용약관 동의 — 자동 동의 조항(data/terms.js)을 읽고 체크해야 가입이 끝난다(2026-09-17 결정).
           공용 .dlg-check 를 그대로 쓴다(계산서 발급 동의·삭제 확인과 같은 장치). 재렌더 없이 클래스만 토글. -->
      <div class="rf rf--agree" data-field="termsAgreed">
        <button type="button" class="dlg-check ${state.form.termsAgreed ? "is-on" : ""}" data-action="terms-ack" aria-pressed="${state.form.termsAgreed ? "true" : "false"}">
          <span class="dlg-check__box" aria-hidden="true"></span>
          <span>이용약관(거래명세서·계산서 발급 동의 조항)을 읽었고 동의합니다</span>
        </button>
        <div class="rf--agree__row">
          <button type="button" class="rf__link" data-action="terms-view">약관 보기</button>
          ${state.errors.termsAgreed ? html`<p class="rf__msg rf__msg--error">${icon("alert-circle", { size: 11 })} ${state.errors.termsAgreed}</p>` : ""}
        </div>
      </div>
    `;
  }

  const cardHead = {
    1: ["계정 정보 설정", "서비스 접속에 사용할 아이디와 비밀번호를 설정해주세요"],
    2: ["경조사 담당자 정보", "서비스를 관리할 담당자 정보를 입력해주세요"],
    3: ["사업자 정보", "거래명세서 및 계약 처리에 필요한 사업자 정보를 입력해주세요"],
  };

  function stepIndicator() {
    const cur = typeof state.step === "number" ? state.step : 4;
    return STEPS.map((label, i) => {
      const num = i + 1;
      const done = cur > num;
      const active = cur === num;
      const dotCls = done ? "is-done" : active ? "is-current" : "is-todo";
      const lblCls = active ? "is-current" : done ? "is-done" : "is-todo";
      const dot = done ? icon("check", { size: 11 }) : num;
      const line =
        i < STEPS.length - 1
          ? html`<div class="rstep__line ${done ? "is-done" : ""}"></div>`
          : "";
      return html`
        <div class="rstep">
          <div class="rstep__col">
            <div class="rstep__dot ${dotCls}">${dot}</div>
            <span class="rstep__label ${lblCls}">${label}</span>
          </div>
          ${line}
        </div>
      `;
    });
  }

  function doneScreen() {
    const f = state.form;
    const rows = [
      ["아이디", f.userId],
      ["담당자", f.managerName],
      ["연락처", f.contact],
      ["회사명", f.companyName],
    ];
    return html`
      <div class="rdone">
        <div class="rdone__icon">${icon("check", { size: 28 })}</div>
        <h2 class="rdone__title">가입이 완료되었습니다</h2>
        <p class="rdone__sub">
          ${f.companyName ? html`<strong>${f.companyName}</strong>으로 ` : ""}제휴기업
          회원 등록이 완료되었습니다.<br />담당자 검토 후 승인 안내를 드리며, 승인 후에 로그인할 수 있습니다.
        </p>
        <div class="rdone__card">
          <div class="rdone__card-head"><h4>가입 정보</h4></div>
          ${rows.map(
            ([label, value]) => html`
              <div class="rdone__row">
                <span class="rdone__row-l">${label}</span>
                <span class="rdone__row-v">${value || "—"}</span>
              </div>
            `
          )}
        </div>
        <div class="rdone__note">
          ${icon("info", { size: 14 })}
          <p>
            승인 완료 후 경조사 상품을 <strong>1회 무료</strong>로 이용하실 수
            있습니다. 담당자 연락처(${f.contact})로 안내가 전송됩니다.
          </p>
        </div>
        <button type="button" class="rdone__btn" data-action="to-login">
          로그인 페이지로 이동
        </button>
      </div>
    `;
  }

  function renderWizard() {
    const wizard = qs(root, "[data-slot='wizard']");
    if (state.step === "done") {
      setHTML(wizard, doneScreen());
      return;
    }
    const [h3, desc] = cardHead[state.step];
    setHTML(
      wizard,
      html`
        <div class="auth__title">
          <h1>제휴기업 회원가입</h1>
          <p>모든 항목을 정확하게 입력해주세요</p>
        </div>
        <div class="rstep-bar">${stepIndicator()}</div>
        <form class="login-card" data-form="step" novalidate>
          <div class="login-card__head">
            <h3>${h3}</h3>
            <p>${desc}</p>
          </div>
          <div class="login-card__body">${stepBody()}</div>
        </form>
        <div class="rbtns">
          ${state.step > 1
            ? html`<button type="button" class="rbtn rbtn--prev" data-action="prev">이전</button>`
            : ""}
          <button type="button" class="rbtn rbtn--next" data-action="next">
            ${state.step === 3 ? "가입 완료하기" : "다음 단계"}
          </button>
        </div>
        <p class="rstep-count">${state.step} / 3 단계</p>
      `
    );
  }

  // ── validation (ports check / next) ────────────────────
  function check(rules) {
    const next = {};
    for (const [k, msg] of Object.entries(rules)) {
      if (!state.form[k].trim()) next[k] = msg;
    }
    if (!next.password && state.step === 1 && state.form.password && state.form.password.length < 8)
      next.password = "8자 이상 입력해주세요";
    if (!next.passwordConfirm && state.step === 1 && state.form.passwordConfirm && state.form.password !== state.form.passwordConfirm)
      next.passwordConfirm = "비밀번호가 일치하지 않습니다";
    if (!next.email && state.step === 3 && state.form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.form.email))
      next.email = "올바른 이메일 형식으로 입력해주세요";
    /* 접속 아이디는 유일해야 한다 — 로그인이 아이디 하나로 거래처를 가린다(2026-09-25 · 명세 5.2 UNIQUE).
       예전엔 검사가 없어 이관 계정과 같은 아이디로 가입하면 그 계정은 영영 로그인할 수 없었다. */
    if (!next.userId && state.step === 1 && store.accountIdTaken(state.form.userId))
      next.userId = "이미 사용 중인 아이디입니다";
    state.errors = next;
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (state.step === 1 && check({ userId: "아이디를 입력해주세요", password: "비밀번호를 입력해주세요", passwordConfirm: "비밀번호를 확인해주세요" })) state.step = 2;
    else if (state.step === 2 && check({ managerName: "담당자명을 입력해주세요", department: "부서·직위를 입력해주세요", contact: "연락처를 입력해주세요" })) state.step = 3;
    else if (state.step === 3) {
      const ok = check({ bizNumber: "사업자번호를 입력해주세요", companyName: "회사명을 입력해주세요", ceoName: "대표자명을 입력해주세요", address: "소재지를 입력해주세요", email: "이메일을 입력해주세요" });
      /* 사업자등록증은 승인 심사의 근거다 — 없으면 관리자가 무엇을 보고 승인할지가 없다. */
      if (!state.form.bizLicense) { state.errors.bizLicense = "사업자등록증을 첨부해주세요"; renderWizard(); return; }
      if (!state.form.termsAgreed) { state.errors.termsAgreed = "이용약관에 동의해주세요"; renderWizard(); return; }
      if (ok) {
        registerClient(); // 신규 가입 → 거래처 '승인대기'로 등록 (어드민 승인 대상)
        state.step = "done";
      }
    }
    renderWizard();
  }

  function registerClient() {
    const f = state.form;
    const clients = store.get().clients;
    const max = clients.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
    const id = "C" + String(max + 1).padStart(3, "0");
    const d = new Date();
    const joinDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    store.addClient({
      id, accountId: f.userId.trim(), password: f.password, // 로그인이 아이디를 trim 해 비교한다
      companyName: f.companyName, bizNumber: f.bizNumber, ceoName: f.ceoName,
      managerName: f.managerName, department: f.department, contact: f.contact,
      email: f.email, address: f.address, status: "승인대기", joinDate, invoiceDay: "1", clientNote: "",
      bizLicense: f.bizLicense,
      termsAgreedAt: termsStamp(), termsVersion: TERMS_VERSION,
      /* 셀프 가입은 영업 경로가 'SNS·홈페이지'로 고정된다 — 관리자가 등록하면 비어 있다. */
      salesRoute: "셀프 가입", salesMemo: "", salesDate: joinDate,
    });
    /* 최초 정산·회계 담당자 = 회원가입 시 작성한 담당자.
       ⚠️ 담당자는 거래처별이다 — 로그인 거래처가 아니라 **방금 만든 거래처(id)** 버킷에 넣는다.
       버킷의 첫 담당자라 setContactsOf 의 불변식이 자동으로 정산담당으로 지정한다. */
    store.setContactsOf(id, [{
      id: newContactId(), name: f.managerName, role: f.department, phone: f.contact,
      message: MSG_RECEIVE, isBilling: true,
    }]);
  }

  function goPrev() {
    if (state.step === 2) state.step = 1;
    else if (state.step === 3) state.step = 2;
    renderWizard();
  }

  // ── static shell (brand panel + topbar) ────────────────
  setHTML(
    root,
    html`
      <div class="auth register">
        <aside class="auth__brand">
          <div class="auth__brand-logo">
            <img src="./assets/logo.png" alt="올해의경조사" />
          </div>
          <div class="auth__brand-body">
            <p class="auth__eyebrow">Enterprise Service</p>
            <h2 class="auth__headline">기업 경조사 관리,<br />더 스마트하게</h2>
            <p class="auth__subcopy">
              임직원 경조사 서비스를 하나의 플랫폼으로<br />통합 관리하세요.
            </p>
            <ul class="auth__benefits">
              ${BENEFITS.map(
                (t) => html`<li><span class="auth__benefit-dot"></span><span>${t}</span></li>`
              )}
            </ul>
          </div>
          <div class="auth__brand-foot">
            <p class="auth__brand-foot-q">이미 계정이 있으신가요?</p>
            <button type="button" class="auth__brand-foot-link" data-action="to-login">
              로그인하기 ${icon("arrow-right", { size: 11 })}
            </button>
          </div>
        </aside>

        <div class="auth__panel">
          <div class="auth__panel-inner">
            <div class="auth__topbar register__topbar">
              <img class="auth__topbar-logo" src="./assets/logo.png" alt="올해의경조사" />
              <button type="button" class="auth__topbar-link" data-action="to-login">
                ${icon("chevron-left", { size: 13 })} 로그인으로 돌아가기
              </button>
            </div>
            <div class="auth__form-wrap register__wrap">
              <div class="register__col" data-slot="wizard"></div>
            </div>
          </div>
        </div>
      </div>
    `
  );

  renderWizard();

  // ── events (delegated on stable root) ──────────────────
  const offInput = on(root, "input", "input", (e, input) => {
    const name = input.name;
    if (!(name in state.form)) return;
    state.form[name] = input.value;

    // clear this field's error visually (matches set()'s clear-on-change)
    if (state.errors[name]) {
      delete state.errors[name];
      const wrap = input.closest(".rf");
      if (wrap) {
        input.classList.remove("is-error");
        const msg = qs(wrap, ".rf__msg--error");
        if (msg) msg.remove();
      }
    }

    // live strength + match updates (step 1)
    if (state.step === 1) {
      if (name === "password") {
        const slot = qs(root, "[data-slot='strength']");
        if (slot) setHTML(slot, strengthBlock());
      }
      if (name === "password" || name === "passwordConfirm") {
        const slot = qs(root, "[data-slot='match']");
        if (slot) setHTML(slot, matchBlock());
      }
    }
  });

  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const action = t.dataset.action;
    if (action === "to-login") nav("#/login");
    else if (action === "next") goNext();
    else if (action === "prev") goPrev();
    else if (action === "terms-ack") {
      state.form.termsAgreed = !state.form.termsAgreed;
      t.classList.toggle("is-on", state.form.termsAgreed);
      t.setAttribute("aria-pressed", String(state.form.termsAgreed));
      if (state.form.termsAgreed && state.errors.termsAgreed) {
        delete state.errors.termsAgreed;
        const er = qs(root, "[data-field='termsAgreed'] .rf__msg");
        if (er) er.remove();
      }
    } else if (action === "terms-view") {
      termsDlg = openTermsDialog({ onClose: () => { termsDlg = null; } });
    } else if (action === "pick-license") {
      const inp = qs(root, "[data-license-input]");
      if (inp) inp.click();
    } else if (action === "toggle-pw") {
      const key = t.dataset.eye; // showPw | showPwC
      state[key] = !state[key];
      const input = qs(t.closest(".rf"), "input");
      input.type = state[key] ? "text" : "password";
      t.setAttribute("aria-pressed", String(state[key]));
      setHTML(t, icon(state[key] ? "eye-off" : "eye", { size: 16 }));
    }
  });

  /* 첨부 선택 — 이미지는 축소해 보관한다(localStorage 용량). 실패해도 이름·용량은 남는다. */
  const offFile = on(root, "change", "[data-license-input]", async (e, t) => {
    const file = t.files && t.files[0];
    t.value = ""; // 같은 파일 재선택이 먹히도록
    if (!file) return;
    state.form.bizLicense = await attachmentOf(file);
    delete state.errors.bizLicense;
    renderWizard();
  });

  return () => {
    if (termsDlg) termsDlg.close();
    offInput();
    offClick();
    offFile();
  };
}
