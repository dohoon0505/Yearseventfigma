/* ============================================================
   build-legal.mjs — 이용약관 · 개인정보 처리방침 전문을 앱 데이터로 옮긴다.
   실행:  node tools/build-legal.mjs          (두 파일의 '만든 칸'을 다시 쓴다)
          node tools/build-legal.mjs --check  (다시 쓰지 않고, 지금 파일과 다르면 exit 1)

   원본(정본)은 docs/legal 의 초안 md 다 — 앱은 그 글을 **한 글자도 고치지 않고** 옮긴다(2026-11-12 사용자 결정 · K-03 이식).
     docs/legal/tos-draft-v0.3.md      → js/data/terms.js          의 TERMS_DOC
     docs/legal/privacy-draft-v0.3.md  → js/data/privacy-policy.js 의 PRIVACY_POLICY_DOC
   md 를 고쳤으면 이 도구를 다시 돌린다. 두 js 파일은 머리 주석 · 판(TERMS_VERSION) · 요약(TERMS_SUMMARY)을 손으로 쓰고,
   '@generated' 두 줄 사이만 이 도구가 쓴다(그 사이를 손으로 고치면 다음에 돌릴 때 덮인다).

   옮기는 것 / 버리는 것:
   - 조(`## 제N조 제목`)의 항(①②…) · 호(`1.`) · 목록(`- ` = dash · `· ` = dot · 들여 쓴 `  · ` 와 맨 글 줄 = tx)만 옮긴다.
   - `>` 로 시작하는 칸(근거 · 법 · 정할 것 · 작성 메모)과 '(검토자에게)' 문단, 머리의 검토용 안내, '## 남은 물음' 은 버린다.
   - 대괄호 표지('[서버 계획 — 출시 때 확인]' · '[회사 정보 — 게시본에서 채움: 상호]' 등)는 글자 그대로 둔다 — 회사 정보 자리는
     화면이 사이트 정보 칸과 같은 출처(data/site-info.js)로 채운다(util/legal-doc.js · fillCompany).
   - 세 칸 표는 TABLES 에 적은 항만이다(지금 처리방침 제5조 ② 사람별 처리 근거 하나 — 시안 K-03 이 표로 그린 곳). 그 항의
     '(가 — 나 — 다)' 머리 줄과 '- 가 — 나 — 다' 줄을 표로 옮긴다. 같은 꼴의 다른 목록(제6조 ② · 제7조 ③ · ④)은 목록 그대로 둔다 —
     제7조 ③ 은 딸린 줄이 있어 표가 될 수 없는데 ④ 만 표로 바꾸면 한 조 안의 같은 머리 줄이 두 모양이 된다(시안도 목록이다).
   - 굵게 보일 중요 내용(약관 머리 '【화면에서 굵게 보일 중요 내용】' 목록 — 순서가 곧 '중요 ①~⑦' 번호)은 그 항에 imp 번호로 붙인다.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const BEGIN = "/* @generated:begin — tools/build-legal.mjs 가 쓴다. 손으로 고치지 말 것(다시 돌리면 덮인다). */";
const END = "/* @generated:end */";

/** 표로 옮기는 항 — { doc, art, para } */
const TABLES = [{ doc: "privacy", art: 5, para: "②" }];

const read = (rel) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const fail = (msg) => { console.error(`build-legal: ${msg}`); process.exit(1); };

