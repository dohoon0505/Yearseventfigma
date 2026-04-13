import React, { useState } from "react";
import { useNavigate } from "react-router";
import {
  User, Phone, MapPin, ChevronRight,
  Pencil, CheckCircle, X, Star,
  Package, Truck, Bell, BellOff, FileText, Users,
  AlertCircle, Tag, CalendarDays, Clock,
} from "lucide-react";
import { useAppStore, ALL_PRODUCTS, productKey, Contact, Profile, Product } from "../store/AppContext";
import { PageTitle } from "../components/ui/PageTitle";

// ─── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex w-10 h-[22px] rounded-full transition-colors duration-200 ${on ? "bg-[#4169e1]" : "bg-[#d0d0d0]"}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${on ? "translate-x-[18px]" : "translate-x-0"}`} />
    </button>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, extra }: {
  title: string; icon: React.ReactNode;
  children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-[8px] border border-[#e0e0e0] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e8e8e8] bg-[#fafafa]">
        <div className="flex items-center gap-2">
          <span className="text-[#4169e1]">{icon}</span>
          <span className="text-[15px] text-[#222] font-bold">{title}</span>
        </div>
        {extra}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Field Input ───────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, icon, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1 text-[14px] text-[#555] font-medium">
        {label}{required && <span className="text-[#f15a2a]">*</span>}
      </label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]">{icon}</span>}
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-[#d0d0d0] rounded-[4px] py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] focus:ring-1 focus:ring-[#4169e1]/20 transition-all placeholder:text-[#ccc] ${icon ? "pl-9 pr-3" : "px-3"}`}
        />
      </div>
    </div>
  );
}

// ─── 담당자 선택 화면 ──────────────────────────────────────────────────────────
function ContactSelector({ contacts, onSelect }: {
  contacts: Contact[];
  onSelect: (c: Contact) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-6">
      <div className="w-full max-w-[680px]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#eef1fd] mb-4">
            <Users size={28} className="text-[#4169e1]" />
          </div>
          <h2 className="text-[20px] text-[#222] font-bold mb-1.5">담당자를 선택해 주세요</h2>
          <p className="text-[15px] text-[#888]">주문을 진행할 담당자를 선택하면 주문서 작성이 시작됩니다.</p>
        </div>

        {contacts.length === 0 ? (
          <div className="bg-white border border-[#e0e0e0] rounded-[10px] p-8 text-center flex flex-col items-center gap-4">
            <AlertCircle size={32} className="text-[#bbb]" />
            <div>
              <p className="text-[15px] text-[#555] font-medium">등록된 담당자가 없습니다</p>
              <p className="text-[15px] text-[#999] mt-1">프로필 저장공간에서 담당자를 먼저 등록해 주세요.</p>
            </div>
            <button
              onClick={() => navigate("/app/profile")}
              className="px-5 py-2.5 bg-[#4169e1] text-white rounded-[4px] text-[15px] font-medium hover:bg-[#3558c4] transition-colors"
            >
              담당자 등록하러 가기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {contacts.map((c) => (
              <button
                key={c.no}
                onClick={() => onSelect(c)}
                className="group flex items-center justify-between bg-white border border-[#e0e0e0] rounded-[10px] px-6 py-4 hover:border-[#4169e1] hover:bg-[#f8f9ff] transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#eef1fd] flex items-center justify-center shrink-0">
                    <User size={18} className="text-[#4169e1]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] text-[#222] font-bold">{c.name}</span>
                      <span className="px-2 py-0.5 bg-[#f0f3fd] text-[#4169e1] rounded-[3px] text-[13px] font-medium">{c.role}</span>
                    </div>
                    <p className="text-[14px] text-[#999] mt-0.5">{c.phone}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-[#bbb] group-hover:text-[#4169e1] transition-colors" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/app/profile")}
            className="text-[14px] text-[#4169e1] hover:underline"
          >
            + 새 담당자 등록하기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 리본문구 모달 ─────────────────────────────────────────────────────────────
const COMMON_PHRASES = [
  { group: "부고·근조", phrases: ["삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다"] },
  { group: "결혼 축하", phrases: ["축 결혼(祝 結婚)", "화혼을 진심으로 축하드립니다", "행복한 새 출발을 축하합니다"] },
  { group: "개업·취임", phrases: ["축 개업(祝 開業)", "축 취임(祝 就任)", "번창하시길 기원합니다"] },
  { group: "기타", phrases: ["감사합니다", "항상 건강하세요", "축 승진(祝 昇진)"] },
];

function RibbonModal({ open, onClose, initial, onConfirm }: {
  open: boolean; onClose: () => void;
  initial: string; onConfirm: (phrase: string) => void;
}) {
  const [tab, setTab] = useState<"common" | "custom">("common");
  const [selected, setSelected] = useState(initial);
  const [custom, setCustom] = useState(initial);

  React.useEffect(() => {
    if (open) { setSelected(initial); setCustom(initial); setTab("common"); }
  }, [open, initial]);

  const currentPhrase = tab === "common" ? selected : custom;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[540px] mx-4 flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#fff0eb] flex items-center justify-center">
              <Tag size={16} className="text-[#f15a2a]" />
            </div>
            <div>
              <h3 className="text-[14px] text-[#222] font-bold">리본 문구 작성</h3>
              <p className="text-[11px] text-[#999]">화환 리본에 표시될 문구를 선택하거나 직접 입력하세요.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#aaa] hover:text-[#555] transition-colors"><X size={18} /></button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#e0e0e0]">
          {([["common", "자주 사용 문구"], ["custom", "직접 입력"]] as const).map(([k, label]) => (
            <button
              key={k} onClick={() => setTab(k)}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors border-b-2 ${tab === k ? "text-[#4169e1] border-[#4169e1]" : "text-[#888] border-transparent hover:text-[#555]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === "common" ? (
            <div className="flex flex-col gap-4">
              {COMMON_PHRASES.map((group) => (
                <div key={group.group}>
                  <p className="text-[11px] text-[#999] font-medium mb-2">{group.group}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.phrases.map((phrase) => (
                      <button
                        key={phrase}
                        onClick={() => setSelected(phrase)}
                        className={`px-3 py-2 rounded-[6px] border text-[13px] transition-all ${selected === phrase ? "bg-[#f0f3fd] border-[#4169e1] text-[#4169e1] font-medium" : "bg-white border-[#e0e0e0] text-[#555] hover:border-[#a0a8d9]"}`}
                      >
                        {phrase}
                        {selected === phrase && <CheckCircle size={12} className="inline ml-1.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="리본에 표시될 문구를 직접 입력해 주세요."
                rows={4}
                className="w-full border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[13px] text-[#333] outline-none focus:border-[#4169e1] resize-none placeholder:text-[#bbb]"
              />
              <p className="text-[11px] text-[#bbb] text-right">{custom.length}자</p>
            </div>
          )}
        </div>

        {/* 미리보기 */}
        {currentPhrase && (
          <div className="mx-5 mb-2 rounded-[6px] bg-[#fff8f5] border border-[#ffddd0] px-4 py-3">
            <p className="text-[11px] text-[#f15a2a] font-medium mb-1">리본 문구 미리보기</p>
            <p className="text-[14px] text-[#333] font-medium">{currentPhrase}</p>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#e0e0e0]">
          <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
          <button
            onClick={() => { onConfirm(currentPhrase); onClose(); }}
            disabled={!currentPhrase}
            className={`px-5 py-2 rounded-[4px] text-[13px] font-semibold transition-colors ${currentPhrase ? "bg-[#f15a2a] text-white hover:bg-[#d94e24]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 보내는분 선택 모달 ────────────────────────────────────────────────────────
function SenderModal({ open, onClose, profiles, selected, onConfirm }: {
  open: boolean; onClose: () => void;
  profiles: Profile[]; selected: Profile | null;
  onConfirm: (p: Profile) => void;
}) {
  const [pick, setPick] = useState<Profile | null>(selected);

  React.useEffect(() => {
    if (open) setPick(selected);
  }, [open, selected]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[500px] mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#eef1fd] flex items-center justify-center">
              <User size={16} className="text-[#4169e1]" />
            </div>
            <div>
              <h3 className="text-[14px] text-[#222] font-bold">보내는분 선택</h3>
              <p className="text-[11px] text-[#999]">리본에 표시될 발신인 프로필을 선택하세요.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#aaa] hover:text-[#555] transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-2">
          {profiles.length === 0 && (
            <div className="text-center py-8 text-[13px] text-[#999]">등록된 프로필이 없습니다.<br />프로필 저장공간에서 먼저 등록해 주세요.</div>
          )}
          {profiles.map((p) => (
            <label
              key={p.no}
              className={`flex items-start gap-3 border rounded-[8px] px-4 py-3 cursor-pointer transition-all ${pick?.no === p.no ? "border-[#4169e1] bg-[#f0f3fd]" : "border-[#e0e0e0] bg-white hover:border-[#a0a8d9]"}`}
            >
              <input type="radio" name="sender" value={p.no} checked={pick?.no === p.no} onChange={() => setPick(p)} className="accent-[#4169e1] mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[#222] font-bold">{p.name}</span>
                  <span className="text-[11px] text-[#666]">{p.role}</span>
                </div>
                <p className="text-[12px] text-[#888] mt-0.5 truncate">{p.greeting}</p>
              </div>
            </label>
          ))}
        </div>

        {pick && (
          <div className="mx-4 mb-3 rounded-[6px] bg-[#f8f9ff] border border-[#dce2fb] px-4 py-2.5">
            <p className="text-[11px] text-[#4169e1] font-medium mb-0.5">선택된 프로필 고정문구</p>
            <p className="text-[13px] text-[#333] font-medium">{pick.greeting}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-4 border-t border-[#e0e0e0]">
          <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
          <button
            onClick={() => { if (pick) { onConfirm(pick); onClose(); } }}
            disabled={!pick}
            className={`px-5 py-2 rounded-[4px] text-[13px] font-semibold transition-colors ${pick ? "bg-[#4169e1] text-white hover:bg-[#3558c4]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}
          >
            선택 완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 간편접수 모달 (부고장 / 청첩장) ──────────────────────────────────────────
type QuickType = "부고" | "청첩";
const QUICK_CONFIG = {
  부고: { title: "부고장 간편접수", emoji: "🌸", desc: "부고 URL을 입력하면 배송지 정보를 자동으로 불러옵니다." },
  청첩: { title: "청첩장 간편접수", emoji: "💍", desc: "청첩장 URL을 입력하면 배송지 정보를 자동으로 불러옵니다." },
};

// 모의 URL 조회 데이터 (실제 연동 시 API로 교체)
const MOCK_URL_DB: Record<string, { addr: string; toName: string }> = {
  "kakao.com":       { addr: "서울특별시 강남구 테헤란로 152 강남파이낸스센터 3층", toName: "김○○ 상주" },
  "naeil.com":       { addr: "경기도 성남시 분당구 판교로 289 판교오피스 빌딩", toName: "이○○ 상주" },
  "mobile.co.kr":   { addr: "서울특별시 중구 세종대로 110 서울시청 본관 2층", toName: "박○○ 상주" },
  "wedding.me":     { addr: "서울특별시 서초구 강남대로 373 홀리데이인 강남", toName: "최○○ 신랑측" },
  "weddingbook.com":{ addr: "서울특별시 마포구 백범로 235 서울창업허브 컨벤션홀", toName: "정○○ 신부측" },
};

type UrlStatus = "idle" | "loading" | "success" | "error";

function QuickOrderModal({ open, type, onClose, profiles }: {
  open: boolean; type: QuickType | null; onClose: () => void; profiles: Profile[];
}) {
  const cfg = type ? QUICK_CONFIG[type] : null;

  const [url, setUrl]             = useState("");
  const [urlStatus, setUrlStatus] = useState<UrlStatus>("idle");
  const [addr, setAddr]           = useState("");
  const [toName, setToName]       = useState("");
  const [toPhone, setToPhone]     = useState("");
  const [step, setStep]           = useState<1 | 2>(1);
  const [sender, setSender]       = useState<Profile | null>(null);
  const [done, setDone]           = useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (open) {
      setUrl(""); setUrlStatus("idle");
      setAddr(""); setToName(""); setToPhone("");
      setStep(1); setSender(null); setDone(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open]);

  const handleLookup = () => {
    if (!url.trim()) return;
    setUrlStatus("loading");
    setAddr(""); setToName("");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const matched = Object.entries(MOCK_URL_DB).find(([domain]) => url.includes(domain));
      if (matched && url.startsWith("http")) {
        setAddr(matched[1].addr);
        setToName(matched[1].toName);
        setUrlStatus("success");
      } else {
        setUrlStatus("error");
      }
    }, 1800);
  };

  const handleUrlChange = (v: string) => {
    setUrl(v);
    if (urlStatus !== "idle") { setUrlStatus("idle"); setAddr(""); setToName(""); }
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const step1Valid = urlStatus === "success" && !!toPhone;

  if (!cfg || !type) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[500px] mx-4 flex flex-col">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2.5">
            <span className="text-[24px]">{cfg.emoji}</span>
            <div>
              <h3 className="text-[15px] text-[#222] font-bold">{cfg.title}</h3>
              <p className="text-[11px] text-[#999]">{cfg.desc}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#aaa] hover:text-[#555] transition-colors"><X size={18} /></button>
        </div>

        {done ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#e8f5e9] flex items-center justify-center">
              <CheckCircle size={28} className="text-[#4caf50]" />
            </div>
            <div className="text-center">
              <p className="text-[16px] text-[#222] font-bold">간편접수가 완료되었습니다!</p>
              <p className="text-[13px] text-[#888] mt-1">담당자에게 배송 완료 알림이 발송됩니다.</p>
            </div>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-[#4169e1] text-white rounded-[4px] text-[13px] font-semibold hover:bg-[#3558c4] transition-colors">확인</button>
          </div>
        ) : (
          <>
            {/* 스텝 인디케이터 */}
            <div className="flex items-center px-6 pt-4 pb-1 gap-2">
              {([1, 2] as const).map((s) => (
                <React.Fragment key={s}>
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors ${step >= s ? "bg-[#4169e1] text-white" : "bg-[#e0e0e0] text-[#999]"}`}>{s}</div>
                  {s < 2 && <div className={`flex-1 h-px transition-colors ${step > s ? "bg-[#4169e1]" : "bg-[#e0e0e0]"}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div className="px-6 py-4 flex flex-col gap-4">
                <p className="text-[12px] text-[#999] font-medium">STEP 1 — URL 조회 및 배송지 확인</p>

                {/* URL 입력 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] text-[#555] font-medium flex items-center gap-1">
                    {type === "부고" ? "부고장" : "청첩장"} URL <span className="text-[#f15a2a]">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                      </span>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
                        placeholder="https://..."
                        className={`w-full border rounded-[4px] pl-9 pr-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-[#bbb] text-[#333] ${
                          urlStatus === "error"   ? "border-[#f44336] bg-[#fff5f5]" :
                          urlStatus === "success" ? "border-[#4caf50] bg-[#f1fbf2]" :
                          "border-[#d0d0d0] focus:border-[#4169e1] focus:ring-1 focus:ring-[#4169e1]/20"
                        }`}
                      />
                    </div>
                    <button
                      onClick={handleLookup}
                      disabled={!url.trim() || urlStatus === "loading"}
                      className={`shrink-0 px-4 py-2 rounded-[4px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                        url.trim() && urlStatus !== "loading"
                          ? "bg-[#4169e1] text-white hover:bg-[#3558c4]"
                          : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"
                      }`}
                    >
                      {urlStatus === "loading" ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      ) : "조회"}
                    </button>
                  </div>

                  {/* 상태 피드백 */}
                  {urlStatus === "loading" && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <svg className="animate-spin w-3.5 h-3.5 text-[#4169e1]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      <span className="text-[12px] text-[#4169e1]">배송지 정보를 조회하고 있습니다...</span>
                    </div>
                  )}
                  {urlStatus === "error" && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span className="text-[12px] text-[#f44336] font-medium">URL을 다시 확인해주세요.</span>
                    </div>
                  )}
                  {urlStatus === "success" && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CheckCircle size={13} className="text-[#4caf50]" />
                      <span className="text-[12px] text-[#4caf50] font-medium">배송지 정보를 불러왔습니다.</span>
                    </div>
                  )}
                </div>

                {/* 자동입력 필드 영역 */}
                <div className={`flex flex-col gap-3 transition-opacity duration-300 ${urlStatus === "success" ? "opacity-100" : "opacity-40 pointer-events-none select-none"}`}>
                  {/* 배송지 주소 */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-[#555] font-medium flex items-center gap-1.5">
                      배송지 주소
                      {urlStatus === "success" && (
                        <span className="px-1.5 py-0.5 bg-[#e8f5e9] text-[#388e3c] rounded-[3px] text-[10px] font-semibold">자동입력</span>
                      )}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"><MapPin size={14} /></span>
                      <input
                        type="text" value={addr} onChange={(e) => setAddr(e.target.value)}
                        placeholder="URL 조회 후 자동 입력됩니다"
                        className="w-full border border-[#d0d0d0] rounded-[4px] pl-9 pr-3 py-2.5 text-[13px] text-[#333] outline-none focus:border-[#4169e1] transition-all placeholder:text-[#bbb]"
                      />
                    </div>
                  </div>

                  {/* 받는분 성함 */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-[#555] font-medium flex items-center gap-1.5">
                      받는분 성함
                      {urlStatus === "success" && (
                        <span className="px-1.5 py-0.5 bg-[#e8f5e9] text-[#388e3c] rounded-[3px] text-[10px] font-semibold">자동입력</span>
                      )}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"><User size={14} /></span>
                      <input
                        type="text" value={toName} onChange={(e) => setToName(e.target.value)}
                        placeholder="URL 조회 후 자동 입력됩니다"
                        className="w-full border border-[#d0d0d0] rounded-[4px] pl-9 pr-3 py-2.5 text-[13px] text-[#333] outline-none focus:border-[#4169e1] transition-all placeholder:text-[#bbb]"
                      />
                    </div>
                  </div>

                  {/* 받는분 연락처 — 수동입력 */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-[#555] font-medium flex items-center gap-1">
                      받는분 연락처 <span className="text-[#f15a2a]">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"><Phone size={14} /></span>
                      <input
                        type="text" value={toPhone} onChange={(e) => setToPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full border border-[#d0d0d0] rounded-[4px] pl-9 pr-3 py-2.5 text-[13px] text-[#333] outline-none focus:border-[#4169e1] focus:ring-1 focus:ring-[#4169e1]/20 transition-all placeholder:text-[#bbb]"
                      />
                    </div>
                  </div>
                </div>

                {/* 조회 안내 (idle 상태에만) */}
                {urlStatus === "idle" && (
                  <div className="flex items-start gap-2 bg-[#f8f9ff] border border-[#dce2fb] rounded-[4px] px-3 py-2.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4169e1" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p className="text-[12px] text-[#4169e1] leading-[1.6]">
                      {type === "부고" ? "카카오 부고 등" : "청첩장"} URL을 붙여넣고 <strong>조회</strong> 버튼을 눌러주세요.<br />
                      배송지 주소와 받는분 성함이 자동으로 입력됩니다.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="px-6 py-4 flex flex-col gap-4">
                <p className="text-[12px] text-[#999] font-medium">STEP 2 — 보내는분 선택</p>
                <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                  {profiles.length === 0 && (
                    <div className="text-center py-6 text-[13px] text-[#999]">등록된 프로필이 없습니다.<br />프로필 저장공간에서 먼저 등록해 주세요.</div>
                  )}
                  {profiles.map((p) => (
                    <label key={p.no} className={`flex items-center gap-3 border rounded-[6px] px-3 py-2.5 cursor-pointer transition-all ${sender?.no === p.no ? "border-[#4169e1] bg-[#f0f3fd]" : "border-[#e0e0e0] hover:border-[#a0a8d9]"}`}>
                      <input type="radio" checked={sender?.no === p.no} onChange={() => setSender(p)} className="accent-[#4169e1]" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] text-[#222] font-medium">{p.name}</span>
                        <span className="text-[12px] text-[#888] ml-1.5">{p.role}</span>
                        <p className="text-[11px] text-[#aaa] mt-0.5 truncate">{p.greeting}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* 주문 요약 */}
                <div className="rounded-[6px] bg-[#f8f9ff] border border-[#dce2fb] p-3 flex flex-col gap-1.5">
                  <p className="text-[11px] text-[#4169e1] font-medium mb-0.5">주문 요약</p>
                  <p className="text-[12px] text-[#555] flex items-start gap-1.5"><MapPin size={12} className="shrink-0 mt-0.5 text-[#888]" />{addr}</p>
                  <p className="text-[12px] text-[#555] flex items-center gap-1.5"><User size={12} className="shrink-0 text-[#888]" />받는분: {toName} ({toPhone})</p>
                  {sender && <p className="text-[12px] text-[#555] flex items-center gap-1.5"><CheckCircle size={12} className="shrink-0 text-[#4caf50]" />보내는분: {sender.greeting}</p>}
                </div>
              </div>
            )}

            {/* 푸터 버튼 */}
            <div className="flex justify-end gap-2 px-6 pb-5">
              {step > 1 && (
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">이전</button>
              )}
              <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
              {step === 1 ? (
                <button
                  onClick={() => setStep(2)}
                  disabled={!step1Valid}
                  className={`px-5 py-2 rounded-[4px] text-[13px] font-semibold transition-colors ${step1Valid ? "bg-[#4169e1] text-white hover:bg-[#3558c4]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}
                >
                  적용
                </button>
              ) : (
                <button
                  onClick={() => setDone(true)}
                  className="px-5 py-2 bg-[#f15a2a] text-white rounded-[4px] text-[13px] font-semibold hover:bg-[#d94e24] transition-colors"
                >
                  접수하기
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 주문 성공 모달 ────────────────────────────────────────────────────────────
function SuccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[380px] mx-4 p-8 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#e8f5e9] flex items-center justify-center">
          <CheckCircle size={32} className="text-[#4caf50]" />
        </div>
        <div className="text-center">
          <p className="text-[17px] text-[#222] font-bold">주문이 접수되었습니다!</p>
          <p className="text-[13px] text-[#888] mt-1.5 leading-[1.6]">실시간 주문내역에서 진행 상황을 확인할 수 있습니다.</p>
        </div>
        <button onClick={onClose} className="w-full py-2.5 bg-[#4169e1] text-white rounded-[4px] text-[13px] font-semibold hover:bg-[#3558c4] transition-colors">확인</button>
      </div>
    </div>
  );
}

// ─── 주문 폼 메인 ──────────────────────────────────────────────────────────────
function OrderForm({ contact, onChangeContact }: {
  contact: Contact; onChangeContact: () => void;
}) {
  const navigate = useNavigate();
  const { favorites, profiles } = useAppStore();

  // 즐겨찾기 상품
  const favProducts: Product[] = ALL_PRODUCTS.filter((p) => favorites.has(productKey(p)));

  // 상품 선택 (단일)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  // 배송지
  const [address, setAddress] = useState("");
  const [toName, setToName]   = useState("");
  const [toPhone, setToPhone] = useState("");

  // 배송요청 일시
  const [immediateDelivery, setImmediateDelivery] = useState(false);
  const [deliveryDate,   setDeliveryDate]   = useState("");
  const [deliveryHour,   setDeliveryHour]   = useState("09");
  const [deliveryMinute, setDeliveryMinute] = useState("00");

  // 리본
  const [ribbonPhrase, setRibbonPhrase] = useState("");
  const [sender, setSender]             = useState<Profile | null>(null);

  // 수신 설정
  const [notifyRecipient, setNotifyRecipient] = useState(true);
  const [notifySender,    setNotifySender]    = useState(true);
  const [notifyManager,   setNotifyManager]   = useState(true);

  // 모달
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const [senderOpen, setSenderOpen] = useState(false);
  const [quickType,  setQuickType]  = useState<QuickType | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const selectedItem = selectedProduct
    ? favProducts.find((p) => productKey(p) === selectedProduct) ?? null
    : null;

  const totalAmount = selectedItem
    ? parseInt(selectedItem.price.replace(/[^0-9]/g, ""), 10)
    : 0;

  const deliveryTimeReady = immediateDelivery || !!deliveryDate;
  const isReady = address && toName && toPhone && selectedItem && ribbonPhrase && sender && deliveryTimeReady;

  const handleSubmit = () => {
    if (!isReady) return;
    setSuccessOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 담당자 표시 바 */}
      <div className="px-6 py-3 bg-white border-b border-[#e0e0e0]">
        <div className="flex items-center gap-3 max-w-[1200px]">
          <div className="w-7 h-7 rounded-full bg-[#eef1fd] flex items-center justify-center">
            <User size={14} className="text-[#4169e1]" />
          </div>
          <span className="text-[15px] text-[#555]">담당자:</span>
          <span className="text-[15px] text-[#222] font-bold">{contact.name}</span>
          <span className="px-2 py-0.5 bg-[#f0f3fd] text-[#4169e1] rounded-[3px] text-[13px] font-medium">{contact.role}</span>
          <span className="text-[14px] text-[#999]">{contact.phone}</span>
          <button onClick={onChangeContact} className="ml-auto text-[14px] text-[#4169e1] hover:underline flex items-center gap-0.5">
            <Pencil size={13} /> 변경
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px]">
        {/* 간편접수 버튼 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setQuickType("부고")}
            className="flex-1 relative flex items-center justify-center h-[80px] bg-[#3c3c48] hover:bg-[#2e2e38] text-white rounded-[8px] transition-colors overflow-hidden"
          >
            {/* 배경 장식 */}
            <div className="absolute left-0 top-0 h-full w-[6px] bg-[#6c6c88]" />
            <div className="absolute right-0 top-0 h-full w-1/3 bg-white/[0.03]" />
            {/* 콘텐츠 */}
            <div className="text-center px-10">
              <p className="text-[17px] font-bold tracking-tight leading-tight">부고장으로 간편접수</p>
              <p className="text-[13px] text-white/50 mt-1">근조화환 빠른주문</p>
            </div>
            <ChevronRight size={20} className="absolute right-5 top-1/2 -translate-y-1/2 opacity-40" />
          </button>
          <button
            onClick={() => setQuickType("청첩")}
            className="flex-1 relative flex items-center justify-center h-[80px] bg-[#b01254] hover:bg-[#94104a] text-white rounded-[8px] transition-colors overflow-hidden"
          >
            {/* 배경 장식 */}
            <div className="absolute left-0 top-0 h-full w-[6px] bg-[#e05090]" />
            <div className="absolute right-0 top-0 h-full w-1/3 bg-white/[0.03]" />
            {/* 콘텐츠 */}
            <div className="text-center px-10">
              <p className="text-[17px] font-bold tracking-tight leading-tight">청첩장으로 간편접수</p>
              <p className="text-[13px] text-white/50 mt-1">축하화환 빠른주문</p>
            </div>
            <ChevronRight size={20} className="absolute right-5 top-1/2 -translate-y-1/2 opacity-40" />
          </button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#e0e0e0]" />
          <span className="text-[14px] text-[#bbb] font-medium">일반 주문서 작성</span>
          <div className="flex-1 h-px bg-[#e0e0e0]" />
        </div>

        <div className="flex gap-5 items-start">
          {/* ─── 좌측 폼 ── */}
          <div className="w-[760px] shrink-0 flex flex-col gap-4">

            {/* 상품 선택 */}
            <SectionCard title="상품 선택" icon={<Package size={16} />} extra={
              favProducts.length === 0 ? null : (
                <span className="text-[13px] text-[#4169e1] cursor-pointer hover:underline" onClick={() => navigate("/app/products")}>즐겨찾기 관리</span>
              )
            }>
              {favProducts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <Star size={24} className="text-[#ddd]" />
                  <div>
                    <p className="text-[15px] text-[#777] font-medium">즐겨찾기 상품이 없습니다</p>
                    <p className="text-[14px] text-[#999] mt-0.5">상품 규격 안내 페이지에서 즐겨찾기를 설정해 주세요.</p>
                  </div>
                  <button onClick={() => navigate("/app/products")} className="px-4 py-2 bg-[#f15a2a] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#d94e24] transition-colors">
                    상품 규격 안내 보기
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {favProducts.map((p) => {
                    const key = productKey(p);
                    const isSelected = selectedProduct === key;
                    return (
                      <label
                        key={key}
                        className={`flex items-center gap-3 border rounded-[6px] px-3 py-2.5 cursor-pointer transition-all ${isSelected ? "border-[#4169e1] bg-[#f8f9ff]" : "border-[#e8e8e8] bg-white hover:border-[#a0a8d9]"}`}
                      >
                        <input
                          type="radio"
                          name="product"
                          value={key}
                          checked={isSelected}
                          onChange={() => setSelectedProduct(key)}
                          className="accent-[#4169e1] shrink-0"
                        />
                        <span className="text-[18px] shrink-0">{p.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] text-[#222] font-medium truncate">{p.product}</p>
                          <p className="text-[13px] text-[#999]">{p.category}</p>
                        </div>
                        <span className={`text-[15px] font-bold shrink-0 ${isSelected ? "text-[#4169e1]" : "text-[#888]"}`}>{p.price}</span>
                        {isSelected && <CheckCircle size={15} className="text-[#4169e1] shrink-0" />}
                      </label>
                    );
                  })}
                  {selectedItem && (
                    <div className="mt-1 flex justify-between items-center pt-2 border-t border-[#e8e8e8]">
                      <span className="text-[14px] text-[#888]">선택 상품: {selectedItem.product}</span>
                      <span className="text-[15px] text-[#f15a2a] font-bold">{totalAmount.toLocaleString()}원</span>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* 배송지 정보 */}
            <SectionCard title="배송지 정보" icon={<Truck size={16} />}>
              <div className="flex flex-col gap-3">
                <InputField label="배송지 주소" value={address} onChange={setAddress} placeholder="배송지 주소를 입력해 주세요" icon={<MapPin size={14} />} required />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="받는분 성함" value={toName} onChange={setToName} placeholder="예) 홍길동" icon={<User size={14} />} required />
                  <InputField label="받는분 연락처" value={toPhone} onChange={setToPhone} placeholder="010-0000-0000" icon={<Phone size={14} />} required />
                </div>

                {/* 배송요청 일시 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[14px] text-[#555] font-medium">
                      <CalendarDays size={15} className="text-[#4169e1]" />
                      배송요청 일시<span className="text-[#f15a2a]">*</span>
                    </label>
                    <label className="flex items-center gap-1.5 ml-auto cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={immediateDelivery}
                        onChange={(e) => setImmediateDelivery(e.target.checked)}
                        className="accent-[#4169e1] w-[14px] h-[14px]"
                      />
                      <span className="text-[14px] text-[#4169e1] font-medium">즉시배송</span>
                    </label>
                  </div>
                  <div className={`flex items-center gap-2 transition-opacity ${immediateDelivery ? "opacity-40 pointer-events-none select-none" : "opacity-100"}`}>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]"><CalendarDays size={15} /></span>
                      <input
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        disabled={immediateDelivery}
                        className="w-full border border-[#d0d0d0] rounded-[4px] pl-9 pr-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] focus:ring-1 focus:ring-[#4169e1]/20 transition-all"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#bbb]"><Clock size={15} /></span>
                      <select
                        value={deliveryHour}
                        onChange={(e) => setDeliveryHour(e.target.value)}
                        disabled={immediateDelivery}
                        className="border border-[#d0d0d0] rounded-[4px] pl-8 pr-2 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] transition-all appearance-none bg-white cursor-pointer"
                      >
                        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                          <option key={h} value={h}>{h}시</option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={deliveryMinute}
                      onChange={(e) => setDeliveryMinute(e.target.value)}
                      disabled={immediateDelivery}
                      className="border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] transition-all appearance-none bg-white cursor-pointer"
                    >
                      {["00", "10", "20", "30", "40", "50"].map((m) => (
                        <option key={m} value={m}>{m}분</option>
                      ))}
                    </select>
                  </div>
                  {immediateDelivery && (
                    <p className="text-[14px] text-[#4169e1] font-medium flex items-center gap-1">
                      <CheckCircle size={14} /> 즉시배송으로 접수됩니다.
                    </p>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* 리본문구 & 보내는분 */}
            <SectionCard title="리본 정보" icon={<Tag size={16} />}>
              <div className="flex flex-col gap-3">
                {/* 리본문구 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[14px] text-[#555] font-medium flex items-center gap-1">리본 문구<span className="text-[#f15a2a]">*</span></label>
                    <button onClick={() => setRibbonOpen(true)} className="flex items-center gap-1 text-[13px] text-[#4169e1] hover:underline">
                      <Pencil size={13} /> {ribbonPhrase ? "수정" : "작성하기"}
                    </button>
                  </div>
                  <div
                    onClick={() => setRibbonOpen(true)}
                    className={`w-full border rounded-[4px] px-3 py-2.5 text-[14px] cursor-pointer transition-all ${ribbonPhrase ? "border-[#4169e1] bg-[#f8f9ff] text-[#333] font-medium" : "border-dashed border-[#ccc] text-[#bbb] hover:border-[#4169e1]"}`}
                  >
                    {ribbonPhrase || "리본 문구를 작성해 주세요"}
                  </div>
                </div>

                {/* 보내는분 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[14px] text-[#555] font-medium flex items-center gap-1">보내는분<span className="text-[#f15a2a]">*</span></label>
                    <button onClick={() => setSenderOpen(true)} className="flex items-center gap-1 text-[13px] text-[#4169e1] hover:underline">
                      <User size={13} /> {sender ? "변경" : "선택하기"}
                    </button>
                  </div>
                  {sender ? (
                    <div
                      onClick={() => setSenderOpen(true)}
                      className="w-full border border-[#4169e1] bg-[#f8f9ff] rounded-[4px] px-3 py-2.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-[#222] font-bold">{sender.name}</span>
                        <span className="text-[13px] text-[#888]">{sender.role}</span>
                      </div>
                      <p className="text-[14px] text-[#4169e1] mt-0.5 truncate">{sender.greeting}</p>
                    </div>
                  ) : (
                    <div
                      onClick={() => setSenderOpen(true)}
                      className="w-full border border-dashed border-[#ccc] rounded-[4px] px-3 py-2.5 text-[14px] text-[#bbb] cursor-pointer hover:border-[#4169e1] transition-colors"
                    >
                      프로필에서 보내는분을 선택해 주세요
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* 주문 접수 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={!isReady}
              className={`w-full py-3.5 rounded-[8px] text-[15px] font-bold transition-colors ${isReady ? "bg-[#f15a2a] text-white hover:bg-[#d94e24]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}
            >
              {isReady ? "🌸 주문 접수하기" : "필수 항목을 모두 입력해 주세요"}
            </button>
            {!isReady && (
              <p className="text-center text-[14px] text-[#bbb] -mt-2">
                상품선택 · 배송지 · 리본문구 · 보내는분 필수
              </p>
            )}
          </div>

          {/* ─── 우측 패널 ── */}
          <div className="flex-1 min-w-[300px] flex flex-col gap-4">

            {/* 주문 시 참고사항 */}
            <div className="bg-[#fffbf0] border border-[#f2e0a0] rounded-[8px] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f2e0a0]">
                <FileText size={15} className="text-[#e6a817]" />
                <span className="text-[14px] text-[#8a6d00] font-bold">주문 시 참고사항</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[14px] text-[#7a5c00] leading-[1.8]">
                  • 당일 오전 11:00 이전 주문 건 당일 배송 가능합니다.<br />
                  • 주말 및 공휴일은 배송이 제한됩니다.<br />
                  • 이른 아침·저녁 시간대 배송은 사전 협의가 필요합니다.<br />
                  • 화환 리본 문구는 접수 후 수정이 불가합니다.<br />
                  • 기타 문의: 02-0000-0000
                </p>
              </div>
            </div>

            {/* 배송완료 메세지 수신 */}
            <div className="bg-white border border-[#e0e0e0] rounded-[8px] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8e8e8] bg-[#fafafa]">
                <Bell size={15} className="text-[#4169e1]" />
                <span className="text-[14px] text-[#222] font-bold">배송완료 알림 수신</span>
              </div>
              <div className="px-4 flex flex-col">
                {[
                  { label: "받는분",  name: toName || null,        phone: toPhone || null,    fallback: "미입력",  on: notifyRecipient, set: setNotifyRecipient },
                  { label: "보내는분", name: sender?.name || null,  phone: sender?.phone || null, fallback: "미선택", on: notifySender,    set: setNotifySender },
                  { label: "담당자",  name: contact.name,          phone: contact.phone,      fallback: null,     on: notifyManager,   set: setNotifyManager },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-3 border-b border-[#f3f3f3] last:border-none">
                    <div className="flex flex-col gap-[3px]">
                      <p className="text-[13px] text-[#111] font-semibold">{item.label}</p>
                      <p className="text-[12px] leading-snug">
                        {item.name ? (
                          <>
                            <span className="text-[#444] font-medium">{item.name}</span>
                            {item.phone && (
                              <span className="text-[#aaa]">({item.phone})</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[#ccc]">{item.fallback}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.on
                        ? <Bell size={13} className="text-[#4169e1]" />
                        : <BellOff size={13} className="text-[#bbb]" />}
                      <Toggle on={item.on} onChange={item.set} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-[#f0f0f0] bg-[#f8f9ff]">
                <p className="text-[13px] text-[#999]">배송 완료 시 ON 설정된 분께 문자 메세지가 자동 발송됩니다.</p>
              </div>
            </div>

            {/* 주문 요약 */}
            {selectedItem && (
              <div className="bg-white border border-[#e0e0e0] rounded-[8px] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8e8e8] bg-[#fafafa]">
                  <Package size={15} className="text-[#555]" />
                  <span className="text-[14px] text-[#222] font-bold">주문 상품 요약</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#555] truncate flex-1 mr-2">{selectedItem.product}</span>
                    <span className="text-[13px] text-[#aaa] shrink-0">{selectedItem.category}</span>
                  </div>
                  <div className="pt-2 mt-1 border-t border-[#e8e8e8] flex justify-between">
                    <span className="text-[14px] text-[#555] font-medium">금액</span>
                    <span className="text-[15px] text-[#f15a2a] font-bold">{totalAmount.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* max-w wrapper */}
      </div>

      {/* Modals */}
      <RibbonModal open={ribbonOpen} onClose={() => setRibbonOpen(false)} initial={ribbonPhrase} onConfirm={setRibbonPhrase} />
      <SenderModal open={senderOpen} onClose={() => setSenderOpen(false)} profiles={profiles} selected={sender} onConfirm={setSender} />
      <QuickOrderModal open={!!quickType} type={quickType} onClose={() => setQuickType(null)} profiles={profiles} />
      <SuccessModal open={successOpen} onClose={() => setSuccessOpen(false)} />
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function OrderPage() {
  const { contacts } = useAppStore();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  return (
    <div className="flex flex-col h-full">
      {selectedContact ? (
        <>
          <div className="px-6 pt-5 pb-0 shrink-0">
            <PageTitle icon="🌸" title="경조상품 주문" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <OrderForm contact={selectedContact} onChangeContact={() => setSelectedContact(null)} />
          </div>
        </>
      ) : (
        <div className="px-6 pt-5">
          <PageTitle icon="🌸" title="경조상품 주문" />
          <ContactSelector contacts={contacts} onSelect={setSelectedContact} />
        </div>
      )}
    </div>
  );
}