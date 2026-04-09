import { useState } from "react";
import { DataTable, Column } from "../components/ui/DataTable";
import { Modal } from "../components/ui/Modal";
import { PageTitle } from "../components/ui/PageTitle";
import { Pencil, Trash2 } from "lucide-react";

type SettingRow = { no: string; name: string; role: string; phone: string; greeting: string };

const initialData: SettingRow[] = [
  { no: "01", name: "홍길동", role: "대표이사", phone: "010-0000-0000", greeting: "(주)올해의경조사 대표이사 홍길동" },
  { no: "02", name: "정소빈", role: "대표변호사", phone: "010-0000-0000", greeting: "올해표현(유) 대표변호사 정소빈" },
  { no: "03", name: "임직원", role: "일동", phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "04", name: "임직원", role: "일동", phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "05", name: "임직원", role: "일동", phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
];

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[13px] text-[#555] font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] transition-colors"
      />
    </div>
  );
}

export function MessageSettings() {
  const [data, setData] = useState(initialData);
  const [editTarget, setEditTarget] = useState<SettingRow | null>(null);
  const [editForm, setEditForm] = useState<SettingRow>({ no: "", name: "", role: "", phone: "", greeting: "" });
  const [deleteTarget, setDeleteTarget] = useState<SettingRow | null>(null);

  const openEdit = (row: SettingRow) => { setEditTarget(row); setEditForm({ ...row }); };
  const openDelete = (row: SettingRow) => setDeleteTarget(row);

  const handleSave = () => {
    setData((prev) => prev.map((r) => (r.no === editForm.no ? editForm : r)));
    setEditTarget(null);
  };

  const handleDelete = () => {
    setData((prev) => prev.filter((r) => r.no !== deleteTarget?.no));
    setDeleteTarget(null);
  };

  const columns: Column<SettingRow>[] = [
    { label: "순번", width: "50px", align: "center", render: (r) => r.no },
    { label: "성함", width: "80px", align: "center", render: (r) => r.name },
    { label: "직위", width: "90px", align: "center", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "150px", align: "center", render: (r) => r.phone },
    { label: "고정문구", render: (r) => r.greeting },
    {
      label: "수정", width: "60px", align: "center",
      render: (r) => (
        <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-[#e8edff] transition-colors">
          <Pencil size={14} className="text-[#4169e1]" />
        </button>
      ),
    },
    {
      label: "삭제", width: "60px", align: "center",
      render: (r) => (
        <button onClick={() => openDelete(r)} className="p-1.5 rounded hover:bg-[#ffeded] transition-colors">
          <Trash2 size={14} className="text-[#f44336]" />
        </button>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageTitle icon="💛" title="메세지 수신설정" />
      <DataTable columns={columns} data={data} rowKey={(r) => r.no} compact />

      {/* Edit Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="수신설정 수정" maxWidth="max-w-lg">
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="성함" value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
            <Field label="직위" value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} />
          </div>
          <Field label="배송완료 수신번호" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
          <Field label="고정문구" value={editForm.greeting} onChange={(v) => setEditForm((f) => ({ ...f, greeting: v }))} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">
              취소
            </button>
            <button onClick={handleSave} className="px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[13px] font-medium hover:bg-[#3558c4] transition-colors">
              저장
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="삭제 확인">
        <div className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-[#333]">
              <strong className="text-[#222]">{deleteTarget?.name}</strong> 항목을 삭제하시겠습니까?
            </p>
            <p className="text-[13px] text-[#999]">삭제한 내용은 복구할 수 없습니다.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[13px] text-[#555] hover:bg-[#f5f5f5] transition-colors">
              취소
            </button>
            <button onClick={handleDelete} className="px-4 py-2 bg-[#f44336] text-white rounded-[4px] text-[13px] font-medium hover:bg-[#d32f2f] transition-colors">
              삭제
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}