/* "2026년 10월 31일" → "2026-10-31" */
function isoOf(text) {
  const m = /(\d{4})년 (\d{1,2})월 (\d{1,2})일/.exec(text);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** md 를 '## ' 머리 단위로 자른다 → [{ head, lines }] (첫 칸은 head "" = 머리말 앞부분) */
function sections(md) {
  const out = [{ head: "", lines: [] }];
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) out.push({ head: line.slice(3).trim(), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

/** 빈 줄로 가른 덩어리(근거 칸 `>` 줄은 버린다) — 줄 끝 공백(md 줄바꿈 표시)은 지우고 앞 들여쓰기는 남긴다. */
function blocks(lines) {
  const out = [];
  let cur = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith(">")) { if (cur.length) { out.push(cur); cur = []; } continue; }
    if (!line.trim()) { if (cur.length) { out.push(cur); cur = []; } continue; }
    cur.push(line);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 한 줄 → 목록 칸 { k, n?, text } */
function itemOf(line) {
  let m;
  if ((m = /^(\d+)\. (.+)$/.exec(line))) return { k: "num", n: m[1], text: m[2].trim() };
  if ((m = /^- (.+)$/.exec(line))) return { k: "dash", text: m[1].trim() };
  if ((m = /^· (.+)$/.exec(line))) return { k: "dot", text: m[1].trim() };
  /* 들여 쓴 '  · ' 는 위 줄에 딸린 줄이다 — 표지 '·' 를 글에 남긴 맨 글 줄(tx)로 둔다(시안 K-03 의 모양 · sub 표시로 표 판정에 쓴다). */
  if ((m = /^\s+· (.+)$/.exec(line))) return { k: "tx", text: `· ${m[1].trim()}`, sub: true };
  return { k: "tx", text: line.trim() };
}

/** '(가 — 나 — 다)' 머리 + 딸린 줄 없는 dash 줄들 → 표. 아니면 그대로 */
function tableOf(items) {
  const at = items.findIndex((it) => it.k === "tx" && /^\(.+ — .+ — .+\)$/.test(it.text));
  if (at < 0) return null;
  const rows = [];
  let i = at + 1;
  for (; i < items.length && items[i].k === "dash"; i++) rows.push(items[i]);
  if (!rows.length) return null;
  if (i < items.length) return null;            // 표 뒤에 다른 줄(딸린 줄 포함)이 있으면 목록 그대로
  if (at !== 0) return null;                    // 머리 줄 앞에 다른 줄이 있으면 목록 그대로
  const head = items[at].text.slice(1, -1).split(" — ");
  if (head.length !== 3) return null;
  const cells = rows.map((r) => {
    const parts = r.text.split(" — ");
    if (parts.length < 3) return null;
    return [parts[0], parts[1], parts.slice(2).join(" — ")]; // 셋째 칸 안의 ' — ' 는 글의 일부다(제5조 ② '…(제6호) — 거래처와 …')
  });
  if (cells.some((c) => !c)) return null;
  return { head, rows: cells };
}

/** 조 하나의 본문 덩어리 → 항 목록 */
function parasOf(lines, where, doc, no) {
  const paras = [];
  let cur = null;
  for (const b of blocks(lines)) {
    if (/^\(검토자에게/.test(b[0])) continue;
    const first = b[0];
    const circ = CIRCLED.includes(first[0]) && first[1] === " ";
    if (circ) {
      cur = { n: first[0], text: first.slice(2).trim(), imp: 0, items: [] };
      paras.push(cur);
      b.slice(1).forEach((l) => cur.items.push(itemOf(l)));
      continue;
    }
    if (!cur) {
      /* 항 번호가 없는 조(약관 제10조 — 한 항뿐이라 번호를 달지 않았다) */
      cur = { n: "", text: first.trim(), imp: 0, items: [] };
      paras.push(cur);
      b.slice(1).forEach((l) => cur.items.push(itemOf(l)));
      continue;
    }
    b.forEach((l) => cur.items.push(itemOf(l)));
  }
  for (const p of paras) {
    if (TABLES.some((x) => x.doc === doc && x.art === no && x.para === p.n)) {
      const t = tableOf(p.items);
      if (!t) fail(`${where} ${p.n}: 표로 옮길 항인데 '(가 — 나 — 다)' 머리 줄과 줄들을 읽지 못했다`);
      p.table = t;
      p.items = [];
    }
    p.items = p.items.map(({ sub, ...it }) => it);
    if (/[*`]/.test(p.text) || p.items.some((it) => /[*`]/.test(it.text))) fail(`${where} ${p.n}: md 꾸밈 글자(* \`)가 남았다 — 글을 확인할 것`);
  }
  return paras;
}

function articlesOf(secs, where, doc) {
  return secs
    .map((s) => {
      const m = /^제(\d+)조 (.+)$/.exec(s.head);
      if (!m) return null;
      const no = Number(m[1]);
      const title = m[2].trim();
      const deleted = title === "(삭제)";
      return { no, title, deleted, paras: deleted ? [] : parasOf(s.lines, `${where} 제${no}조`, doc, no) };
    })
    .filter(Boolean);
}

/* ── 이용약관 ─────────────────────────────────────────────── */
function buildTerms() {
  const md = read("docs/legal/tos-draft-v0.3.md");
  const secs = sections(md);
  const headLines = secs[0].lines;
  /* 【짜임】 — 장 */
  const chapters = [];
  for (const l of headLines) {
    const m = /^- 제(\d+)장 (.+?)\(제(\d+)~(\d+)조/.exec(l);
    if (m) chapters.push({ no: Number(m[1]), title: m[2].trim(), from: Number(m[3]), to: Number(m[4]) });
  }
  if (chapters.length !== 7) fail(`약관 장이 ${chapters.length}개 — 【짜임】 줄을 확인할 것`);
  const articles = articlesOf(secs, "약관", "terms");
  articles.forEach((a) => { a.ch = (chapters.find((c) => a.no >= c.from && a.no <= c.to) || {}).no || 0; });
  /* 【화면에서 굵게 보일 중요 내용】 — 순서 = 중요 번호 */
  const s = headLines.findIndex((l) => l.startsWith("【화면에서 굵게 보일 중요 내용】"));
  if (s < 0) fail("약관 머리에 【화면에서 굵게 보일 중요 내용】 이 없다");
  let impNo = 0;
  for (let i = s + 1; i < headLines.length && headLines[i].startsWith("- "); i++) {
    const m = /^- 제(\d+)조 (.+?)\(/.exec(headLines[i]);
    if (!m) fail(`중요 내용 줄을 읽지 못했다: ${headLines[i]}`);
    impNo += 1;
    const art = articles.find((a) => a.no === Number(m[1]));
    const hangs = [...m[2].matchAll(/제(\d+)항/g)].map((x) => CIRCLED[Number(x[1]) - 1]);
    if (!art || !hangs.length) fail(`중요 내용 줄의 조·항을 찾지 못했다: ${headLines[i]}`);
    for (const h of hangs) {
      const p = art.paras.find((x) => x.n === h);
      if (!p) fail(`제${art.no}조 ${h} 이 없다(중요 내용)`);
      p.imp = impNo;
    }
  }
  if (impNo !== 7) fail(`중요 내용이 ${impNo}가지 — 7가지여야 한다`);
  /* 부칙 */
  const bu = secs.find((x) => x.head === "부칙");
  const buchik = blocks(bu.lines).filter((b) => !/^\(검토자에게/.test(b[0])).map((b) => b.join(" ").trim());
  const effective = isoOf(buchik.find((l) => /시행한다/.test(l)) || "");
  if (!effective) fail("약관 부칙에서 시행일을 읽지 못했다");
  return { source: "docs/legal/tos-draft-v0.3.md", effective, chapters, articles, buchik };
}

/* ── 개인정보 처리방침 ─────────────────────────────────────── */
function buildPolicy() {
  const md = read("docs/legal/privacy-draft-v0.3.md");
  const secs = sections(md);
  const headLines = secs[0].lines;
  const s = headLines.findIndex((l) => l.startsWith("【처리방침 머리말 — 게시할 글】"));
  if (s < 0) fail("처리방침에 【처리방침 머리말 — 게시할 글】 이 없다");
  const preface = [];
  for (let i = s + 1; i < headLines.length; i++) {
    const l = headLines[i].trim();
    if (!l) { if (preface.length) break; continue; }
    if (l.startsWith("【")) break;
    preface.push(l);
  }
  const articles = articlesOf(secs, "처리방침", "privacy");
  const bu = secs.find((x) => x.head === "부칙");
  const buchik = blocks(bu.lines).map((b) => b.join(" ").trim());
  const effective = isoOf(buchik.find((l) => /시행합니다/.test(l)) || "");
  if (!effective) fail("처리방침 부칙에서 시행일을 읽지 못했다");
  return { source: "docs/legal/privacy-draft-v0.3.md", effective, preface, articles, buchik };
}

/* ── 쓰기 — 조 하나가 한 줄(바뀐 조만 diff 에 보이게) ───────── */
const j = (v) => JSON.stringify(v);
function emit(name, doc) {
  const keys = Object.keys(doc);
  const lines = [`export const ${name} = Object.freeze({`];
  for (const k of keys) {
    if (Array.isArray(doc[k]) && (k === "articles" || k === "chapters" || k === "buchik" || k === "preface")) {
      lines.push(`  ${k}: [`);
      doc[k].forEach((x) => lines.push(`    ${j(x)},`));
      lines.push("  ],");
    } else lines.push(`  ${k}: ${j(doc[k])},`);
  }
  lines.push("});");
  return lines.join("\n");
}

function put(rel, body) {
  const path = join(ROOT, rel);
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END);
  if (a < 0 || b < a) fail(`${rel} 에 @generated 두 줄이 없다`);
  const next = `${src.slice(0, a)}${BEGIN}\n${body}\n${src.slice(b)}`;
  if (CHECK) {
    if (next !== src) { console.error(`build-legal: ${rel} 이 md 와 다르다 — node tools/build-legal.mjs 를 돌릴 것`); return false; }
    return true;
  }
  if (next !== src) writeFileSync(path, next);
  console.log(`${rel}: ${next === src ? "그대로" : "다시 씀"}`);
  return true;
}

const terms = buildTerms();
const policy = buildPolicy();
const ok = [
  put("js/data/terms.js", emit("TERMS_DOC", terms)),
  put("js/data/privacy-policy.js", emit("PRIVACY_POLICY_DOC", policy)),
].every(Boolean);
const n = (d) => d.articles.reduce((s, a) => s + a.paras.reduce((t, p) => t + p.text.length + p.items.reduce((u, it) => u + it.text.length, 0), 0), 0);
console.log(`약관 ${terms.articles.length}개 조 · ${n(terms).toLocaleString()}자 · 처리방침 ${policy.articles.length}개 조 · ${n(policy).toLocaleString()}자`);
if (!ok) process.exit(1);
