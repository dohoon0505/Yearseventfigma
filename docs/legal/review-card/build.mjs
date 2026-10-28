// 검토 카드 만들기: ../drafts-v0.2.json(초안) + questions.mjs(정할 것 59개) + template.html → 카드 HTML 한 장
// 쓰는 법: node docs/legal/review-card/build.mjs <나갈 파일.html>   (나갈 파일은 레포 밖에 둔다 — 레포 루트가 그대로 배포된다)
// 만든 파일은 아티팩트 '약관·처리방침 초안 검토' 에 같은 주소로 다시 올린다(답은 아티팩트 db 'answers' 에 있다 — 문서 id 는 질문 id·조 id).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { GROUPS, QUESTIONS } from "./questions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = process.argv[2] || path.join(os.tmpdir(), "legal-review.html");
const r = JSON.parse(fs.readFileSync(path.join(here, "..", "drafts-v0.2.json"), "utf8"));

const slug = (doc, no) => {
  if (no === "부칙") return `${doc}-add`;
  if (no === "머리말") return `${doc}-head`;
  const m = /^제(\d+)조$/.exec(no);
  if (!m) throw new Error("조 번호 모양이 다릅니다: " + no);
  return `${doc}-${m[1].padStart(2, "0")}`;
};
const art = (doc, a) => ({ id: slug(doc, a.no), no: a.no, title: a.title, paras: a.paragraphs, basis: a.basis, legal: a.legal, fill: a.operatorFill || [], note: a.note });

// 이용약관
const tos = r.tos;
const tosArts = tos.articles.map(a => art("tos", a));
const tosAddNote = tos.addendum.filter(x => x.startsWith("(검토자에게)"));
tosArts.push({ id: "tos-add", no: "부칙", title: "시행일과 적용", paras: tos.addendum.filter(x => !x.startsWith("(검토자에게)")), basis: "", legal: "", fill: ["시행일", "약관 판 표기를 화면에 보일지"], note: tosAddNote.join(" ").replace(/^\(검토자에게\)\s*/, "") });

// 처리방침 — 머리말(게시할 글)과 검토 안내를 나눈다
const pv = r.privacy;
const MARK = "【처리방침 머리말 — 게시할 글】";
const [pvIntro, pvHead] = pv.preface.split(MARK);
if (!pvHead) throw new Error("처리방침 머리말 표시를 찾지 못했습니다");
const pvArts = [{ id: "pv-head", no: "머리말", title: "처리방침 머리말(게시할 글)", paras: pvHead.trim().split("\n").filter(Boolean), basis: "", legal: "", fill: ["회사 상호"], note: "" }]
  .concat(pv.articles.map(a => art("pv", a)));
pvArts.push({ id: "pv-add", no: "부칙", title: "시행일과 이전 판", paras: pv.addendum, basis: "", legal: "", fill: ["시행일"], note: "" });

// 질문이 가리키는 조가 실제로 있는지 · 질문 id 가 겹치지 않는지
const ids = new Set([...tosArts, ...pvArts].map(a => a.id));
const refSlug = ref => { const [doc, no] = ref.split(":"); return slug(doc, no); };
for (const q of QUESTIONS) for (const ref of q.refs || []) if (!ids.has(refSlug(ref))) throw new Error(`${q.id} 의 관련 조항이 없습니다: ${ref}`);
const qids = QUESTIONS.map(q => q.id);
if (new Set(qids).size !== qids.length) throw new Error("질문 id 가 겹칩니다");
const pointed = new Set(QUESTIONS.flatMap(q => (q.refs || []).map(refSlug)));
const orphan = [...tosArts, ...pvArts].filter(a => a.fill.length && !pointed.has(a.id)).map(a => a.id);

const DATA = {
  groups: GROUPS,
  questions: QUESTIONS,
  docs: {
    tos: { title: tos.title, intro: tos.preface, introSummary: "읽는 법 · 전제 · 출시 전에 꼭 할 일 · 이번 판에서 바뀐 것", articles: tosArts },
    pv: { title: pv.title, intro: pvIntro.trim(), introSummary: "읽는 법 · 출시를 막는 일 · 받지 않은 검토 지적", articles: pvArts },
  },
};
// 인라인 <script> 안에 넣으므로 '</' 와 줄 구분 문자 둘을 이스케이프한다(백슬래시는 글자 코드로 — 셸·도구가 줄여 먹는다)
const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const json = JSON.stringify(DATA).split("</").join("<" + BS + "/").split(LS).join(BS + "u2028").split(PS).join(BS + "u2029");
const tpl = fs.readFileSync(path.join(here, "template.html"), "utf8");
if (!tpl.includes("/*__DATA__*/null")) throw new Error("틀에 자리표시가 없습니다");
const out = tpl.replace("/*__DATA__*/null", () => json);
fs.writeFileSync(outFile, out);
console.log("ok", { out: outFile, bytes: out.length, questions: QUESTIONS.length, tos: tosArts.length, pv: pvArts.length, orphan });
