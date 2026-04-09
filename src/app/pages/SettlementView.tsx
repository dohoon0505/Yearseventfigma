import React, { useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "../components/ui/PageTitle";
import { Modal } from "../components/ui/Modal";
import { FileText, ExternalLink, Building2, Hash, User, Mail, Phone, MapPin, Pencil, CheckCircle } from "lucide-react";
import imgAccounting from "figma:asset/89f44e86951b9673b222bf64d04181d919c190b3.png";

// ─── Company Info State ────────────────────────────────────────────────────────
type CompanyInfo = {
  회사명: string;
  사업자번호: string;
  대표자명: string;
  계산서이메일: string;
  담당자명: string;
  담당자연락처: string;
  사업장주소: string;
};

const DEFAULT_COMPANY: CompanyInfo = {
  회사명: "주식회사 싱크플로",
  사업자번호: "680-87-02988",
  대표자명: "홍길동",
  계산서이메일: "admin@thinkflow.info",
  담당자명: "홍길동",
  담당자연락처: "010-7615-2699",
  사업장주소: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사",
};

// ─── Settlement Data ───────────────────────────────────────────────────────────
type Settlement = {
  id: string;
  발행일: string;
  정산기한: string;
  청구내역: string;
  청구년월: string;
  정산금액: string;
  입금자: string;
  계산서발급: "동의하기" | "발급완료";
  정산확인: "정산완료" | "정산필요";
};

const settlementData: Settlement[] = [
  { id: "B256C987", 발행일: "2026. 05. 01", 정산기한: "2026. 05. 31", 청구내역: "2026년 04월 꽃배달 이용금 청구", 청구년월: "2026년 04월", 정산금액: "350,000원", 입금자: "홍길동", 계산서발급: "동의하기", 정산확인: "정산필요" },
  { id: "C379D421", 발행일: "2026. 04. 01", 정산기한: "2026. 04. 30", 청구내역: "2026년 03월 꽃배달 이용금 청구", 청구년월: "2026년 03월", 정산금액: "650,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "D4816E54", 발행일: "2026. 03. 01", 정산기한: "2026. 03. 31", 청구내역: "2026년 02월 꽃배달 이용금 청구", 청구년월: "2026년 02월", 정산금액: "500,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "E592F876", 발행일: "2026. 02. 01", 정산기한: "2026. 02. 28", 청구내역: "2026년 01월 꽃배달 이용금 청구", 청구년월: "2026년 01월", 정산금액: "1,250,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
  { id: "F613G298", 발행일: "2026. 01. 01", 정산기한: "2026. 01. 31", 청구내역: "2025년 12월 꽃배달 이용금 청구", 청구년월: "2025년 12월", 정산금액: "700,000원", 입금자: "홍길동", 계산서발급: "발급완료", 정산확인: "정산완료" },
];

// ─── Company info row ──────────────────────────────────────────────────────────
type InfoField = { label: string; value: string; flex?: number };

function InfoRow({ fields }: { fields: InfoField[] }) {
  return (
    <div className="flex border-b border-[#e0e0e0] last:border-b-0">
      {fields.map((field, i) => (
        <div
          key={i}
          className={`flex ${i > 0 ? "border-l border-[#e0e0e0]" : ""}`}
          style={{ flex: field.flex ?? 1 }}
        >
          <div className="w-[120px] shrink-0 bg-[#f5f5f5] px-3 py-2.5 text-[14px] text-[#555] font-medium border-r border-[#e0e0e0]">
            {field.label}
          </div>
          <div className="flex-1 px-3 py-2.5 text-[14px] text-[#444]">{field.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Edit Modal Field ──────────────────────────────────────────────────────────
function EditField({
  label, value, onChange, placeholder, icon, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; icon?: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1 text-[13px] text-[#555] font-medium">
        {label}{required && <span className="text-[#f15a2a]">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]">{icon}</span>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-[#d0d0d0] rounded-[4px] py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] focus:ring-1 focus:ring-[#4169e1]/20 transition-all placeholder:text-[#bbb] ${icon ? "pl-9 pr-3" : "px-3"}`}
        />
      </div>
    </div>
  );
}

// ─── Company Edit Modal ────────────────────────────────────────────────────────
function CompanyEditModal({
  open, onClose, initial, onSave,
}: {
  open: boolean; onClose: () => void;
  initial: CompanyInfo; onSave: (info: CompanyInfo) => void;
}) {
  const [form, setForm] = useState<CompanyInfo>(initial);
  const [saved, setSaved] = useState(false);

  // sync when modal opens
  const handleOpen = () => { setForm(initial); setSaved(false); };

  const set = (key: keyof CompanyInfo) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  const isValid = !!(
    form.회사명 && form.사업자번호 && form.대표자명 &&
    form.계산서이메일 && form.담당자명 && form.담당자연락처 && form.사업장주소
  );

  const handleSave = () => {
    if (!isValid) return;
    onSave(form);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-[560px]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#e0e0e0]">
        <div className="w-9 h-9 rounded-[8px] bg-[#eef1fd] flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-[#4169e1]" />
        </div>
        <div>
          <h2 className="text-[16px] text-[#222] font-bold">회사정보 수정</h2>
          <p className="text-[13px] text-[#999] mt-0.5">정산에 사용될 회사 정보를 수정합니다.</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 flex flex-col gap-4" onMouseEnter={handleOpen}>
        {/* 회사 기본정보 */}
        <div className="flex items-center gap-2 pb-1 border-b border-[#f0f0f0]">
          <span className="text-[12px] text-[#999] font-medium tracking-wide">회사 기본정보</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EditField
            label="회사명" value={form.회사명} onChange={set("회사명")}
            placeholder="예) 주식회사 싱크플로" icon={<Building2 size={14} />} required
          />
          <EditField
            label="사업자번호" value={form.사업자번호} onChange={set("사업자번호")}
            placeholder="예) 000-00-00000" icon={<Hash size={14} />} required
          />
        </div>
        <EditField
          label="대표자명" value={form.대표자명} onChange={set("대표자명")}
          placeholder="예) 홍길동" icon={<User size={14} />} required
        />

        {/* 계산서 정보 */}
        <div className="flex items-center gap-2 pb-1 border-b border-[#f0f0f0] mt-1">
          <span className="text-[12px] text-[#999] font-medium tracking-wide">계산서 및 담당자 정보</span>
        </div>
        <EditField
          label="계산서 이메일" value={form.계산서이메일} onChange={set("계산서이메일")}
          placeholder="예) billing@company.com" icon={<Mail size={14} />} required
        />
        <div className="grid grid-cols-2 gap-3">
          <EditField
            label="담당자명" value={form.담당자명} onChange={set("담당자명")}
            placeholder="예) 홍길동" icon={<User size={14} />} required
          />
          <EditField
            label="담당자 연락처" value={form.담당자연락처} onChange={set("담당자연락처")}
            placeholder="예) 010-0000-0000" icon={<Phone size={14} />} required
          />
        </div>

        {/* 사업장 주소 */}
        <div className="flex items-center gap-2 pb-1 border-b border-[#f0f0f0] mt-1">
          <span className="text-[12px] text-[#999] font-medium tracking-wide">사업장 주소</span>
        </div>
        <EditField
          label="사업장주소" value={form.사업장주소} onChange={set("사업장주소")}
          placeholder="예) 서울 중구 퇴계로 100" icon={<MapPin size={14} />} required
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e0e0e0] shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f5f5f5] transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saved}
          className={`flex items-center gap-2 px-5 py-2 rounded-[4px] text-[14px] font-semibold transition-colors ${
            saved
              ? "bg-[#4caf50] text-white"
              : isValid
              ? "bg-[#4169e1] text-white hover:bg-[#3558c4]"
              : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"
          }`}
        >
          {saved ? <><CheckCircle size={15} /> 저장 완료!</> : <><Pencil size={14} /> 저장</>}
        </button>
      </div>
    </Modal>
  );
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function InvoiceBadge({ type }: { type: "동의하기" | "발급완료" }) {
  if (type === "동의하기") {
    return (
      <span className="inline-block px-2.5 py-1 rounded-[4px] text-[13px] font-medium whitespace-nowrap bg-[#fff3e0] text-[#e65100]">
        동의하기
      </span>
    );
  }
  return (
    <span className="inline-block px-2.5 py-1 rounded-[4px] text-[13px] font-medium whitespace-nowrap bg-[#e8f5e9] text-[#2e7d32]">
      발급완료
    </span>
  );
}

function SettleBadge({ type }: { type: "정산완료" | "정산필요" }) {
  if (type === "정산필요") {
    return (
      <span className="inline-block px-2.5 py-1 rounded-[4px] text-[13px] font-medium whitespace-nowrap bg-[#ffebee] text-[#c62828]">
        정산필요
      </span>
    );
  }
  return (
    <span className="inline-block px-2.5 py-1 rounded-[4px] text-[13px] font-medium whitespace-nowrap bg-[#e8f5e9] text-[#2e7d32]">
      정산완료
    </span>
  );
}

// ─── Table ─────────────────────────────────────────────────────────────────────
const COL = "118px 120px 120px 200px 120px 70px 200px 100px 100px";

function TableHeader() {
  const headers = ["문서 번호", "청구서 발행일", "정산 기한", "청구 내역", "정산금액", "입금자", "거래명세서", "계산서발급", "정산확인"];
  return (
    <div className="grid bg-[#f5f5f5] border-b border-[#e0e0e0]" style={{ gridTemplateColumns: COL }}>
      {headers.map((h) => (
        <div key={h} className="flex items-center px-3 py-2.5 text-[14px] text-[#555] font-medium border-r last:border-r-0 border-[#e0e0e0]">
          {h}
        </div>
      ))}
    </div>
  );
}

function TableRow({ row, onInvoiceClick }: { row: Settlement; onInvoiceClick: (id: string) => void }) {
  return (
    <div
      className="grid border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#fafafa] transition-colors"
      style={{ gridTemplateColumns: COL }}
    >
      <div className="flex items-center px-3 py-2.5 border-r border-[#e0e0e0]">
        <button
          onClick={() => onInvoiceClick(row.id)}
          className="flex items-center gap-1.5 text-[13px] text-[#4169e1] font-medium hover:underline whitespace-nowrap"
        >
          <FileText size={13} className="shrink-0" />
          {row.id}
        </button>
      </div>
      <div className="flex items-center px-3 py-2.5 text-[14px] text-[#666] border-r border-[#e0e0e0] whitespace-nowrap">{row.발행일}</div>
      <div className="flex items-center px-3 py-2.5 text-[14px] text-[#666] border-r border-[#e0e0e0] whitespace-nowrap">{row.정산기한}</div>
      <div className="flex items-center px-3 py-2.5 text-[14px] text-[#666] border-r border-[#e0e0e0] overflow-hidden">
        <p className="truncate">{row.청구내역}</p>
      </div>
      <div className="flex items-center px-3 py-2.5 border-r border-[#e0e0e0]">
        <span className="text-[14px] font-semibold text-[#222]">{row.정산금액}</span>
      </div>
      <div className="flex items-center px-3 py-2.5 text-[14px] text-[#666] border-r border-[#e0e0e0]">{row.입금자}</div>
      <div className="flex items-center px-3 py-2.5 border-r border-[#e0e0e0]">
        <button
          onClick={() => onInvoiceClick(row.id)}
          className="flex items-center gap-1 text-[#4169e1] text-[13px] font-medium hover:underline whitespace-nowrap"
        >
          {row.청구년월} 명세서 조회 <ExternalLink size={11} className="ml-0.5" />
        </button>
      </div>
      <div className="flex items-center px-3 py-2.5 border-r border-[#e0e0e0]">
        <InvoiceBadge type={row.계산서발급} />
      </div>
      <div className="flex items-center px-3 py-2.5">
        <SettleBadge type={row.정산확인} />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function SettlementView() {
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [editOpen, setEditOpen] = useState(false);

  const handleInvoiceClick = (_id: string) => {
    navigate("/app/invoice");
  };

  return (
    <div className="p-6">
      <div className="w-[1300px] flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <PageTitle imgSrc={imgAccounting} title="정산회계 간편조회" />
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] font-medium hover:bg-[#f5f5f5] transition-colors mb-6 ml-4 shrink-0"
          >
            <Pencil size={13} />
            회사정보수정
          </button>
        </div>

        {/* Company info */}
        <div className="bg-white border border-[#e0e0e0] rounded-[6px] overflow-hidden">
          <InfoRow fields={[
            { label: "회사명", value: company.회사명 },
            { label: "사업자번호", value: company.사업자번호 },
            { label: "대표자명", value: company.대표자명 },
          ]} />
          <InfoRow fields={[
            { label: "계산서 이메일", value: company.계산서이메일 },
            { label: "담당자명", value: company.담당자명 },
            { label: "담당자 연락처", value: company.담당자연락처 },
          ]} />
          <InfoRow fields={[
            { label: "사업장주소", value: company.사업장주소, flex: 3 },
          ]} />
        </div>

        {/* Notice */}
        <div className="bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-4 py-3">
          <p className="text-[13px] text-[#777] leading-[1.7]">
            📌 매월 1일 10:00 명세서 발급 → 거래 상세내역 확인 → 이상 없는 경우 <strong>"계산서 발급 동의"</strong> → 계산서 자동발급 → 금액과 입금 내역 일치 시 <strong>"정산 완료"</strong>
          </p>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#e0e0e0] rounded-[6px] overflow-hidden">
          <TableHeader />
          {settlementData.map((row) => (
            <TableRow key={row.id} row={row} onInvoiceClick={handleInvoiceClick} />
          ))}
        </div>

      </div>

      {/* Company Edit Modal */}
      <CompanyEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={company}
        onSave={(info) => setCompany(info)}
      />
    </div>
  );
}
