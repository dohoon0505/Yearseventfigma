import { useState } from "react";
import { useNavigate } from "react-router";
import imgLogo from "figma:asset/9f45d2cc6704b4f034e7928bd437f55f2a05331c.png";

export function Login() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }
    setError("");
    navigate("/app");
  };

  const FONT = { fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

  const STATS = [
    { value: "2,400+", label: "제휴 기업" },
    { value: "98%", label: "재계약률" },
    { value: "1일", label: "평균 배송" },
  ];

  return (
    <div style={FONT} className="flex h-screen w-full overflow-hidden">

      {/* ══════════════════════════════
          왼쪽: 다크 브랜드 패널
      ══════════════════════════════ */}
      <div className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col bg-[#111118] select-none">

        {/* 로고 */}
        <div className="px-10 pt-10">
          <img
            src={imgLogo}
            alt="올해의경조사"
            className="h-[27px] object-contain brightness-0 invert opacity-85"
          />
        </div>

        {/* 중앙 카피 */}
        <div className="flex-1 flex flex-col justify-center px-10">
          <p className="text-[11px] font-semibold text-[#f15a2a] tracking-[0.12em] uppercase mb-5">
            Enterprise Service
          </p>
          <h2
            style={{ ...FONT, fontWeight: 700 }}
            className="text-[30px] text-white leading-[1.4] mb-4"
          >
            기업에서 발생하는<br />모든 경조사,<br />한 곳에서 관리
          </h2>
          <p className="text-[13px] text-[#666] leading-relaxed mb-10">
            화환·화분·꽃 맞춤형 전담서비스를<br />
            직접 경험해보세요.
          </p>

          {/* 실적 지표 */}
          <div className="flex gap-6">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <p
                  style={{ ...FONT, fontWeight: 700 }}
                  className="text-[22px] text-white"
                >
                  {value}
                </p>
                <p className="text-[11px] text-[#555] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 회원가입 링크 */}
        <div className="px-10 py-8 border-t border-[#1c1c26]">
          <p className="text-[12px] text-[#4a4a5a] mb-1.5">아직 계정이 없으신가요?</p>
          <button
            onClick={() => navigate("/register")}
            style={FONT}
            className="text-[13px] text-[#aaa] hover:text-white transition-colors font-medium"
          >
            제휴기업 회원가입
            <svg className="inline ml-1.5 mb-0.5" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════
          오른쪽: 로그인 폼 패널
      ══════════════════════════════ */}
      <div className="flex-1 bg-[#f5f5f7] overflow-y-auto">
        <div className="min-h-full flex flex-col">

          {/* 상단 바 (모바일용 로고) */}
          <div className="flex items-center justify-between px-8 py-5">
            <img
              src={imgLogo}
              alt="올해의경조사"
              className="h-[24px] object-contain lg:hidden"
            />
            <div className="hidden lg:block" />
            {/* 모바일: 회원가입 링크 */}
            <button
              onClick={() => navigate("/register")}
              style={FONT}
              className="flex lg:hidden items-center gap-1 text-[12px] text-[#999] hover:text-[#333] transition-colors font-medium"
            >
              회원가입
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 폼 중앙 정렬 */}
          <div className="flex-1 flex items-center justify-center px-6 pb-12">
            <div className="w-full max-w-[400px]">

              {/* 타이틀 */}
              <div className="mb-7">
                {/* 데스크톱: 로고 숨김 (패널에 있음) / 모바일: 로고 표시 */}
                <div className="hidden lg:block">
                  <h1
                    style={{ ...FONT, fontWeight: 700 }}
                    className="text-[20px] text-[#111] mb-1"
                  >
                    로그인
                  </h1>
                  <p className="text-[12px] text-[#aaa]">아이디와 비밀번호를 입력해주세요</p>
                </div>
                <div className="lg:hidden">
                  <h1
                    style={{ ...FONT, fontWeight: 700 }}
                    className="text-[20px] text-[#111] mb-1"
                  >
                    올해의경조사 로그인
                  </h1>
                  <p className="text-[12px] text-[#aaa]">아이디와 비밀번호를 입력해주세요</p>
                </div>
              </div>

              {/* 폼 카드 */}
              <form
                onSubmit={handleLogin}
                className="bg-white rounded-[10px] border border-[#e8e8e8] shadow-[0_1px_6px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                {/* 카드 헤더 */}
                <div className="px-7 py-5 border-b border-[#f0f0f0]">
                  <h3
                    style={{ ...FONT, fontWeight: 600 }}
                    className="text-[14px] text-[#111]"
                  >
                    계정 로그인
                  </h3>
                  <p className="text-[11px] text-[#bbb] mt-0.5">
                    제휴기업 아이디 또는 사업자번호로 로그인하세요
                  </p>
                </div>

                {/* 카드 바디 */}
                <div className="px-7 py-6 flex flex-col gap-4">

                  {/* 에러 메시지 */}
                  {error && (
                    <div className="flex items-center gap-2 bg-[#fff8f8] border border-[#fdd] rounded-[6px] px-3.5 py-3">
                      <svg className="shrink-0" width="13" height="13" viewBox="0 0 16 16" fill="#cc3333">
                        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zM8 12a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                      <p style={FONT} className="text-[12px] text-[#cc3333]">{error}</p>
                    </div>
                  )}

                  {/* 아이디 */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      style={FONT}
                      className="text-[12px] font-semibold text-[#3a3a3a] tracking-[0.02em]"
                    >
                      아이디 / 사업자번호
                    </label>
                    <input
                      type="text"
                      value={id}
                      onChange={e => { setId(e.target.value); setError(""); }}
                      placeholder="아이디 또는 사업자번호를 입력해주세요"
                      style={FONT}
                      className="w-full rounded-[6px] px-3.5 py-[11px] text-[14px] text-[#111] placeholder-[#c8c8c8] outline-none transition-all duration-150 border border-[#e3e3e3] bg-white focus:border-[#f15a2a] focus:shadow-[0_0_0_3px_rgba(241,90,42,0.09)]"
                    />
                  </div>

                  {/* 비밀번호 */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      style={FONT}
                      className="text-[12px] font-semibold text-[#3a3a3a] tracking-[0.02em]"
                    >
                      비밀번호
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(""); }}
                        placeholder="비밀번호를 입력해주세요"
                        style={FONT}
                        className="w-full rounded-[6px] px-3.5 py-[11px] pr-10 text-[14px] text-[#111] placeholder-[#c8c8c8] outline-none transition-all duration-150 border border-[#e3e3e3] bg-white focus:border-[#f15a2a] focus:shadow-[0_0_0_3px_rgba(241,90,42,0.09)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c0c0c0] hover:text-[#777] transition-colors"
                      >
                        {showPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 로그인 버튼 */}
                  <button
                    type="submit"
                    style={FONT}
                    className="w-full py-[11px] rounded-[6px] bg-[#f15a2a] text-white text-[13px] font-semibold hover:bg-[#d94a1c] active:bg-[#c4421a] transition-colors shadow-[0_2px_8px_rgba(241,90,42,0.28)] mt-1"
                  >
                    로그인
                  </button>
                </div>
              </form>

              {/* 구분선 + 회원가입 */}
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#e8e8e8]" />
                  <span style={FONT} className="text-[11px] text-[#ccc]">또는</span>
                  <div className="flex-1 h-px bg-[#e8e8e8]" />
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  style={FONT}
                  className="w-full py-[11px] rounded-[6px] bg-white border border-[#e0e0e0] text-[13px] text-[#555] font-semibold hover:bg-[#f9f9f9] hover:border-[#d0d0d0] transition-all"
                >
                  제휴기업 회원가입
                </button>
              </div>

              {/* 하단 안내 */}
              <p style={FONT} className="text-center text-[11px] text-[#ccc] mt-5 leading-relaxed">
                로그인에 문제가 있으신가요?{" "}
                <button className="text-[#aaa] hover:text-[#555] transition-colors underline underline-offset-2">
                  고객센터 문의
                </button>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
