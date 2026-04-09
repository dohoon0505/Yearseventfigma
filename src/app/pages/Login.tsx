import { useState } from "react";
import { useNavigate } from "react-router";
import imgLogo from "figma:asset/9f45d2cc6704b4f034e7928bd437f55f2a05331c.png";

const CITY_IMAGE = "https://images.unsplash.com/photo-1761528953246-54ce6d72af6c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxTZW91bCUyMEtvcmVhJTIwY2l0eSUyMHN0cmVldCUyMGJ1aWxkaW5ncyUyMGRvd250b3dufGVufDF8fHx8MTc3NTYzNjcwNXww&ixlib=rb-4.1.0&q=80&w=1080";

export function Login() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/app");
  };

  return (
    <div className="flex h-screen w-full">
      {/* Left: City image */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={CITY_IMAGE}
          alt="Seoul city"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        {/* Logo on image */}
        <div className="absolute top-6 left-6 flex items-center gap-2">
          <img src={imgLogo} alt="올해의 경조사" className="h-[30px] object-contain brightness-0 invert" />
        </div>
        {/* Tagline */}
        <div className="absolute bottom-12 left-8">
          <p className="text-white text-[22px] leading-[1.5] font-bold">
            기업에서 발생하는 모든 경조사,<br />
            화환·화분·꽃 맞춤형 전담서비스
          </p>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="w-[380px] bg-white flex flex-col items-center justify-center px-10 shrink-0">
        <div className="w-full max-w-[320px]">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-start gap-1">
            <img src={imgLogo} alt="올해의 경조사" className="h-[36px] object-contain mb-2" />
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] text-[#222] font-bold">올해의경조사</span>
              <span className="text-[13px] text-[#555]" style={{ fontWeight: 400 }}>WEB UI 3.0</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* ID field */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] text-[#333]">
                아이디(사업자번호)을 입력해주세요
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="아이디 또는 사업자번호를 입력해 주세요"
                className="border border-[#d0d0d0] rounded-[4px] px-3 py-3 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a] transition-colors"
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1">
              <label className="text-[13px] text-[#333]">
                비밀번호를 입력해주세요
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력해주세요"
                  className="border border-[#d0d0d0] rounded-[4px] px-3 py-3 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a] transition-colors w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aaa]"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Login button */}
            <button
              type="submit"
              className="bg-[#f15a2a] text-white rounded-[4px] py-3 text-[15px] mt-2 font-semibold hover:bg-[#d94e24] transition-colors"
            >
              로그인
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-[#e0e0e0]" />
              <span className="text-[12px] text-[#999]">또는</span>
              <div className="flex-1 border-t border-[#e0e0e0]" />
            </div>

            {/* Register button */}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="border border-[#d0d0d0] rounded-[4px] py-3 text-[14px] text-[#333] hover:bg-[#f5f5f5] transition-colors"
            >
              제휴기업 회원가입
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}