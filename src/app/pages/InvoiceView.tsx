import { useRef, useState } from "react";
import React from "react";
import {
  Download,
  CalendarDays,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Modal } from "../components/ui/Modal";
import imgTruck from "figma:asset/6e4159186fdfb96cd4ca41d51d8d0440398b5825.png";

// ─── Data ─────────────────────────────────────────────────────────────────────
type InvoiceItem = {
  date: string;
  sender: string;
  address: string;
  product: string;
  amount: string;
};

const invoiceItems: InvoiceItem[] = [
  {
    date: "2025년 08월 30일",
    sender: "홍길동",
    address:
      "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관",
    product: "근조화환(기본형)",
    amount: "70,000원",
  },
  {
    date: "2025년 08월 28일",
    sender: "김태권",
    address:
      "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀",
    product: "근조화환(기본형)",
    amount: "100,000원",
  },
  {
    date: "2025년 08월 23일",
    sender: "김태권",
    address:
      "경기 마주시 금품억로 190 새디인병원 장례식장 지하1층 특2호실",
    product: "근조화환(기본형)",
    amount: "50,000원",
  },
  {
    date: "2025년 08월 19일",
    sender: "채상운",
    address:
      "부산 남구 황령대로 401-9 그랜드드몬트 6층 시그니처룸",
    product: "근조화환(기본형)",
    amount: "50,000원",
  },
  {
    date: "2025년 08월 12일",
    sender: "박진찬",
    address:
      "경상북도 예천군 예천읍 양오로 154 (정북아) 예천농협장례식장 3호실",
    product: "근조화환(기본형)",
    amount: "50,000원",
  },
  {
    date: "2025년 08월 05일",
    sender: "박진찬",
    address: "서울 강남구 논현로 645 렉시미나호텔",
    product: "근조화환(기본형)",
    amount: "50,000원",
  },
  {
    date: "2025년 08월 30일",
    sender: "홍길동",
    address:
      "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관",
    product: "근조화환(기본형)",
    amount: "70,000원",
  },
  {
    date: "2025년 08월 28일",
    sender: "김태권",
    address:
      "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀",
    product: "근조화환(기본형)",
    amount: "50,000원",
  },
];

// ─── Shared inline styles ─────────────────────────────────────────────────────
const S = {
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    tableLayout: "fixed" as const,
    border: "1px solid #d4d4d4",
    fontSize: "12px",
    fontFamily: "Pretendard, sans-serif",
  },
  th: {
    background: "#f5f5f5",
    padding: "11px 14px",
    fontWeight: 600,
    color: "#444",
    border: "1px solid #d4d4d4",
    textAlign: "left" as const,
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
  },
  tdLabel: {
    background: "#f5f5f5",
    padding: "11px 14px",
    fontWeight: 600,
    color: "#444",
    border: "1px solid #d4d4d4",
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    width: "88px",
  },
  tdValue: {
    padding: "11px 14px",
    color: "#333",
    border: "1px solid #d4d4d4",
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  },
  // 공급받는자/공급자 인포 테이블 전용 — 긴 값 줄바꿈 허용, 전체 노출
  tdInfoLabel: {
    background: "#f5f5f5",
    padding: "9px 10px",
    fontWeight: 600,
    color: "#444",
    border: "1px solid #d4d4d4",
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
  },
  tdInfoValue: {
    padding: "9px 10px",
    color: "#333",
    border: "1px solid #d4d4d4",
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    wordBreak: "break-all" as const,
  },
  tdAddress: {
    padding: "11px 14px",
    color: "#333",
    border: "1px solid #d4d4d4",
    verticalAlign: "middle" as const,
    lineHeight: "1.4",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  },
};

// ─── Info Table (6-col: label|value label|value label|value) ──────────────────
interface InfoRow {
  label: string;
  value: string;
  valueColSpan?: number;
}

