import { useNavigate } from "react-router";
import { PageTitle } from "../components/ui/PageTitle";
import { FileText, ExternalLink } from "lucide-react";

type Settlement = {
  id: string;
  발행일: string;
  정산기한: string;
  청구하지: string;
  정산금액: string;
  입금자: string;
  입금상태: string;
  정산확인: string;
  정산확인Color: string;
};

const settlementData: Settlement[] = [
  { id: "B256C987", 발행일: "2026. 05. 01", 정산기한: "2026. 05. 31", 청구하지: "2026년 04월 꽃배달 이용금 청구", 정산금액: "350,000원", 입금자: "홍길동", 입금상태: "입금 미완료", 정산확인: "정산 미완", 정산확인Color: "#f44336" },
  { id: "C379D421", 발행일: "2026. 04. 01", 정산기한: "2026. 04. 30", 청구하지: "2026년 03월 꽃배달 이용금 청구", 정산금액: "650,000원", 입금자: "홍길동", 입금상태: "입금조회", 정산확인: "정산 완료", 정산확인Color: "#4caf50" },
  { id: "D4816E54", 발행일: "2026. 03. 01", 정산기한: "2026. 03. 31", 청구하지: "2026년 02월 꽃배달 이용금 청구", 정산금액: "500,000원", 입금자: "홍길동", 입금상태: "입금조회", 정산확인: "정산 완료", 정산확인Color: "#4caf50" },
  { id: "E592F876", 발행일: "2026. 02. 01", 정산기한: "2026. 02. 28", 청구하지: "2026년 01월 꽃배달 이용금 청구", 정산금액: "1,250,000원", 입금자: "홍길동", 입금상태: "입금조회", 정산확인: "정산 완료", 정산확인Color: "#4caf50" },
  { id: "F613G298", 발행일: "2026. 01. 01", 정산기한: "2026. 01. 31", 청구하지: "2025년 12월 꽃배달 이용금 청구", 정산금액: "700,000원", 입금자: "홍길동", 입금상태: "입금조회", 정산확인: "정산 완료", 정산확인Color: "#4caf50" },
];

// ─── Reusable company info row ─────────────────────────────────────────────────
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
          <div className="w-[110px] shrink-0 bg-[#f5f5f5] px-3 py-2.5 text-[13px] text-[#555] font-medium border-r border-[#e0e0e0]">
            {field.label}
          </div>
          <div className="flex-1 px-3 py-2.5 text-[13px] text-[#444]">{field.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Badge helper ──────────────────────────────────────────────────────────────
function StatusBadge({ label, color }: { label: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    "#f44336": { bg: "#ffebee", text: "#c62828" },
    "#ff9800": { bg: "#fff3e0", text: "#e65100" },
    "#4caf50": { bg: "#e8f5e9", text: "#2e7d32" },
  };
  const style = colorMap[color] ?? { bg: "#f5f5f5", text: "#555" };

  return (
    <span
      className="inline-block px-2.5 py-1 rounded-[4px] text-[12px] font-medium whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {label}
    </span>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
const COL = "110px 120px 120px 1fr 110px 70px 120px 100px 100px";

function TableHeader() {
  const headers = ["문서 번호", "청구서 발행일", "정산 기한", "청구 내역", "정산금액", "입금자", "거래명세서", "계산서발급", "정산확인"];
  return (
    <div className="grid bg-[#f5f5f5] border-b border-[#e0e0e0]" style={{ gridTemplateColumns: COL }}>
      {headers.map((h) => (
        <div key={h} className="flex items-center px-3 py-2 text-[13px] text-[#555] font-medium border-r last:border-r-0 border-[#e0e0e0]">
          {h}
        </div>
      ))}
    </div>
  );
}

function TableRow({ row, onInvoiceClick }: { row: Settlement; onInvoiceClick: (id: string) => void }) {
  const isUnpaid = row.입금상태 === "입금 미완료";

  return (
    <div
      className="grid border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#fafafa] transition-colors"
      style={{ gridTemplateColumns: COL }}
    >
      {/* 문서번호 — clickable */}
      <div className="flex items-center px-3 py-2 border-r border-[#e0e0e0]">
        <button
          onClick={() => onInvoiceClick(row.id)}
          className="flex items-center gap-1.5 text-[12px] text-[#4169e1] font-medium hover:underline whitespace-nowrap group"
        >
          <FileText size={13} className="shrink-0" />
          {row.id}
        </button>
      </div>
      <div className="flex items-center px-3 py-2 text-[13px] text-[#666] border-r border-[#e0e0e0] whitespace-nowrap">{row.발행일}</div>
      <div className="flex items-center px-3 py-2 text-[13px] text-[#666] border-r border-[#e0e0e0] whitespace-nowrap">{row.정산기한}</div>
      <div className="flex items-center px-3 py-2 text-[13px] text-[#666] border-r border-[#e0e0e0] overflow-hidden">
        <p className="truncate">{row.청구하지}</p>
      </div>
      <div className="flex items-center px-3 py-2 border-r border-[#e0e0e0]">
        <span className="text-[13px] font-semibold text-[#222]">{row.정산금액}</span>
      </div>
      <div className="flex items-center px-3 py-2 text-[13px] text-[#666] border-r border-[#e0e0e0]">{row.입금자}</div>
      <div className="flex items-center px-3 py-2 border-r border-[#e0e0e0]">
        <button
          onClick={() => onInvoiceClick(row.id)}
          className="flex items-center gap-1 text-[#4169e1] text-[12px] font-medium hover:underline"
        >
          명세서 조회하기 <ExternalLink size={10} />
        </button>
      </div>
      <div className="flex items-center px-3 py-2 border-r border-[#e0e0e0]">
        <StatusBadge label={row.입금상태} color={isUnpaid ? "#ff9800" : "#4caf50"} />
      </div>
      <div className="flex items-center px-3 py-2">
        <StatusBadge label={row.정산확인} color={row.정산확인Color} />
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
        icon="📋"
        title="정산회계 간편조회"
        action={
          <button className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] font-medium hover:bg-[#f5f5f5] transition-colors">
            회사정보수정
          </button>
        }
      />

      {/* Company info — unified design */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] mb-4 overflow-hidden">
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
        <p className="text-[12px] text-[#777] leading-[1.7]">
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
  );
}