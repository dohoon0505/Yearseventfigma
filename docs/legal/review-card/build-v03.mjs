// 'v0.3 확인 질문' 카드 만들기: questions-v03.mjs + template.html + 캡처 폴더 → 카드 HTML 한 장
// 쓰는 법: node docs/legal/review-card/build-v03.mjs <나갈 파일.html> <캡처 폴더>   (둘 다 레포 밖 — 레포 루트가 그대로 배포되고, 스크린샷은 레포에 두지 않는다)
// 만든 파일은 아티팩트 '약관 v0.3 확인 질문' 에 같은 주소로 다시 올린다(답은 그 아티팩트 db 'answers' 에 있다 — 문서 id 는 질문 id).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, QUESTIONS, PAGE } from "./questions-v03.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [outFile, shotDir] = process.argv.slice(2);
if (!outFile || !shotDir) throw new Error("쓰는 법: build-v03.mjs <나갈 파일.html> <캡처 폴더>");

const ids = QUESTIONS.map(q => q.id);
if (new Set(ids).size !== ids.length) throw new Error("질문 id 가 겹칩니다");
const want = [...Array.from({ length: 23 }, (_, i) => `V${i + 1}`).filter(x => x !== "V10"), ...Array.from({ length: 22 }, (_, i) => `V10-${i + 1}`)];
const lost = want.filter(x => !ids.includes(x));
if (lost.length || ids.length !== want.length) throw new Error("빠진 질문: " + lost.join(" "));
for (const q of QUESTIONS) if (!GROUPS.some(g => g.id === q.group)) throw new Error(`${q.id} 의 묶음이 없습니다`);

const questions = QUESTIONS.map(q => !q.shots ? q : { ...q, shots: q.shots.map(s => ({
  cap: s.cap, src: "data:image/jpeg;base64," + fs.readFileSync(path.join(shotDir, s.f + ".jpg")).toString("base64"),
})) });

// 인라인 <script> 안에 넣으므로 '</' 와 줄 구분 문자 둘을 이스케이프한다(build.mjs 와 같다)
const BS = String.fromCharCode(92), LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const json = JSON.stringify({ groups: GROUPS, questions, docs: {}, summary: PAGE.summary }).split("</").join("<" + BS + "/").split(LS).join(BS + "u2028").split(PS).join(BS + "u2029");

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let out = fs.readFileSync(path.join(here, "template.html"), "utf8");
const swap = (re, text) => { if (!re.test(out)) throw new Error("틀에서 찾지 못했습니다: " + re); out = out.replace(re, () => text); };
swap(/<title>[^<]*<\/title>/, `<title>${esc(PAGE.title)}</title>`);
swap(/<div class="eyebrow">[^\n]*<\/div>/, `<div class="eyebrow">${esc(PAGE.eyebrow)}</div>`);
swap(/<h1>[^<]*<\/h1>/, `<h1>${esc(PAGE.title)}</h1>`);
swap(/(?:[ \t]*<p class="lead">[^\n]*<\/p>\n)+/, PAGE.leads.map(l => `    <p class="lead">${esc(l)}</p>\n`).join(""));
swap(/<footer class="wrap" lang="ko">[\s\S]*?<\/footer>/, `<footer class="wrap" lang="ko">\n${PAGE.footer.map(l => `  <p>${esc(l)}</p>`).join("\n")}\n</footer>`);
if (!out.includes("/*__DATA__*/null")) throw new Error("틀에 자리표시가 없습니다");
out = out.replace("/*__DATA__*/null", () => json);
fs.writeFileSync(outFile, out);
console.log(`${outFile} · ${(out.length / 1024).toFixed(0)}KB · 질문 ${ids.length}개`);
