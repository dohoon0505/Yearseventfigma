import { useNavigate } from "react-router";
import { PageTitle } from "../components/ui/PageTitle";
import { FileText, ExternalLink } from "lucide-react";
import imgAccounting from "figma:asset/89f44e86951b9673b222bf64d04181d919c190b3.png";

type Settlement = {
  id: string;
  발행일: string;
  정산기한: string;
  청구내역: string;
  청구년월: string;   // "2026년 04월"
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

  const handleInvoiceClick = (_id: string) => {
    navigate("/app/invoice");
  };

  return (
    <div className="p-6">
      <PageTitle
        imgSrc={imgAccounting}
        title="정산회계 간편조회"
        action={
          <button className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] font-medium hover:bg-[#f5f5f5] transition-colors">
            회사정보수정
          </button>
        }
      />

      {/* Company info */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] mb-4 overflow-hidden w-fit">
        <InfoRow fields={[
          { label: "회사명", value: "주식회사 싱크플로" },
          { label: "사업자번호", value: "680-87-02988" },
          { label: "대표자명", value: "홍길동" },
        ]} />
        <InfoRow fields={[
          { label: "계산서 이메일", value: "admin@thinkflow.info" },
          { label: "담당자명", value: "홍길동" },
          { label: "담당자 연락처", value: "010-7615-2699" },
        ]} />
        <InfoRow fields={[
          { label: "사업장주소", value: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사", flex: 3 },
        ]} />
      </div>

      {/* Notice */}
      <div className="bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-4 py-3 mb-4">
        <p className="text-[13px] text-[#777] leading-[1.7]">
          📌 매월 1일 10:00 명세서 발급 → 거래 상세내역 확인 → 이상 없는 경우 <strong>"계산서 발급 동의"</strong> → 계산서 자동발급 → 금액과 입금 내역 일치 시 <strong>"정산 완료"</strong>
        </p>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] overflow-hidden w-fit">
        <TableHeader />
        {settlementData.map((row) => (
          <TableRow key={row.id} row={row} onInvoiceClick={handleInvoiceClick} />
        ))}
      </div>
    </div>
  );
}
