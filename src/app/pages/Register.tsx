import { useState } from "react";
import { useNavigate } from "react-router";
import imgLogo from "figma:asset/9f45d2cc6704b4f034e7928bd437f55f2a05331c.png";

export function Register() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  // Sidebar items for display (blurred background effect like design)
  const sidebarItems = ["경조상품 주문", "실시간 주문내역", "거래명세서 조회", "정산회계 조회", "프로필 저장공간", "메세지 수신설정", "상품 규격 안내"];

  return (
    <div className="flex h-screen w-full bg-[#f5f5f5]">
      {/* Background sidebar (decorative, blurred) */}
      <div className="w-[218px] bg-white border-r border-[#e0e0e0] shrink-0 opacity-40 pointer-events-none flex flex-col">
        <div className="p-4 border-b border-[#e0e0e0]">
          <img src={imgLogo} alt="" className="h-[28px] object-contain" />
        </div>
        <div className="p-3 flex flex-col gap-2 flex-1">
          {sidebarItems.map((item) => (
            <div key={item} className="px-3 py-2 rounded-[5px] bg-[#f6f7f9]">
              <span className="text-[13px] text-[#333]">{item}</span>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-[#e0e0e0]">
          <span className="text-[13px] text-[#333]">서비스 로그아웃</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="h-[55px] bg-white border-b border-[#e0e0e0] flex items-center px-6 opacity-40">
          <img src={imgLogo} alt="" className="h-[28px] object-contain" />
        </div>

        {/* Form area */}
        <div className="p-8 max-w-[900px] mx-auto">
          {/* Title section */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <span className="text-[28px]">👥</span>
              <h1 className="text-[26px] text-[#222] font-bold">제휴기업 회원가입</h1>
            </div>
            <div className="flex items-center gap-2 bg-[#fff8f0] border border-[#f2b117] rounded-[20px] px-4 py-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#f2b117" strokeWidth="1.5" />
                <text x="8" y="12" textAnchor="middle" fontSize="10" fill="#f2b117">!</text>
              </svg>
              <span className="text-[13px] text-[#e8920f]">
                회원가입 시 경조사 상품을 <strong>1회 무료</strong>로 이용할 수 있어요
              </span>
            </div>
          </div>

          <div className="flex gap-10">
            {/* Left column */}
            <div className="flex-1 flex flex-col gap-8">
              {/* 로그인 정보 */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b-2 border-[#f15a2a] pb-2">
                  <h2 className="text-[16px] text-[#222] font-bold">로그인 정보</h2>
                  <span className="text-[12px] text-[#f15a2a] flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="#f15a2a" strokeWidth="1.5" />
                      <text x="8" y="12" textAnchor="middle" fontSize="10" fill="#f15a2a">!</text>
                    </svg>
                    모든 정보를 입력해주세요
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">접속 아이디</label>
                    <input
                      type="text"
                      placeholder="사용하실 아이디를 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">접속 비밀번호</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="비밀번호를 입력해 주세요"
                        className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aaa]"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 담당자 정보 */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b-2 border-[#f15a2a] pb-2">
                  <h2 className="text-[16px] text-[#222] font-bold">담당자 정보</h2>
                  <span className="text-[12px] text-[#f15a2a] flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="#f15a2a" strokeWidth="1.5" />
                      <text x="8" y="12" textAnchor="middle" fontSize="10" fill="#f15a2a">!</text>
                    </svg>
                    모든 정보를 입력해주세요
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">경조사 담당자명</label>
                    <input
                      type="text"
                      placeholder="경조사 담당자명을 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">담당자 부서·직위</label>
                    <input
                      type="text"
                      placeholder="부서명(부서+직위) / 홍보 / 영업 / 직무 등"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">담당자 연락처</label>
                    <input
                      type="text"
                      placeholder="담당자 연락처를 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex-1 flex flex-col gap-8">
              {/* 사업자 정보 */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b-2 border-[#f15a2a] pb-2">
                  <h2 className="text-[16px] text-[#222] font-bold">사업자 정보</h2>
                  <span className="text-[12px] text-[#f15a2a] flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="#f15a2a" strokeWidth="1.5" />
                      <text x="8" y="12" textAnchor="middle" fontSize="10" fill="#f15a2a">!</text>
                    </svg>
                    모든 정보를 입력해주세요
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">사업자번호</label>
                    <input
                      type="text"
                      placeholder="사업자번호를 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">회사명</label>
                    <input
                      type="text"
                      placeholder="회사명을 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">대표자명</label>
                    <input
                      type="text"
                      placeholder="대표자 성명을 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">사업자 소재지</label>
                    <input
                      type="text"
                      placeholder="사업자등록증 상 소재지를 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] text-[#555] mb-1">계산서 수신 이메일</label>
                    <input
                      type="email"
                      placeholder="사업자등록증 상 소재지를 입력해주세요"
                      className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] placeholder-[#bbb] outline-none focus:border-[#f15a2a]"
                    />
                  </div>
                  <button
                    type="button"
                    className="w-full bg-[#d0d0d0] text-white rounded-[4px] py-3 text-[14px] flex items-center justify-center gap-2 mt-2 font-medium"
                  >
                    계약서 전자서명 →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Back to login */}
          <div className="mt-6">
            <button
              onClick={() => navigate("/login")}
              className="text-[13px] text-[#888] underline hover:text-[#555]"
            >
              ← 로그인으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}