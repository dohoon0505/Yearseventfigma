/* ============================================================
   login.js — ports Login.tsx. No real auth (DEMO): 거래처 계정은 아이디가 맞고
   상태가 '활성'이며 약관에 동의했을 때만 #/app 으로 들어간다.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { resolveRole, setRole, clearRole, setClientId, takeReturnTo, takeLoginNotice } from "../session.js";
import { store } from "../store.js";
import { openTermsDialog, termsStamp } from "../util/terms-dialog.js";
import { TERMS_VERSION } from "../data/terms.js";
import { portalBlock } from "../util/client.js";

const STATS = [
  { value: "2,400+", label: "제휴 기업" },
  { value: "98%", label: "재계약률" },
  { value: "1일", label: "평균 배송" },
];

export function mount(root, { nav }) {
  let showPassword = false;

  setHTML(
    root,
    html`
      <div class="auth">
        <!-- 좌측 다크 브랜드 패널 -->
        <aside class="auth__brand">
          <div class="auth__brand-logo">
            <img src="./assets/logo.png" alt="올해의경조사" />
          </div>
          <div class="auth__brand-body">
            <p class="auth__eyebrow">Enterprise Service</p>
            <h2 class="auth__headline">
              기업에서 발생하는<br />모든 경조사,<br />한 곳에서 관리
            </h2>
            <p class="auth__subcopy">
              화환·화분·꽃 맞춤형 전담서비스를<br />직접 경험해보세요.
            </p>
            <div class="auth__stats">
              ${STATS.map(
                (s) => html`
                  <div class="auth__stat">
                    <p class="auth__stat-value">${s.value}</p>
                    <p class="auth__stat-label">${s.label}</p>
                  </div>
                `
              )}
            </div>
          </div>
          <div class="auth__brand-foot">
            <p class="auth__brand-foot-q">아직 계정이 없으신가요?</p>
            <button type="button" class="auth__brand-foot-link" data-action="register">
              제휴기업 회원가입 ${icon("arrow-right", { size: 11 })}
            </button>
          </div>
        </aside>

        <!-- 우측 폼 패널 -->
        <div class="auth__panel">
          <div class="auth__panel-inner">
            <div class="auth__topbar">
              <img class="auth__topbar-logo" src="./assets/logo.png" alt="올해의경조사" />
              <button type="button" class="auth__topbar-link" data-action="register">
                회원가입 ${icon("arrow-right", { size: 11 })}
              </button>
            </div>

            <div class="auth__form-wrap">
              <div class="auth__form-col">
                <div class="auth__title">
                  <h1>로그인</h1>
                  <p>아이디와 비밀번호를 입력해주세요</p>
                </div>

                <form class="login-card" data-form="login" novalidate>
                  <div class="login-card__head">
                    <h3>계정 로그인</h3>
                    <p>제휴기업 아이디로 로그인하세요</p>
                  </div>
                  <div class="login-card__body">
                    <div data-slot="error"></div>

                    <div class="auth-field">
                      <label class="auth-field__label" for="login-id">아이디</label>
                      <input
                        class="auth-field__input"
                        id="login-id"
                        name="id"
                        type="text"
                        placeholder="아이디를 입력해주세요"
                        autocomplete="username"
                      />
                    </div>

                    <div class="auth-field">
                      <label class="auth-field__label" for="login-pw">비밀번호</label>
                      <div class="auth-field__pw">
                        <input
                          class="auth-field__input"
                          id="login-pw"
                          name="password"
                          type="password"
                          placeholder="비밀번호를 입력해주세요"
                          autocomplete="current-password"
                        />
                        <button
                          type="button"
                          class="auth-field__eye"
                          data-action="toggle-pw"
                          aria-label="비밀번호 표시"
                          aria-pressed="false"
                        >
                          ${icon("eye", { size: 16 })}
                        </button>
                      </div>
                    </div>

                    <button type="submit" class="auth__submit">로그인</button>
                  </div>
                </form>

                <div class="auth__divider-block">
                  <div class="auth__divider">
                    <span class="auth__divider-line"></span>
                    <span class="auth__divider-text">또는</span>
                    <span class="auth__divider-line"></span>
                  </div>
                  <button type="button" class="auth__alt-btn" data-action="register">
                    제휴기업 회원가입
                  </button>
                </div>

                <p class="auth__help">
                  로그인에 문제가 있으신가요?
                  <button type="button" class="auth__help-link">고객센터 문의</button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  );

  const form = qs(root, "[data-form='login']");
  const errorSlot = qs(root, "[data-slot='error']");
  const pwInput = qs(root, "#login-pw");
  const eyeBtn = qs(root, "[data-action='toggle-pw']");

  function clearError() {
    errorSlot.innerHTML = "";
  }
  function showError(msg) {
    setHTML(
      errorSlot,
      html`
        <div class="login-error" role="alert" aria-live="assertive">
          ${icon("alert-circle", { size: 14 })}
          <p>${msg}</p>
        </div>
      `
    );
  }

  let termsDlg = null;
  /* 로그인 전에 들어오려던 주소가 있으면 거기로(딥링크 복귀, 2026-09-17). 역할과 맞는 영역일 때만 —
     거래처 계정이 관리자 주소를 남겨 뒀다고 관리자로 보내면 안 된다. 관리자는 포털도 볼 수 있다. */
  const landingFor = (role) => {
    const back = takeReturnTo();
    const home = role === "admin" ? "#/admin" : "#/app";
    if (!back) return home;
    if (role === "admin") return back;
    return back.startsWith("#/app") ? back : home;
  };
  /* 거래처 계정에 역할을 주는 곳은 **여기 하나**다 — 약관 게이트를 지난 뒤에만 부른다. */
  const enterPortal = (c) => {
    setRole("enterprise");
    setClientId(c.id);
    nav(landingFor("enterprise"));
  };

  /* 라우터가 세션을 끊고 보냈으면(로그인 뒤 정지·반려·삭제) 그 이유를 한 번 말한다. */
  const notice = takeLoginNotice();
  if (notice) showError(notice);

  const offSubmit = on(form, "submit", (e) => {
    e.preventDefault();
    const id = form.elements.id.value.trim();
    const pw = form.elements.password.value.trim();
    if (!id || !pw) {
      showError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    clearError();
    /* 로그인 시도는 새 세션이다 — 앞 세션(관리자 등)이 실패한 시도 뒤에 섞여 남지 않게 먼저 끊는다. */
    clearRole();
    if (resolveRole(id, pw) === "admin") {
      setRole("admin");
      nav(landingFor("admin"));
      return;
    }
    /* 거래처 계정은 **아이디로만** 찾는다(2026-09-25 결정 · 명세 6.2). 예전엔 무엇을 넣든 enterprise 로
       통과시켜, 모르는 아이디나 사업자번호가 util/client.js 의 첫 거래처 폴백으로 태원과학 포털에
       들어갔다 — 뉴트리 사업자번호를 넣으면 태원과학 명세서가 보였다.
       이관 시드에는 비밀번호가 없다(관리자가 읽을 수 없는 구조 — admin-clients 참조). 그래서 시드 계정은
       아이디만 맞으면 통과시키고, 셀프 가입으로 만든 레코드만 저장된 비밀번호를 검사한다.
       DEMO 게이트이며 실서비스에서는 서버가 검증한다. */
    const c = store.get().clients.find((x) => x.accountId === id && (!x.password || x.password === pw));
    /* 아이디가 있는지 없는지는 말하지 않는다(명세 6.2 AUTH_FAILED). */
    if (!c) {
      showError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    /* 승인대기·반려·정지는 로그인 자체를 막는다(2026-09-25 결정). 자격 증명이 맞은 뒤에 보므로
       상태를 알려 줘도 계정 존재가 새지 않는다. */
    const block = portalBlock(c);
    if (block) {
      showError(block);
      return;
    }
    /* 이용약관 동의 게이트(2026-09-17 결정) — 이관 거래처 19곳은 가입 절차가 없어 동의 기록이 없다.
       첫 로그인에 한 번 받고, 약관 버전이 오르면 다시 받는다. ⚠️ 역할은 **동의한 뒤에** 준다 —
       먼저 주면 게이트가 떠 있는 동안 주소창으로 포털에 들어갈 수 있었다(라우터 가드는 역할만 본다). */
    if (c.termsVersion !== TERMS_VERSION) {
      termsDlg = openTermsDialog({
        gate: true,
        onAgree: () => {
          termsDlg = null;
          store.updateClient({ ...c, termsAgreedAt: termsStamp(), termsVersion: TERMS_VERSION });
          enterPortal(c);
        },
        onClose: () => {
          termsDlg = null;
          showError("이용약관에 동의해야 서비스를 이용할 수 있습니다.");
        },
      });
      return;
    }
    enterPortal(c);
  });

  const offInput = on(form, "input", "input", () => clearError());

  const offEye = on(eyeBtn, "click", () => {
    showPassword = !showPassword;
    pwInput.type = showPassword ? "text" : "password";
    eyeBtn.setAttribute("aria-pressed", String(showPassword));
    eyeBtn.setAttribute("aria-label", showPassword ? "비밀번호 숨김" : "비밀번호 표시");
    setHTML(eyeBtn, icon(showPassword ? "eye-off" : "eye", { size: 16 }));
  });

  const offNav = on(root, "click", "[data-action='register']", () =>
    nav("#/register")
  );

  return () => {
    if (termsDlg) termsDlg.close();
    offSubmit();
    offInput();
    offEye();
    offNav();
  };
}
