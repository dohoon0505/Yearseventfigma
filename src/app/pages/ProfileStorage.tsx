import React, { useState } from "react";
import { DataTable, Column } from "../components/ui/DataTable";
import { Modal } from "../components/ui/Modal";
import { PageTitle } from "../components/ui/PageTitle";
import {
  Pencil, Trash2, UserPlus, Phone, Tag, FileText,
  MessageSquare, UserCheck, Building2, Info,
} from "lucide-react";
import { useAppStore, Profile, Contact } from "../store/AppContext";
import imgProfile from "figma:asset/fab737052638e076fb0189281951c841b72f5549.png";

// ─── 공용 폼 Field ─────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, required, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1 text-[13px] text-[#555] font-medium">
        {label}
        {required && <span className="text-[#f15a2a]">*</span>}
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

function FormDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[12px] text-[#999] font-medium tracking-wide whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-[#eeeeee]" />
    </div>
  );
}

// ─── 신규 프로필 등록 모달 ─────────────────────────────────────────────────────
function NewProfileModal({
  open, onClose, onAdd, nextNo,
}: {
  open: boolean; onClose: () => void;
  onAdd: (p: Profile) => void; nextNo: string;
}) {
  const emptyForm = (): Profile => ({ no: nextNo, name: "", role: "", phone: "", greeting: "" });
  const [form, setForm] = useState<Profile>(emptyForm);

  React.useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open, nextNo]);

  const set = (key: keyof Profile) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const autoGreeting = form.name || form.role
    ? `올해의경조사 ${form.role} ${form.name}`.trim()
    : "";

  const handleAdd = () => {
    if (!form.name || !form.role || !form.phone) return;
    onAdd({ ...form, greeting: form.greeting.trim() || autoGreeting });
    onClose();
  };

  const isValid = !!(form.name && form.role && form.phone);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-[520px]">
      <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#e0e0e0]">
        <div className="w-9 h-9 rounded-[8px] bg-[#eef1fd] flex items-center justify-center shrink-0">
          <UserPlus size={18} className="text-[#4169e1]" />
        </div>
        <div>
          <h2 className="text-[16px] text-[#222] font-bold">신규 프로필 등록</h2>
          <p className="text-[13px] text-[#999] mt-0.5">화환 리본에 표시될 발신인 정보를 등록합니다.</p>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        <FormDivider label="발신인 정보" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="성함" value={form.name} onChange={set("name")} placeholder="예) 홍길동" required icon={<UserCheck size={14} />} />
          <Field label="직위" value={form.role} onChange={set("role")} placeholder="예) 대표이사" required icon={<Tag size={14} />} />
        </div>
        <FormDivider label="연락처" />
        <Field label="배송완료 수신번호" value={form.phone} onChange={set("phone")} placeholder="예) 010-0000-0000" required icon={<Phone size={14} />} />
        <FormDivider label="리본 고정문구" />
        <Field
          label="고정문구" value={form.greeting} onChange={set("greeting")}
          placeholder={autoGreeting || "비워두면 직위+성함 형식으로 자동 생성됩니다."}
          icon={<FileText size={14} />}
        />
        {(form.greeting || autoGreeting) && (
          <div className="rounded-[6px] bg-[#f8f9ff] border border-[#dce2fb] px-4 py-3 flex flex-col gap-1">
            <span className="text-[12px] text-[#4169e1] font-medium">리본 문구 미리보기</span>
            <p className="text-[14px] text-[#333] font-medium">{form.greeting.trim() || autoGreeting}</p>
          </div>
        )}
        <div className="flex items-start gap-2 bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-3 py-2.5">
          <Info size={13} className="text-[#e6a817] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#888] leading-[1.6]">
            고정문구를 비워두면 <strong className="text-[#666]">직위 + 성함</strong> 형식으로 자동 생성됩니다.<br />
            리본 문구는 주문 시 수정이 가능합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-[#e0e0e0] bg-[#fafafa] rounded-b-[8px]">
        <span className="text-[13px] text-[#bbb]"><span className="text-[#f15a2a]">*</span> 필수 입력 항목</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f0f0f0] transition-colors">취소</button>
          <button onClick={handleAdd} disabled={!isValid} className={`px-5 py-2 rounded-[4px] text-[14px] font-semibold transition-colors ${isValid ? "bg-[#4169e1] text-white hover:bg-[#3558c4]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}>등록</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── 신규 담당자 등록 모달 ─────────────────────────────────────────────────────
const MSG_RECEIVE = "모든 배송완료 마다에 메세지를 수신합니다";
const MSG_NONE    = "메세지를 수신하지 않습니다.";

function NewContactModal({
  open, onClose, onAdd, nextNo,
}: {
  open: boolean; onClose: () => void;
  onAdd: (c: Contact) => void; nextNo: string;
}) {
  const emptyForm = (): Contact => ({ no: nextNo, name: "", role: "", phone: "", message: MSG_RECEIVE });
  const [form, setForm] = useState<Contact>(emptyForm);

  React.useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open, nextNo]);

  const set = (key: keyof Contact) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleAdd = () => {
    if (!form.name || !form.role || !form.phone) return;
    onAdd(form);
    onClose();
  };

  const isValid = !!(form.name && form.role && form.phone);
  const isReceiving = form.message === MSG_RECEIVE;

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-[520px]">
      <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b border-[#e0e0e0]">
        <div className="w-9 h-9 rounded-[8px] bg-[#eef1fd] flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-[#4169e1]" />
        </div>
        <div>
          <h2 className="text-[16px] text-[#222] font-bold">신규 담당자 등록</h2>
          <p className="text-[13px] text-[#999] mt-0.5">배송 완료 알림을 수신할 담당자를 등록합니다.</p>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        <FormDivider label="담당자 정보" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="성함" value={form.name} onChange={set("name")} placeholder="예) 김담당" required icon={<UserCheck size={14} />} />
          <Field label="부서·직위" value={form.role} onChange={set("role")} placeholder="예) 재경부" required icon={<Building2 size={14} />} />
        </div>
        <FormDivider label="연락처" />
        <Field label="배송완료 수신번호" value={form.phone} onChange={set("phone")} placeholder="예) 010-0000-0000" required icon={<Phone size={14} />} />

        <FormDivider label="메세지 수신 설정" />
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-[13px] text-[#555] font-medium">메세지 수신여부 <span className="text-[#f15a2a]">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {[{ val: MSG_RECEIVE, title: "수신함", desc: "배송 완료 시 문자 알림" },
              { val: MSG_NONE,    title: "수신 안 함", desc: "알림 미수신" }
            ].map((opt) => (
              <label key={opt.val} className={`flex items-start gap-2.5 border rounded-[6px] px-3 py-2.5 cursor-pointer transition-all ${form.message === opt.val ? "border-[#4169e1] bg-[#f0f3fd]" : "border-[#d0d0d0] bg-white hover:border-[#a0a8d9]"}`}>
                <input type="radio" name="msg" value={opt.val} checked={form.message === opt.val} onChange={() => set("message")(opt.val)} className="accent-[#4169e1] mt-0.5 shrink-0" />
                <div>
                  <p className={`text-[14px] font-medium ${form.message === opt.val ? "text-[#4169e1]" : "text-[#333]"}`}>{opt.title}</p>
                  <p className="text-[12px] text-[#999] leading-[1.5] mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-[4px] px-3 py-2.5 border ${isReceiving ? "bg-[#e8f5e9] border-[#a5d6a7]" : "bg-[#f5f5f5] border-[#e0e0e0]"}`}>
          <MessageSquare size={13} className={isReceiving ? "text-[#2e7d32]" : "text-[#999]"} />
          <span className={`text-[13px] font-medium ${isReceiving ? "text-[#2e7d32]" : "text-[#999]"}`}>
            {form.name || "담당자"}님은 현재&nbsp;
            <strong>{isReceiving ? "배송 완료 알림을 수신" : "알림을 수신하지 않음"}</strong>으로 설정됩니다.
          </span>
        </div>

        <div className="flex items-start gap-2 bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-3 py-2.5">
          <Info size={13} className="text-[#e6a817] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#888] leading-[1.6]">배송 완료 알림은 등록된 수신번호로 문자 메세지가 발송됩니다.<br />수신 설정은 언제든지 수정 가능합니다.</p>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-[#e0e0e0] bg-[#fafafa] rounded-b-[8px]">
        <span className="text-[13px] text-[#bbb]"><span className="text-[#f15a2a]">*</span> 필수 입력 항목</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f0f0f0] transition-colors">취소</button>
          <button onClick={handleAdd} disabled={!isValid} className={`px-5 py-2 rounded-[4px] text-[14px] font-semibold transition-colors ${isValid ? "bg-[#4169e1] text-white hover:bg-[#3558c4]" : "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"}`}>등록</button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({ open, name, onClose, onConfirm }: { open: boolean; name: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="삭제 확인">
      <div className="p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-[15px] text-[#333]"><strong className="text-[#222]">{name}</strong> 항목을 삭제하시겠습니까?</p>
          <p className="text-[14px] text-[#999]">삭제한 내용은 복구할 수 없습니다.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-[#f44336] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#d32f2f] transition-colors">삭제</button>
        </div>
      </div>
    </Modal>
  );
}

function SectionTitle({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <span className="w-[3px] h-[18px] bg-[#4169e1] rounded-full inline-block" />
        <span className="text-[16px] text-[#222] font-bold">{icon} {title}</span>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Profile Section ───────────────────────────────────────────────────────────
function ProfileSection() {
  const { profiles, setProfiles } = useAppStore();
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<Profile>({ no: "", name: "", role: "", phone: "", greeting: "" });
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [showNew, setShowNew] = useState(false);

  const nextNo = String(profiles.length + 1).padStart(2, "0");

  const openEdit = (row: Profile) => { setEditTarget(row); setEditForm({ ...row }); };

  const handleSave = () => {
    setProfiles((prev) => prev.map((p) => (p.no === editForm.no ? editForm : p)));
    setEditTarget(null);
  };

  const handleDelete = () => {
    setProfiles((prev) => prev.filter((p) => p.no !== deleteTarget?.no));
    setDeleteTarget(null);
  };

  const columns: Column<Profile>[] = [
    { label: "순번", width: "54px", align: "center", render: (r) => r.no },
    { label: "성함", width: "80px", align: "center", render: (r) => r.name },
    { label: "직위", width: "100px", align: "center", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "160px", align: "center", render: (r) => r.phone },
    { label: "고정문구", width: "1fr", render: (r) => r.greeting },
    { label: "수정", width: "max-content", align: "center", render: (r) => <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-[#e8edff] transition-colors"><Pencil size={14} className="text-[#4169e1]" /></button> },
    { label: "삭제", width: "max-content", align: "center", render: (r) => <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-[#ffeded] transition-colors"><Trash2 size={14} className="text-[#f44336]" /></button> },
  ];

  return (
    <div className="w-[1300px]">
      <SectionTitle icon="📋" title="프로필 저장공간" action={
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#3558c4] transition-colors">
          <UserPlus size={14} /> 신규 프로필 등록
        </button>
      } />
      <DataTable columns={columns} data={profiles} rowKey={(r) => r.no} compact />

      <NewProfileModal open={showNew} onClose={() => setShowNew(false)} onAdd={(p) => setProfiles((prev) => [...prev, p])} nextNo={nextNo} />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="프로필 수정" maxWidth="max-w-lg">
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="성함" value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
            <Field label="직위" value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} />
          </div>
          <Field label="배송완료 수신번호" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
          <Field label="고정문구" value={editForm.greeting} onChange={(v) => setEditForm((f) => ({ ...f, greeting: v }))} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
            <button onClick={handleSave} className="px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#3558c4] transition-colors">저장</button>
          </div>
        </div>
      </Modal>

      <DeleteModal open={!!deleteTarget} name={deleteTarget?.name ?? ""} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}

// ─── Contact Section ───────────────────────────────────────────────────────────
function ContactSection() {
  const { contacts, setContacts } = useAppStore();
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<Contact>({ no: "", name: "", role: "", phone: "", message: "" });
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [showNew, setShowNew] = useState(false);

  const nextNo = String(contacts.length + 1).padStart(2, "0");

  const openEdit = (row: Contact) => { setEditTarget(row); setEditForm({ ...row }); };

  const handleSave = () => {
    setContacts((prev) => prev.map((c) => (c.no === editForm.no ? editForm : c)));
    setEditTarget(null);
  };

  const handleDelete = () => {
    setContacts((prev) => prev.filter((c) => c.no !== deleteTarget?.no));
    setDeleteTarget(null);
  };

  const columns: Column<Contact>[] = [
    { label: "순번", width: "54px", align: "center", render: (r) => r.no },
    { label: "성함", width: "80px", align: "center", render: (r) => r.name },
    { label: "부서·직위", width: "110px", align: "center", render: (r) => r.role },
    { label: "배송완료 수신번호", width: "160px", align: "center", render: (r) => r.phone },
    { label: "메세지 수신여부", width: "1fr", render: (r) => r.message },
    { label: "수정", width: "max-content", align: "center", render: (r) => <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-[#e8edff] transition-colors"><Pencil size={14} className="text-[#4169e1]" /></button> },
    { label: "삭제", width: "max-content", align: "center", render: (r) => <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-[#ffeded] transition-colors"><Trash2 size={14} className="text-[#f44336]" /></button> },
  ];

  return (
    <div className="w-[1300px]">
      <SectionTitle icon="📋" title="담당자 저장공간" action={
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#3558c4] transition-colors">
          <UserPlus size={14} /> 신규 담당자 등록
        </button>
      } />
      <DataTable columns={columns} data={contacts} rowKey={(r) => r.no} compact />

      <NewContactModal open={showNew} onClose={() => setShowNew(false)} onAdd={(c) => setContacts((prev) => [...prev, c])} nextNo={nextNo} />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="담당자 수정" maxWidth="max-w-lg">
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="성함" value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
            <Field label="부서·직위" value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} />
          </div>
          <Field label="배송완료 수신번호" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
          <div className="flex flex-col gap-1">
            <label className="text-[14px] text-[#555] font-medium">메세지 수신여부</label>
            <select value={editForm.message} onChange={(e) => setEditForm((f) => ({ ...f, message: e.target.value }))} className="border border-[#d0d0d0] rounded-[4px] px-3 py-2.5 text-[14px] text-[#333] outline-none focus:border-[#4169e1] bg-white">
              <option value={MSG_RECEIVE}>수신함</option>
              <option value={MSG_NONE}>수신 안 함</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 border border-[#d0d0d0] rounded-[4px] text-[14px] text-[#555] hover:bg-[#f5f5f5] transition-colors">취소</button>
            <button onClick={handleSave} className="px-4 py-2 bg-[#4169e1] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#3558c4] transition-colors">저장</button>
          </div>
        </div>
      </Modal>

      <DeleteModal open={!!deleteTarget} name={deleteTarget?.name ?? ""} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function ProfileStorage() {
  return (
    <div className="p-6 flex flex-col gap-8">
      <PageTitle imgSrc={imgProfile} title="프로필 저장공간" />
      <ProfileSection />
      <ContactSection />
    </div>
  );
}
