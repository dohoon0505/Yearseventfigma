import { useState } from "react";
import { useNavigate } from "react-router";
import imgLogo from "figma:asset/9f45d2cc6704b4f034e7928bd437f55f2a05331c.png";

interface FormData {
  userId: string;
  password: string;
  passwordConfirm: string;
  managerName: string;
  department: string;
  contact: string;
  bizNumber: string;
  companyName: string;
  ceoName: string;
  address: string;
  email: string;
}

type StepNum = 1 | 2 | 3;

interface FieldProps {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  rightEl?: React.ReactNode;
}

function InputField({ label, type = "text", placeholder, value, onChange, error, rightEl }: FieldProps) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#555] mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full rounded-[8px] px-4 py-3 text-[14px] text-[#222] placeholder-[#c0c0c0] outline-none transition-all border ${
            error
              ? "border-red-400 bg-red-50 focus:border-red-500"
              : "border-[#e0e0e0] bg-white focus:border-[#f15a2a] focus:shadow-[0_0_0_3px_rgba(241,90,42,0.1)]"
          } ${rightEl ? "pr-10" : ""}`}
        />
        {rightEl}
      </div>
      {error && (
        <p className="text-[12px] text-red-500 mt-1.5 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepNum | "done">(1);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [form, setForm] = useState<FormData>({
    userId: "",
    password: "",
    passwordConfirm: "",
    managerName: "",
    department: "",
    contact: "",
    bizNumber: "",
    companyName: "",
    ceoName: "",
    address: "",
    email: "",
  });

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = (fields: { [K in keyof FormData]?: string }): boolean => {
    const newErrors: typeof errors = {};
    for (const [key, msg] of Object.entries(fields) as [keyof FormData, string][]) {
      if (!form[key].trim()) {
        newErrors[key] = msg;
      }
    }
    if (!newErrors.password && step === 1 && form.password && form.password.length < 8) {
      newErrors.password = "8자 이상 입력해주세요";
    }
    if (!newErrors.passwordConfirm && step === 1 && form.passwordConfirm && form.password !== form.passwordConfirm) {
      newErrors.passwordConfirm = "비밀번호가 일치하지 않습니다";
    }
    if (!newErrors.email && step === 3 && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "올바른 이메일 형식을 입력해주세요";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const next = () => {
    if (step === 1) {
      if (validate({ userId: "아이디를 입력해주세요", password: "비밀번호를 입력해주세요", passwordConfirm: "비밀번호를 확인해주세요" })) setStep(2);
    } else if (step === 2) {
      if (validate({ managerName: "담당자명을 입력해주세요", department: "부서·직위를 입력해주세요", contact: "연락처를 입력해주세요" })) setStep(3);
    } else if (step === 3) {
      if (validate({ bizNumber: "사업자번호를 입력해주세요", companyName: "회사명을 입력해주세요", ceoName: "대표자명을 입력해주세요", address: "소재지를 입력해주세요", email: "이메일을 입력해주세요" })) setStep("done");
    }
  };

  const prev = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const stepLabels = ["계정 설정", "담당자 정보", "사업자 정보"];

  const benefits = [
    { icon: "🎁", title: "가입 즉시 1회 무료 이용", desc: "경조사 상품 1회 무료 혜택 제공" },
    { icon: "⚡", title: "실시간 주문 처리", desc: "접수부터 배송까지 빠른 처리" },
    { icon: "📊", title: "자동 정산 관리", desc: "거래명세서·정산내역 자동화" },
    { icon: "🤝", title: "전담 담당자 배정", desc: "기업 맞춤형 1:1 케어 서비스" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans">

      {/* ── LEFT BRAND PANEL ── */}
      <div
        className="hidden lg:flex w-[400px] shrink-0 flex-col relative overflow-hidden"
        style={{ background: "linear-gradient(150deg, #ff6b3d 0%, #f15a2a 40%, #c94018 80%, #a33010 100%)" }}
      >
        {/* Background circles */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -right-8 w-40 h-40 rounded-full bg-black/5" />

        {/* Logo */}
        <div className="relative z-10 p-8 pt-10">
          <img src={imgLogo} alt="올해의경조사" className="h-[30px] object-contain brightness-0 invert" />
        </div>

        {/* Main copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-10 pb-6">
          <span className="inline-block bg-white/25 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1 rounded-full mb-5 w-fit tracking-wider">
            B2B 제휴 서비스
          </span>
          <h2 className="text-[34px] text-white font-black leading-tight mb-4">
            기업 경조사,<br />올해의경조사와<br />함께하세요
          </h2>
          <p className="text-white/70 text-[14px] leading-relaxed mb-10">
            임직원 경조사 관리의 모든 것을<br />하나의 플랫폼으로 간편하게
          </p>

          {/* Benefits list */}
          <div className="flex flex-col gap-4">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-[18px] shrink-0">
                  {b.icon}
                </div>
                <div>
                  <p className="text-white text-[13px] font-semibold">{b.title}</p>
                  <p className="text-white/60 text-[12px]">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step progress dots */}
        <div className="relative z-10 p-8 pb-10">
          <div className="flex gap-2 items-center">
            {[1, 2, 3].map(i => {
              const currentStep = typeof step === "number" ? step : 4;
              return (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 h-1.5 ${
                    currentStep === i ? "w-8 bg-white" :
                    currentStep > i ? "w-4 bg-white/60" :
                    "w-4 bg-white/25"
                  }`}
                />
              );
            })}
          </div>
          <p className="text-white/50 text-[11px] mt-2">
            {step === "done" ? "가입 완료" : `${typeof step === "number" ? step : 3}/3 단계 진행 중`}
          </p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex-1 bg-[#f7f7f8] overflow-y-auto">
        <div className="min-h-full flex flex-col">

          {/* Top bar */}
          <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-[#eeeeee] sticky top-0 z-10">
            <img src={imgLogo} alt="올해의경조사" className="h-[24px] object-contain lg:hidden" />
            <div className="hidden lg:block" />
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1.5 text-[13px] text-[#888] hover:text-[#444] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              로그인으로 돌아가기
            </button>
          </div>

          {/* Form content */}
          <div className="flex-1 flex items-start justify-center px-6 py-10">
            <div className="w-full max-w-[500px]">

              {step !== "done" ? (
                <>
                  {/* Page title */}
                  <div className="mb-7">
                    <h1 className="text-[24px] font-black text-[#111] mb-1">제휴기업 회원가입</h1>
                    <p className="text-[13px] text-[#999]">모든 항목을 정확하게 입력해주세요</p>
                  </div>

                  {/* Step indicator */}
                  <div className="flex items-start mb-7">
                    {stepLabels.map((label, i) => {
                      const num = i + 1;
                      const cur = typeof step === "number" ? step : 4;
                      const done = cur > num;
                      const active = cur === num;
                      return (
                        <div key={i} className="flex items-start flex-1 last:flex-none">
                          <div className="flex flex-col items-center min-w-0">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-200 ${
                                done
                                  ? "bg-[#f15a2a] text-white"
                                  : active
                                  ? "bg-[#f15a2a] text-white ring-4 ring-[#f15a2a]/15"
                                  : "bg-[#e4e4e4] text-[#aaa]"
                              }`}
                            >
                              {done ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : num}
                            </div>
                            <span className={`text-[10px] font-semibold mt-1.5 whitespace-nowrap ${active || done ? "text-[#f15a2a]" : "text-[#bbb]"}`}>
                              {label}
                            </span>
                          </div>
                          {i < stepLabels.length - 1 && (
                            <div className={`flex-1 h-[2px] mx-2 mt-4 rounded-full transition-all duration-300 ${done ? "bg-[#f15a2a]" : "bg-[#e4e4e4]"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Form card */}
                  <div className="bg-white rounded-[14px] border border-[#ebebeb] shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">

                    {/* Card header */}
                    <div className="px-7 pt-6 pb-5 border-b border-[#f2f2f2]">
                      {step === 1 && (
                        <>
                          <h3 className="text-[15px] font-bold text-[#222]">계정 정보 설정</h3>
                          <p className="text-[12px] text-[#aaa] mt-0.5">서비스 접속에 사용할 아이디와 비밀번호를 설정해주세요</p>
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <h3 className="text-[15px] font-bold text-[#222]">경조사 담당자 정보</h3>
                          <p className="text-[12px] text-[#aaa] mt-0.5">서비스를 관리할 담당자 정보를 입력해주세요</p>
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <h3 className="text-[15px] font-bold text-[#222]">사업자 정보</h3>
                          <p className="text-[12px] text-[#aaa] mt-0.5">거래명세서 및 계약 처리에 필요한 정보를 입력해주세요</p>
                        </>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="px-7 py-6 flex flex-col gap-4">

                      {/* STEP 1 — Account */}
                      {step === 1 && (
                        <>
                          <InputField
                            label="접속 아이디"
                            placeholder="4자 이상의 아이디를 입력해주세요"
                            value={form.userId}
                            onChange={set("userId")}
                            error={errors.userId}
                          />
                          <InputField
                            label="접속 비밀번호"
                            type={showPw ? "text" : "password"}
                            placeholder="8자 이상 (영문+숫자 조합 권장)"
                            value={form.password}
                            onChange={set("password")}
                            error={errors.password}
                            rightEl={
                              <button
                                type="button"
                                onClick={() => setShowPw(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#666] transition-colors"
                              >
                                <EyeIcon open={showPw} />
                              </button>
                            }
                          />
                          <InputField
                            label="비밀번호 확인"
                            type={showPwConfirm ? "text" : "password"}
                            placeholder="비밀번호를 한번 더 입력해주세요"
                            value={form.passwordConfirm}
                            onChange={set("passwordConfirm")}
                            error={errors.passwordConfirm}
                            rightEl={
                              <button
                                type="button"
                                onClick={() => setShowPwConfirm(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#666] transition-colors"
                              >
                                <EyeIcon open={showPwConfirm} />
                              </button>
                            }
                          />
                          {/* Password strength hint */}
                          {form.password.length > 0 && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex gap-1 flex-1">
                                {[1, 2, 3, 4].map(i => (
                                  <div
                                    key={i}
                                    className={`flex-1 h-1 rounded-full transition-all ${
                                      form.password.length < 4 ? (i <= 1 ? "bg-red-400" : "bg-[#eee]") :
                                      form.password.length < 8 ? (i <= 2 ? "bg-yellow-400" : "bg-[#eee]") :
                                      /[^a-zA-Z0-9]/.test(form.password) ? "bg-green-500" :
                                      i <= 3 ? "bg-[#f15a2a]" : "bg-[#eee]"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[11px] text-[#aaa]">
                                {form.password.length < 4 ? "매우 약함" :
                                 form.password.length < 8 ? "약함" :
                                 /[^a-zA-Z0-9]/.test(form.password) ? "강함" : "보통"}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* STEP 2 — Manager */}
                      {step === 2 && (
                        <>
                          <InputField
                            label="경조사 담당자명"
                            placeholder="담당자 성명을 입력해주세요"
                            value={form.managerName}
                            onChange={set("managerName")}
                            error={errors.managerName}
                          />
                          <InputField
                            label="부서·직위"
                            placeholder="예) 총무팀 / 인사부 대리 / 영업본부 팀장"
                            value={form.department}
                            onChange={set("department")}
                            error={errors.department}
                          />
                          <InputField
                            label="담당자 연락처"
                            placeholder="010-0000-0000"
                            value={form.contact}
                            onChange={set("contact")}
                            error={errors.contact}
                          />
                          <div className="mt-1 flex items-start gap-3 bg-[#fffaf5] border border-[#fde8cc] rounded-[10px] px-4 py-3.5">
                            <span className="text-[18px] shrink-0 leading-none mt-0.5">💡</span>
                            <p className="text-[12px] text-[#c86020] leading-relaxed">
                              담당자 정보는 주문 접수, 서비스 운영, 가입 승인 안내 등 중요 연락에 활용됩니다.
                            </p>
                          </div>
                        </>
                      )}

                      {/* STEP 3 — Business */}
                      {step === 3 && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <InputField
                              label="사업자번호"
                              placeholder="000-00-00000"
                              value={form.bizNumber}
                              onChange={set("bizNumber")}
                              error={errors.bizNumber}
                            />
                            <InputField
                              label="회사명"
                              placeholder="법인명을 입력해주세요"
                              value={form.companyName}
                              onChange={set("companyName")}
                              error={errors.companyName}
                            />
                          </div>
                          <InputField
                            label="대표자명"
                            placeholder="대표자 성명을 입력해주세요"
                            value={form.ceoName}
                            onChange={set("ceoName")}
                            error={errors.ceoName}
                          />
                          <InputField
                            label="사업장 소재지"
                            placeholder="사업자등록증 상의 주소를 입력해주세요"
                            value={form.address}
                            onChange={set("address")}
                            error={errors.address}
                          />
                          <InputField
                            label="계산서 수신 이메일"
                            type="email"
                            placeholder="세금계산서를 수신할 이메일 주소"
                            value={form.email}
                            onChange={set("email")}
                            error={errors.email}
                          />

                          {/* E-signature button */}
                          <button
                            type="button"
                            className="mt-1 w-full flex items-center justify-between px-4 py-3.5 rounded-[10px] border-2 border-dashed border-[#f15a2a]/35 bg-[#fff8f5] hover:border-[#f15a2a]/70 hover:bg-[#fff2ec] transition-all group"
                          >
                            <span className="flex items-center gap-2.5 text-[#f15a2a] text-[13px] font-semibold">
                              <div className="w-7 h-7 bg-[#f15a2a]/10 group-hover:bg-[#f15a2a]/20 rounded-lg flex items-center justify-center transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f15a2a" strokeWidth="2">
                                  <path d="M9 11l3 3L22 4" />
                                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                </svg>
                              </div>
                              계약서 전자서명
                            </span>
                            <span className="text-[11px] font-bold bg-[#f15a2a] text-white px-2.5 py-1 rounded-full">
                              서명하기 →
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex gap-3 mt-5">
                    {typeof step === "number" && step > 1 && (
                      <button
                        onClick={prev}
                        className="flex-1 py-3.5 rounded-[10px] border border-[#ddd] bg-white text-[#555] text-[14px] font-semibold hover:bg-[#f7f7f7] transition-colors"
                      >
                        ← 이전
                      </button>
                    )}
                    <button
                      onClick={next}
                      className="flex-[2] py-3.5 rounded-[10px] bg-[#f15a2a] text-white text-[14px] font-bold hover:bg-[#d94a1c] active:bg-[#c43e15] transition-colors shadow-[0_4px_14px_rgba(241,90,42,0.35)]"
                    >
                      {step === 3 ? "가입 완료하기" : "다음 단계 →"}
                    </button>
                  </div>

                  <p className="text-center text-[12px] text-[#c0c0c0] mt-4">
                    {typeof step === "number" ? step : 3} / 3 단계 · 이미 계정이 있으신가요?{" "}
                    <button onClick={() => navigate("/login")} className="text-[#f15a2a] font-semibold hover:underline">
                      로그인
                    </button>
                  </p>
                </>
              ) : (
                /* ── DONE SCREEN ── */
                <div className="flex flex-col items-center text-center">

                  {/* Success icon */}
                  <div className="relative mb-7">
                    <div className="w-20 h-20 rounded-full bg-[#f15a2a] flex items-center justify-center shadow-[0_8px_28px_rgba(241,90,42,0.40)]">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="absolute -top-1 -right-1 w-7 h-7 bg-green-400 rounded-full flex items-center justify-center shadow-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>

                  <h2 className="text-[26px] font-black text-[#111] mb-2">가입이 완료되었습니다!</h2>
                  <p className="text-[15px] text-[#666] leading-relaxed mb-1">
                    <strong className="text-[#111]">{form.companyName || "회사"}</strong> 기업 회원으로
                  </p>
                  <p className="text-[15px] text-[#666] mb-6">등록이 완료되었습니다.</p>

                  {/* Info card */}
                  <div className="w-full bg-white rounded-[14px] border border-[#ebebeb] shadow-[0_2px_12px_rgba(0,0,0,0.05)] p-5 mb-5 text-left">
                    <h4 className="text-[12px] font-bold text-[#aaa] uppercase tracking-wider mb-3">가입 정보 요약</h4>
                    {[
                      { label: "아이디", value: form.userId },
                      { label: "담당자", value: form.managerName },
                      { label: "연락처", value: form.contact },
                      { label: "회사명", value: form.companyName },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-none">
                        <span className="text-[13px] text-[#999]">{label}</span>
                        <span className="text-[13px] text-[#333] font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Benefit notice */}
                  <div className="w-full bg-[#fffaf5] border border-[#fde8cc] rounded-[12px] p-4 mb-7 text-left flex gap-3">
                    <span className="text-[22px] shrink-0">🎁</span>
                    <div>
                      <p className="text-[13px] font-bold text-[#c86020] mb-1">가입 혜택 안내</p>
                      <p className="text-[12px] text-[#c86020] leading-relaxed">
                        승인 완료 후 경조사 상품을 <strong>1회 무료</strong>로 이용하실 수 있습니다.
                        담당자 연락처(<strong>{form.contact}</strong>)로 무료 이용권 안내를 드립니다.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate("/login")}
                    className="w-full py-4 rounded-[12px] bg-[#f15a2a] text-white text-[15px] font-bold hover:bg-[#d94a1c] transition-colors shadow-[0_4px_14px_rgba(241,90,42,0.35)]"
                  >
                    로그인 페이지로 이동
                  </button>
                  <p className="text-[12px] text-[#bbb] mt-4">
                    담당자 검토 후 승인 안내를 드립니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
