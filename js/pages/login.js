/* ============================================================
   login.js — ports Login.tsx (no real auth; validates → #/app)
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { resolveRole, setRole, setClientId, clearClientId } from "../session.js";
import { store } from "../store.js";

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
                    <p>제휴기업 아이디 또는 사업자번호로 로그인하세요</p>
                  </div>
                  <div class="login-card__body">
                    <div data-slot="error"></div>

                    <div class="auth-field">
                      <label class="auth-field__label" for="login-id">아이디 / 사업자번호</label>
                      <input
                        class="auth-field__input"
                        id="login-id"
                        name="id"
                        type="text"
                        placeholder="아이디 또는 사업자번호를 입력해주세요"
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

  const offSubmit = on(form, "submit", (e) => {
    e.preventDefault();
    const id = form.elements.id.value.trim();
    const pw = form.elements.password.value.trim();
    if (!id || !pw) {
      showError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    clearError();
    const role = resolveRole(id, pw); // "admin" | "enterprise" (DEMO gate)
    setRole(role);
    // Map an enterprise login to its 거래처 when the credentials match a
    // client account → drives per-client pricing in 상품 규격 안내.
    if (role === "enterprise") {
      const c = store.get().clients.find((x) => x.accountId === id && x.password === pw);
      setClientId(c ? c.id : null);
    } else {
      clearClientId();
    }
    nav(role === "admin" ? "#/admin" : "#/app");
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
    offSubmit();
    offInput();
    offEye();
    offNav();
  };
}