function InfoTableV2({
  title,
  rows,
}: {
  title: string;
  rows: InfoRow[][];
}) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <p
        style={{
          margin: "0 0 7px",
          fontSize: "12px",
          fontWeight: 700,
          color: "#222",
          paddingBottom: "5px",
          borderBottom: "2px solid #333",
        }}
      >
        {title}
      </p>
      <table style={S.table}>
        <colgroup>
          <col style={{ width: "100px" }} />
          <col />
          <col style={{ width: "100px" }} />
          <col />
          <col style={{ width: "100px" }} />
          <col />
        </colgroup>
        <tbody>
          {rows.map((cells, ri) => {
            if (cells.length === 1) {
              return (
                <tr key={ri}>
                  <td style={S.tdInfoLabel}>
                    {cells[0].label}
                  </td>
                  <td style={S.tdInfoValue} colSpan={5}>
                    {cells[0].value}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={ri}>
                {cells.map((cell, ci) => [
                  <td key={`l${ci}`} style={S.tdInfoLabel}>
                    {cell.label}
                  </td>,
                  <td
                    key={`v${ci}`}
                    style={S.tdInfoValue}
                    colSpan={cell.valueColSpan ?? 1}
                  >
                    {cell.value}
                  </td>,
                ])}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── A4 Invoice Document — 794 × 1123 px ──────────────────────────────────────
function InvoiceDocument({
  invoiceRef,
}: {
  invoiceRef: React.RefObject<HTMLDivElement | null>;
}) {
  const docStyle: React.CSSProperties = {
    width: "794px",
    height: "1123px",
    background: "#ffffff",
    fontFamily: "Pretendard, sans-serif",
    fontSize: "12px",
    color: "#333",
    padding: "36px 44px 28px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    flexShrink: 0,
  };

  return (
    <div ref={invoiceRef} style={docStyle}>
      {/* ── Title ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <img
            src={imgTruck}
            alt=""
            style={{
              width: 28,
              height: 28,
              objectFit: "cover",
            }}
          />
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#222",
            }}
          >
            26년 04월 꽃배달 거래명세서
          </span>
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#666",
          }}
        >
          2026년 04월 귀속
        </span>
      </div>

      {/* ── 공급받는자 ── */}
      <InfoTableV2
        title="공급받는자"
        rows={[
          [
            {
              label: "사업장주소",
              value:
                "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사",
            },
          ],
          [
            { label: "회사명", value: "주식회사 싱크플로" },
            { label: "사업자번호", value: "680-87-02988" },
            { label: "대표자명", value: "홍길동" },
          ],
          [
            { label: "명세요약", value: "꽃배달 이용료 청구" },
            {
              label: "명세서 발행일",
              value: "2026년 05월 01일",
            },
            {
              label: "계산서 발행",
              value: "명세서 조회 후 발급",
            },
          ],
        ]}
      />

      {/* ── 공급자 ── */}
      <InfoTableV2
        title="공급자"
        rows={[
          [
            { label: "회사명", value: "도랑플라워" },
            { label: "사업자번호", value: "321-99-01778" },
            { label: "대표자명", value: "김도훈" },
          ],
          [
            {
              label: "E-MAIL",
              value: "ehgns335@naver.com",
              valueColSpan: 3,
            },
            { label: "FAX", value: "053-715-2699" },
          ],
        ]}
      />

      {/* ── 꽃배달 거래내역 ── */}
      <div
        style={{ flex: 1, minHeight: 0, marginBottom: "22px" }}
      >
        <p
          style={{
            margin: "0 0 7px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#222",
            paddingBottom: "5px",
            borderBottom: "2px solid #333",
          }}
        >
          꽃배달 거래내역
        </p>
        <table style={S.table}>
          <colgroup>
            {/* 배송요청일시: "2025년 08월 30일" 기준 */}
            <col style={{ width: "148px" }} />
            {/* 발송인: 3자 기준 */}
            <col style={{ width: "70px" }} />
            {/* 배송지 정보 — 남은 공간, ellipsis만 허용 */}
            <col />
            {/* 주문상품: "근조화환(기본형)" 기준 */}
            <col style={{ width: "128px" }} />
            {/* 결제금액: "100,000원" 기준 */}
            <col style={{ width: "92px" }} />
          </colgroup>
          <thead>
            <tr>
              {(
                [
                  { label: "배송요청일시" },
                  { label: "발송인", center: true },
                  { label: "배송지 정보" },
                  { label: "주문상품" },
                  { label: "결제금액", center: true },
                ] as { label: string; center?: boolean }[]
              ).map(({ label, center }) => (
                <th
                  key={label}
                  style={{
                    ...S.th,
                    ...(center && { textAlign: "center" }),
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoiceItems.map((item, idx) => (
              <tr key={idx}>
                <td style={S.tdValue}>{item.date}</td>
                <td
                  style={{ ...S.tdValue, textAlign: "center" }}
                >
                  {item.sender}
                </td>
                <td style={S.tdAddress}>{item.address}</td>
                <td style={S.tdValue}>{item.product}</td>
                <td
                  style={{ ...S.tdValue, textAlign: "center" }}
                >
                  {item.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <table
        style={{ ...S.table, marginTop: "auto", flexShrink: 0 }}
      >
        <colgroup>
          <col />
          <col style={{ width: "185px" }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={{ ...S.tdValue, whiteSpace: "nowrap" }}>
              <span
                style={{
                  fontWeight: 700,
                  color: "#444",
                  marginRight: "12px",
                }}
              >
                입금계좌 안내
              </span>
              <span>
                NH농협은행 352-2284-9916-83 예금주
                김도훈(도랑플라워)
              </span>
            </td>
            <td
              style={{
                ...S.tdValue,
                background: "#f8f8f8",
                textAlign: "right",
              }}
            >
              <span style={{ fontWeight: 600, color: "#444" }}>
                정산금액{" "}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "#f15a2a",
                  fontSize: "14px",
                }}
              >
                215,000원
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── PDF Download (browser print → "PDF로 저장") ────────────────────────────
function downloadPDF(el: HTMLDivElement, period: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("팝업이 차단되었습니다. 팝업을 허용해 주세요.");
    return;
  }

  // Resolve asset src to absolute URL (handles Vite hashed imports)
  const resolveAbsoluteUrls = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("img").forEach((img) => {
      img.src = img.src; // browser resolves relative → absolute
    });
    return div.innerHTML;
  };

  const invoiceHTML = resolveAbsoluteUrls(el.outerHTML);

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>거래명세서_${period}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0; padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      display: flex;
      justify-content: center;
      background: #fff;
    }
  </style>
</head>
<body>${invoiceHTML}</body>
</html>`);
  printWindow.document.close();

  // Wait for fonts + images to load, then trigger print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };
}

// ─── Period Modal ─────────────────────────────────────────────────────────────
const years = ["2024", "2025", "2026"];
const months = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

function PeriodModal({
  open,
  current,
  onClose,
  onConfirm,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onConfirm: (p: string) => void;
}) {
  const [year, setYear] = useState(
    current.split("년")[0].trim(),
  );
  const [month, setMonth] = useState(
    current
      .split("년 ")[1]
      ?.replace("월", "")
      .trim()
      .padStart(2, "0") ?? "04",
  );
  const handleConfirm = () => {
    onConfirm(`${year}년 ${month}월`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="조회 기간 변경">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[13px] text-[#555] font-medium">
              연도
            </label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[13px] text-[#555] font-medium">
              월
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] bg-white"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#f0f3ff] border border-[#c5ceff] rounded-[4px] px-3 py-2.5">
          <CalendarDays
            size={14}
            className="text-[#4169e1] shrink-0"
          />
          <span className="text-[13px] text-[#4169e1]">
            선택 기간: {year}년 {month}월
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[13px] font-medium hover:bg-[#3558c4] transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Agreement Modal ──────────────────────────────────────────────────────────
function AgreementModal({
  open,
  onClose,
  onAgree,
}: {
  open: boolean;
  onClose: () => void;
  onAgree: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="계산서 발급 동의"
    >
      <div className="p-6 flex flex-col gap-5">
        <div className="bg-[#f9f9fb] border border-[#e0e0e0] rounded-[6px] p-4 flex flex-col gap-3">
          {[
            {
              label: "정산 기간",
              value: "2026년 04월",
              color: "#222",
            },
            {
              label: "총 정산금액",
              value: "215,000원",
              color: "#f15a2a",
            },
            {
              label: "결제 기한",
              value: "2026년 05월 31일",
              color: "#222",
            },
          ].map((r) => (
            <div
              key={r.label}
              className="flex justify-between text-[13px]"
            >
              <span className="text-[#666]">{r.label}</span>
              <span
                style={{ color: r.color }}
                className="font-semibold"
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-4 py-3">
          <p className="text-[13px] text-[#555] leading-[1.7]">
            위 내역을 확인하였으며, 해당 내용으로{" "}
            <strong>세금계산서 발급에 동의</strong>합니다.
            <br />
            동의 후에는 계산서가 자동으로 발급되며, 내용 변경이
            불가합니다.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors"
          >
            취소
          </button>
          <button
            onClick={onAgree}
            className="px-5 py-2 bg-[#4caf50] text-white rounded-[4px] text-[13px] font-semibold hover:bg-[#388e3c] transition-colors flex items-center gap-2"
          >
            <CheckCircle size={15} />
            동의합니다
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function InvoiceView() {
  const [selectedPeriod, setSelectedPeriod] =
    useState("2026년 04월");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [agreementModalOpen, setAgreementModalOpen] =
    useState(false);
  const [agreed, setAgreed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      downloadPDF(invoiceRef.current, selectedPeriod);
    } catch (err) {
      console.error("PDF 생성 오류:", err);
      alert(
        "PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    // Outer wrapper: fills the page area, allows horizontal scroll if A4 is wider
    <div className="flex gap-5 p-5 bg-[#f0f2f5] min-h-full overflow-x-auto items-start">
      {/* ── A4 document shadow card ── */}
      <div
        style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          borderRadius: "4px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <InvoiceDocument invoiceRef={invoiceRef} />
      </div>

      {/* ── Right control panel — sticky so it stays in view while scrolling ── */}
      <div
        className="flex flex-col gap-4"
        style={{
          width: "300px",
          flexShrink: 0,
          position: "sticky",
          top: "16px",
          alignSelf: "flex-start",
        }}
      >
        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-2 bg-[#4169e1] text-white rounded-[6px] px-5 py-4 hover:bg-[#3558c4] transition-colors disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Download size={18} />
          )}
          <span className="text-[13px] font-semibold text-center leading-[1.5]">
            {downloading
              ? "PDF 생성 중..."
              : `${selectedPeriod} 거래명세서\nPDF 다운로드`}
          </span>
        </button>

        {/* Info panel */}
        <div className="bg-white rounded-[6px] border border-[#e0e0e0] p-5 flex flex-col gap-4">
          <h3 className="text-[14px] text-[#222] font-semibold">
            💰 거래명세서 조회
          </h3>

          {/* Period row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 border border-[#4169e1] bg-[#f0f3ff] rounded-[4px] px-3 py-2">
              <CalendarDays
                size={13}
                className="text-[#4169e1] shrink-0"
              />
              <span className="text-[13px] text-[#4169e1] font-semibold">
                {selectedPeriod}
              </span>
            </div>
            <button
              onClick={() => setPeriodModalOpen(true)}
              className="px-3 py-2 bg-[#555] text-white rounded-[4px] text-[12px] font-medium hover:bg-[#333] transition-colors whitespace-nowrap"
            >
              기간 변경
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-2.5 border-t border-[#f0f0f0] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#666]">
                {selectedPeriod} 결제금액
              </span>
              <span className="text-[14px] text-[#222] font-semibold">
                215,000원
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#666]">
                결제&정산 대금기한
              </span>
              <span className="text-[12px] text-[#f15a2a] font-bold">
                2026년 05월 31일
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#666]">
                계산서 발급 동의
              </span>
              {agreed ? (
                <span className="text-[12px] text-[#4caf50] font-medium flex items-center gap-1">
                  <CheckCircle size={12} />
                  동의완료
                </span>
              ) : (
                <span className="text-[12px] text-[#f15a2a] font-medium">
                  동의 필요
                </span>
              )}
            </div>
          </div>

          {/* Agreement button */}
          <button
            onClick={() =>
              !agreed && setAgreementModalOpen(true)
            }
            className={`border rounded-[4px] px-3 py-3 text-[12px] transition-colors ${
              agreed
                ? "border-[#4caf50] bg-[#f0fff4] cursor-default"
                : "border-[#d0d0d0] bg-[#f9f9f9] hover:bg-[#f0f3ff] hover:border-[#4169e1] cursor-pointer"
            }`}
          >
            {agreed ? (
              <span className="text-[#4caf50] font-medium flex items-center justify-center gap-1">
                <CheckCircle size={13} />
                계산서 발급 동의 완료
              </span>
            ) : (
              <span className="text-[#555] block text-center">
                해당 내용으로 계산서 발급에 동의합니다
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Modals */}
      <PeriodModal
        open={periodModalOpen}
        current={selectedPeriod}
        onClose={() => setPeriodModalOpen(false)}
        onConfirm={setSelectedPeriod}
      />
      <AgreementModal
        open={agreementModalOpen}
        onClose={() => setAgreementModalOpen(false)}
        onAgree={() => {
          setAgreed(true);
          setAgreementModalOpen(false);
        }}
      />
    </div>
  );
}