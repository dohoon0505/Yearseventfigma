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

type Step = 1 | 2 | 3 | "done";

/* ─────────────────────────────────────────
   서브 컴포넌트: 입력 필드
───────────────────────────────────────── */
interface FieldProps {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  suffix?: React.ReactNode;
  hint?: string;
}

function Field({ label, type = "text", placeholder, value, onChange, error, suffix, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        style={{ fontFamily: "'Pretendard', sans-serif" }}
        className="text-[12px] font-semibold text-[#3a3a3a] tracking-[0.02em]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{ fontFamily: "'Pretendard', sans-serif" }}
          className={[
            "w-full rounded-[6px] px-3.5 py-[11px] text-[14px] outline-none transition-all duration-150",
            "placeholder-[#c8c8c8] text-[#111]",
            suffix ? "pr-10" : "",
            error
              ? "border border-[#e55] bg-[#fff8f8] focus:border-[#cc3333] focus:shadow-[0_0_0_3px_rgba(220,50,50,0.08)]"
              : "border border-[#e3e3e3] bg-white focus:border-[#f15a2a] focus:shadow-[0_0_0_3px_rgba(241,90,42,0.09)]",
          ].join(" ")}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {suffix}
          </div>
        )}
      </div>
      {hint && !error && (
        <p style={{ fontFamily: "'Pretendard', sans-serif" }} className="text-[11px] text-[#aaa]">{hint}</p>
      )}
      {error && (
        <p style={{ fontFamily: "'Pretendard', sans-serif" }} className="text-[11px] text-[#cc3333] flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zM8 12a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   서브 컴포넌트: 눈 아이콘 토글 버튼
───────────────────────────────────────── */
function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-[#c0c0c0] hover:text-[#777] transition-colors"
    >
      {visible ? (
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
  );
}

/* ─────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────── */
export function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [showPw, setShowPw] = useState(false);
  const [showPwC, setShowPwC] = useState(false);
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
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const check = (rules: Partial<Record<keyof FormData, string>>) => {
    const next: typeof errors = {};
    for (const [k, msg] of Object.entries(rules) as [keyof FormData, string][]) {
      if (!form[k].trim()) next[k] = msg;
    }
    if (!next.password && step === 1 && form.password && form.password.length < 8)
      next.password = "8자 이상 입력해주세요";
    if (!next.passwordConfirm && step === 1 && form.passwordConfirm && form.password !== form.passwordConfirm)
      next.passwordConfirm = "비밀번호가 일치하지 않습니다";
    if (!next.email && step === 3 && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "올바른 이메일 형식으로 입력해주세요";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const next = () => {
    if (step === 1 && check({ userId: "아이디를 입력해주세요", password: "비밀번호를 입력해주세요", passwordConfirm: "비밀번호를 확인해주세요" })) setStep(2);
    else if (step === 2 && check({ managerName: "담당자명을 입력해주세요", department: "부서·직위를 입력해주세요", contact: "연락처를 입력해주세요" })) setStep(3);
    else if (step === 3 && check({ bizNumber: "사업자번호를 입력해주세요", companyName: "회사명을 입력해주세요", ceoName: "대표자명을 입력해주세요", address: "소재지를 입력해주세요", email: "이메일을 입력해주세요" })) setStep("done");
  };

  const prev = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const pwStrength = (() => {
    const p = form.password;
    if (!p) return null;
    if (p.length < 4) return { level: 0, label: "너무 짧음", color: "#e55" };
    if (p.length < 8) return { level: 1, label: "약함", color: "#f5a623" };
    if (/[^a-zA-Z0-9]/.test(p) && /[0-9]/.test(p) && /[a-zA-Z]/.test(p)) return { level: 3, label: "강함", color: "#3db069" };
    return { level: 2, label: "보통", color: "#f15a2a" };
  })();

  const STEPS = ["계정 설정", "담당자 정보", "사업자 정보"] as const;

  const BENEFITS = [
    "신규 가입 기업 경조사 상품 1회 무료 제공",
    "실시간 주문·배송 현황 통합 관리",
    "세금계산서 자동 발행 및 정산 처리",
    "전담 운영팀 기업 맞춤 1:1 지원",
  ];

  return (
    <div
      style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      className="flex h-screen w-full overflow-hidden"
    >

      {/* ══════════════════════════════
          왼쪽: 다크 브랜드 패널
      ══════════════════════════════ */}
      <div className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col bg-[#111118] select-none">

        {/* 로고 */}
        <div className="px-10 pt-10 pb-0">
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
            style={{ fontFamily: "'Pretendard', sans-serif", fontWeight: 700 }}
            className="text-[30px] text-white leading-[1.4] mb-4"
          >
            기업 경조사 관리,<br />더 스마트하게
          </h2>
          <p className="text-[13px] text-[#666] leading-relaxed mb-10">
            임직원 경조사 서비스를 하나의 플랫폼으로<br />
            통합 관리하세요.
          </p>

          {/* 혜택 목록 */}
          <ul className="flex flex-col gap-4">
            {BENEFITS.map((text, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-[5px] w-[5px] h-[5px] rounded-full bg-[#f15a2a] shrink-0 opacity-80" />
                <span className="text-[13px] text-[#8a8a9a] leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 하단 로그인 링크 */}
        <div className="px-10 py-8 border-t border-[#1c1c26]">
          <p className="text-[12px] text-[#4a4a5a] mb-1.5">이미 계정이 있으신가요?</p>
          <button
            onClick={() => navigate("/login")}
            style={{ fontFamily: "'Pretendard', sans-serif" }}
            className="text-[13px] text-[#aaa] hover:text-white transition-colors font-medium"
          >
            로그인하기
            <svg className="inline ml-1.5 mb-0.5" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════
          오른쪽: 폼 패널
      ══════════════════════════════ */}
      <div className="flex-1 bg-[#f5f5f7] overflow-y-auto">
        <div className="min-h-full flex flex-col">

          {/* 상단 바 */}
          <div className="flex items-center justify-between px-8 xl:px-12 py-5 bg-[#f5f5f7]">
            <img src={imgLogo} alt="올해의경조사" className="h-[24px] object-contain lg:hidden" />
            <div className="hidden lg:block" />
            <button
              onClick={() => navigate("/login")}
              style={{ fontFamily: "'Pretendard', sans-serif" }}
              className="flex items-center gap-1.5 text-[12px] text-[#999] hover:text-[#333] transition-colors font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              로그인으로 돌아가기
            </button>
          </div>

          {/* 폼 영역 */}
          <div className="flex-1 flex justify-center px-6 pb-16">
            <div className="w-full max-w-[460px]">

              {step !== "done" ? (
                <>
                  {/* 타이틀 */}
                  <div className="mb-7">
                    <h1
                      style={{ fontFamily: "'Pretendard', sans-serif", fontWeight: 700 }}
                      className="text-[20px] text-[#111] mb-1"
                    >
                      제휴기업 회원가입
                    </h1>
                    <p className="text-[12px] text-[#aaa]">모든 항목을 정확하게 입력해주세요</p>
                  </div>

                  {/* 스텝 인디케이터 */}
                  <div className="flex items-start mb-7">
                    {STEPS.map((label, i) => {
                      const num = i + 1;
                      const cur = typeof step === "number" ? step : 4;
                      const done = cur > num;
                      const active = cur === num;
                      return (
                        <div key={i} className="flex items-start flex-1 last:flex-none">
                          <div className="flex flex-col items-center">
                            <div
                              className={[
                                "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200",
                                done ? "bg-[#111118] text-white" :
                                active ? "bg-[#f15a2a] text-white" :
                                "bg-white border border-[#ddd] text-[#ccc]",
                              ].join(" ")}
                            >
                              {done ? (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : num}
                            </div>
                            <span
                              style={{ fontFamily: "'Pretendard', sans-serif" }}
                              className={[
                                "text-[10px] font-medium mt-1.5 whitespace-nowrap",
                                active ? "text-[#f15a2a]" : done ? "text-[#555]" : "text-[#ccc]",
                              ].join(" ")}
                            >
                              {label}
                            </span>
                          </div>
                          {i < STEPS.length - 1 && (
                            <div
                              className={[
                                "flex-1 h-px mx-2 mt-3.5 transition-all duration-300",
                                done ? "bg-[#111118]" : "bg-[#e0e0e0]",
                              ].join(" ")}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 폼 카드 */}
                  <div className="bg-white rounded-[10px] border border-[#e8e8e8] shadow-[0_1px_6px_rgba(0,0,0,0.04)] overflow-hidden">

                    {/* 카드 헤더 */}
                    <div className="px-7 py-5 border-b border-[#f0f0f0]">
                      <h3
                        style={{ fontFamily: "'Pretendard', sans-serif", fontWeight: 600 }}
                        className="text-[14px] text-[#111]"
                      >
                        {step === 1 && "계정 정보 설정"}
                        {step === 2 && "경조사 담당자 정보"}
                        {step === 3 && "사업자 정보"}
                      </h3>
                      <p className="text-[11px] text-[#bbb] mt-0.5">
                        {step === 1 && "서비스 접속에 사용할 아이디와 비밀번호를 설정해주세요"}
                        {step === 2 && "서비스를 관리할 담당자 정보를 입력해주세요"}
                        {step === 3 && "거래명세서 및 계약 처리에 필요한 사업자 정보를 입력해주세요"}
                      </p>
                    </div>

                    {/* 카드 바디 */}
                    <div className="px-7 py-6 flex flex-col gap-4">

                      {/* ── STEP 1 ── */}
                      {step === 1 && (
                        <>
                          <Field
                            label="접속 아이디"
                            placeholder="4자 이상의 아이디를 입력해주세요"
                            value={form.userId}
                            onChange={set("userId")}
                            error={errors.userId}
                            hint="영문 소문자와 숫자 조합을 권장합니다"
                          />
                          <Field
                            label="접속 비밀번호"
                            type={showPw ? "text" : "password"}
                            placeholder="8자 이상 입력해주세요"
                            value={form.password}
                            onChange={set("password")}
                            error={errors.password}
                            suffix={<EyeToggle visible={showPw} onToggle={() => setShowPw(p => !p)} />}
                          />

                          {/* 비밀번호 강도 */}
                          {pwStrength && (
                            <div className="-mt-2">
                              <div className="flex gap-1 mb-1">
                                {[0, 1, 2, 3].map(i => (
                                  <div
                                    key={i}
                                    className="flex-1 h-[3px] rounded-full transition-all duration-300"
                                    style={{
                                      backgroundColor: i <= pwStrength.level ? pwStrength.color : "#ebebeb",
                                    }}
                                  />
                                ))}
                              </div>
                              <p className="text-[11px]" style={{ color: pwStrength.color }}>
                                비밀번호 강도: {pwStrength.label}
                              </p>
                            </div>
                          )}

                          <Field
                            label="비밀번호 확인"
                            type={showPwC ? "text" : "password"}
                            placeholder="비밀번호를 한번 더 입력해주세요"
                            value={form.passwordConfirm}
                            onChange={set("passwordConfirm")}
                            error={errors.passwordConfirm}
                            suffix={<EyeToggle visible={showPwC} onToggle={() => setShowPwC(p => !p)} />}
                          />

                          {/* 비밀번호 일치 피드백 */}
                          {form.passwordConfirm && !errors.passwordConfirm && form.password === form.passwordConfirm && (
                            <p className="text-[11px] text-[#3db069] -mt-2 flex items-center gap-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              비밀번호가 일치합니다
                            </p>
                          )}
                        </>
                      )}

                      {/* ── STEP 2 ── */}
                      {step === 2 && (
                        <>
                          <Field
                            label="경조사 담당자명"
                            placeholder="담당자 성명을 입력해주세요"
                            value={form.managerName}
                            onChange={set("managerName")}
                            error={errors.managerName}
                          />
                          <Field
                            label="부서·직위"
                            placeholder="예) 총무팀 / 인사부 대리 / 영업본부 팀장"
                            value={form.department}
                            onChange={set("department")}
                            error={errors.department}
                          />
                          <Field
                            label="담당자 연락처"
                            placeholder="010-0000-0000"
                            value={form.contact}
                            onChange={set("contact")}
                            error={errors.contact}
                          />

                          {/* 안내 메시지 */}
                          <div className="mt-1 flex items-start gap-2.5 bg-[#fafafa] border border-[#ebebeb] rounded-[7px] px-4 py-3.5">
                            <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <p className="text-[11px] text-[#999] leading-relaxed">
                              담당자 정보는 주문 접수, 서비스 운영, 가입 승인 안내 등 중요 연락에 활용됩니다.
                            </p>
                          </div>
                        </>
                      )}

                      {/* ── STEP 3 ── */}
                      {step === 3 && (
                        <>
                          <div className="grid grid-cols-2 gap-3.5">
                            <Field
                              label="사업자번호"
                              placeholder="000-00-00000"
                              value={form.bizNumber}
                              onChange={set("bizNumber")}
                              error={errors.bizNumber}
                            />
                            <Field
                              label="회사명"
                              placeholder="법인명을 입력해주세요"
                              value={form.companyName}
                              onChange={set("companyName")}
                              error={errors.companyName}
                            />
                          </div>
                          <Field
                            label="대표자명"
                            placeholder="대표자 성명을 입력해주세요"
                            value={form.ceoName}
                            onChange={set("ceoName")}
                            error={errors.ceoName}
                          />
                          <Field
                            label="사업장 소재지"
                            placeholder="사업자등록증 상의 주소를 입력해주세요"
                            value={form.address}
                            onChange={set("address")}
                            error={errors.address}
                          />
                          <Field
                            label="계산서 수신 이메일"
                            type="email"
                            placeholder="세금계산서를 수신할 이메일 주소"
                            value={form.email}
                            onChange={set("email")}
                            error={errors.email}
                          />

                          {/* 전자서명 버튼 */}
                          <button
                            type="button"
                            className="mt-1 w-full flex items-center justify-between px-4 py-3 rounded-[7px] border border-[#e8e8e8] bg-[#fafafa] hover:border-[#d8d8d8] hover:bg-[#f3f3f3] transition-all group"
                          >
                            <span
                              style={{ fontFamily: "'Pretendard', sans-serif" }}
                              className="flex items-center gap-2.5 text-[13px] text-[#444] font-medium"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                              </svg>
                              계약서 전자서명
                            </span>
                            <span
                              style={{ fontFamily: "'Pretendard', sans-serif" }}
                              className="text-[11px] text-[#999] group-hover:text-[#555] transition-colors font-medium"
                            >
                              서명하기
                              <svg className="inline ml-1" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 하단 버튼 */}
                  <div className="flex gap-2.5 mt-4">
                    {typeof step === "number" && step > 1 && (
                      <button
                        onClick={prev}
                        style={{ fontFamily: "'Pretendard', sans-serif" }}
                        className="flex-1 py-3 rounded-[7px] border border-[#e0e0e0] bg-white text-[13px] text-[#555] font-semibold hover:bg-[#f5f5f5] transition-colors"
                      >
                        이전
                      </button>
                    )}
                    <button
                      onClick={next}
                      style={{ fontFamily: "'Pretendard', sans-serif" }}
                      className="flex-[2] py-3 rounded-[7px] bg-[#f15a2a] text-white text-[13px] font-semibold hover:bg-[#d94a1c] active:bg-[#c4421a] transition-colors shadow-[0_2px_8px_rgba(241,90,42,0.28)]"
                    >
                      {step === 3 ? "가입 완료하기" : "다음 단계"}
                    </button>
                  </div>

                  {/* 하단 텍스트 */}
                  <p
                    style={{ fontFamily: "'Pretendard', sans-serif" }}
                    className="text-center text-[11px] text-[#ccc] mt-4"
                  >
                    {typeof step === "number" ? step : 3} / 3 단계
                  </p>
                </>
              ) : (
                /* ══════════════════════════════
                   완료 화면
                ══════════════════════════════ */
                <div className="flex flex-col items-center">

                  {/* 아이콘 */}
                  <div className="w-16 h-16 rounded-full bg-[#111118] flex items-center justify-center mb-6 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>

                  <h2
                    style={{ fontFamily: "'Pretendard', sans-serif", fontWeight: 700 }}
                    className="text-[22px] text-[#111] mb-2"
                  >
                    가입이 완료되었습니다
                  </h2>
                  <p className="text-[13px] text-[#888] text-center leading-relaxed mb-8">
                    {form.companyName && <><strong className="text-[#333]">{form.companyName}</strong>으로 </>}
                    제휴기업 회원 등록이 완료되었습니다.<br />
                    담당자 검토 후 승인 안내를 드립니다.
                  </p>

                  {/* 요약 카드 */}
                  <div className="w-full bg-white rounded-[10px] border border-[#e8e8e8] shadow-[0_1px_6px_rgba(0,0,0,0.04)] mb-5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#f0f0f0]">
                      <h4
                        style={{ fontFamily: "'Pretendard', sans-serif", fontWeight: 600 }}
                        className="text-[11px] text-[#aaa] uppercase tracking-widest"
                      >
                        가입 정보
                      </h4>
                    </div>
                    {[
                      { label: "아이디", value: form.userId },
                      { label: "담당자", value: form.managerName },
                      { label: "연락처", value: form.contact },
                      { label: "회사명", value: form.companyName },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between px-6 py-3.5 border-b border-[#f5f5f5] last:border-none">
                        <span
                          style={{ fontFamily: "'Pretendard', sans-serif" }}
                          className="text-[12px] text-[#aaa]"
                        >
                          {label}
                        </span>
                        <span
                          style={{ fontFamily: "'Pretendard', sans-serif" }}
                          className="text-[13px] text-[#222] font-medium"
                        >
                          {value || "—"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 혜택 안내 */}
                  <div className="w-full flex items-start gap-3 bg-[#fafafa] border border-[#ebebeb] rounded-[8px] px-5 py-4 mb-7">
                    <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f15a2a" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p
                      style={{ fontFamily: "'Pretendard', sans-serif" }}
                      className="text-[12px] text-[#777] leading-relaxed"
                    >
                      승인 완료 후 경조사 상품을 <strong className="text-[#333]">1회 무료</strong>로 이용하실 수 있습니다.
                      담당자 연락처({form.contact})로 안내가 전송됩니다.
                    </p>
                  </div>

                  <button
                    onClick={() => navigate("/login")}
                    style={{ fontFamily: "'Pretendard', sans-serif" }}
                    className="w-full py-3.5 rounded-[8px] bg-[#f15a2a] text-white text-[13px] font-semibold hover:bg-[#d94a1c] transition-colors shadow-[0_2px_8px_rgba(241,90,42,0.28)]"
                  >
                    로그인 페이지로 이동
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
