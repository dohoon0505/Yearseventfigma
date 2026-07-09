/* ============================================================
   xlsx.js — 의존성 없는 XLSX 생성기 (store-only ZIP + inline strings + 스타일).
   sheetToXlsx({ sheetName, rows, cols, merges, rowHeights }) → Uint8Array
     rows      : 2차원 배열. 셀 = string | number | { v, s } (s = 스타일 스펙 객체)
     cols      : [폭(문자 단위), …] 열 너비
     merges    : ["A1:E1", …] 병합 범위
     rowHeights: { 1: 30, … } 1-based 행 높이(pt)
   스타일 스펙 s: { bold, size, color(ARGB), fill(ARGB), align, valign, wrap, border, numFmt }
   aoaToXlsx(sheetName, rows) : 스타일 없는 단순 버전(하위호환).
   외부 라이브러리 없이 OOXML 패키지(zip)를 직접 조립. TextEncoder만 사용(브라우저·Node 공통).
   ============================================================ */

/* CRC-32 (ZIP 무결성) */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = (s) => new TextEncoder().encode(s);
/* XML 1.0 이 금지하는 제어문자(U+0000–08, 0B, 0C, 0E–1F)를 먼저 제거한 뒤 엔티티 이스케이프.
   자유 입력값에 섞인 제어문자 하나가 sheet1.xml 을 깨뜨려 엑셀 '복구' 경고가 뜨는 것을 방지한다.
   (허용 공백 U+0009 tab · U+000A LF · U+000D CR 은 유지) */
const xesc = (s) =>
  String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DEF_COLOR = "FF111111";
const FONT_NAME = "맑은 고딕";
const BORDER_COLOR = "FFD4D4D4";

/* 0-based 열 인덱스 → A, B, …, Z, AA … */
function colRef(n) {
  let s = "";
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* 스타일 스펙 → cellXfs 인덱스 매핑기 (fonts/fills/borders/numFmts/cellXfs 누적) */
function makeStyler() {
  const fonts = [`<font><sz val="11"/><color rgb="${DEF_COLOR}"/><name val="${FONT_NAME}"/></font>`];
  const fontKey = new Map([[`11|${DEF_COLOR}|0`, 0]]);
  const fills = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
  ];
  const fillKey = new Map();
  const borders = [`<border><left/><right/><top/><bottom/><diagonal/></border>`];
  let thinBorderId = -1;
  const numFmts = [];
  const numFmtKey = new Map();
  let numFmtNext = 164;
  const xfs = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];
  const xfKey = new Map();

  const fontId = (bold, size, color) => {
    const k = `${size}|${color}|${bold ? 1 : 0}`;
    if (fontKey.has(k)) return fontKey.get(k);
    const id = fonts.length;
    fonts.push(`<font><sz val="${size}"/><color rgb="${color}"/><name val="${FONT_NAME}"/>${bold ? "<b/>" : ""}</font>`);
    fontKey.set(k, id);
    return id;
  };
  const fillId = (argb) => {
    if (!argb) return 0;
    if (fillKey.has(argb)) return fillKey.get(argb);
    const id = fills.length;
    fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/></patternFill></fill>`);
    fillKey.set(argb, id);
    return id;
  };
  const borderId = (on) => {
    if (!on) return 0;
    if (thinBorderId >= 0) return thinBorderId;
    thinBorderId = borders.length;
    borders.push(
      `<border>` +
        `<left style="thin"><color rgb="${BORDER_COLOR}"/></left>` +
        `<right style="thin"><color rgb="${BORDER_COLOR}"/></right>` +
        `<top style="thin"><color rgb="${BORDER_COLOR}"/></top>` +
        `<bottom style="thin"><color rgb="${BORDER_COLOR}"/></bottom>` +
        `<diagonal/></border>`
    );
    return thinBorderId;
  };
  const numFmtId = (code) => {
    if (!code) return 0;
    if (numFmtKey.has(code)) return numFmtKey.get(code);
    const id = numFmtNext++;
    numFmts.push(`<numFmt numFmtId="${id}" formatCode="${xesc(code)}"/>`);
    numFmtKey.set(code, id);
    return id;
  };

  function xfIndexFor(s) {
    if (!s) return 0;
    const size = s.size || 11;
    const color = s.color || DEF_COLOR;
    const fId = fontId(s.bold, size, color);
    const flId = fillId(s.fill);
    const bId = borderId(s.border);
    const nId = numFmtId(s.numFmt);
    const hasAlign = s.align || s.valign || s.wrap;
    const alignXml = hasAlign
      ? `<alignment${s.align ? ` horizontal="${s.align}"` : ""}${s.valign ? ` vertical="${s.valign}"` : ""}${s.wrap ? ` wrapText="1"` : ""}/>`
      : "";
    const key = `${nId}|${fId}|${flId}|${bId}|${alignXml}`;
    if (xfKey.has(key)) return xfKey.get(key);
    const id = xfs.length;
    const attrs =
      `numFmtId="${nId}" fontId="${fId}" fillId="${flId}" borderId="${bId}" xfId="0"` +
      `${nId ? ' applyNumberFormat="1"' : ""}${fId ? ' applyFont="1"' : ""}` +
      `${flId ? ' applyFill="1"' : ""}${bId ? ' applyBorder="1"' : ""}${hasAlign ? ' applyAlignment="1"' : ""}`;
    xfs.push(alignXml ? `<xf ${attrs}>${alignXml}</xf>` : `<xf ${attrs}/>`);
    xfKey.set(key, id);
    return id;
  }

  function buildXml() {
    const numFmtsXml = numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : "";
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      numFmtsXml +
      `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
      `<fills count="${fills.length}">${fills.join("")}</fills>` +
      `<borders count="${borders.length}">${borders.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
  return { xfIndexFor, buildXml };
}

function sheetXml(rows, styler, cols, merges, rowHeights) {
  const colsXml =
    cols && cols.length
      ? `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
  const body = rows
    .map((row, r) => {
      const cells = (row || [])
        .map((cell, c) => {
          const ref = colRef(c) + (r + 1);
          let v = cell;
          let s = null;
          if (cell !== null && typeof cell === "object") { v = cell.v; s = cell.s; }
          const sAttr = s ? ` s="${styler.xfIndexFor(s)}"` : "";
          if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
          const text = v == null ? "" : String(v);
          if (text === "") return `<c r="${ref}"${sAttr}/>`;
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xesc(text)}</t></is></c>`;
        })
        .join("");
      const ht = rowHeights && rowHeights[r + 1];
      const rowAttr = ht ? ` ht="${ht}" customHeight="1"` : "";
      return `<row r="${r + 1}"${rowAttr}>${cells}</row>`;
    })
    .join("");
  const mergeXml =
    merges && merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    colsXml +
    `<sheetData>${body}</sheetData>` +
    mergeXml +
    `</worksheet>`
  );
}

function concat(arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}
const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

/* store(무압축) 방식 ZIP 조립 → Uint8Array */
function zipStore(files) {
  const out = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lfh = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), nameBytes,
    ]);
    out.push(lfh, f.data);
    central.push(
      concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBytes.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
      ])
    );
    offset += lfh.length + size;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { out.push(c); cdSize += c.length; }
  out.push(
    concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(cdStart), u16(0),
    ])
  );
  return concat(out);
}

/* 스타일·병합·열너비를 지원하는 단일 시트 .xlsx 생성 */
export function sheetToXlsx({ sheetName, rows, cols, merges, rowHeights } = {}) {
  const name = xesc(String(sheetName || "Sheet1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  const styler = makeStyler();
  const sheet = sheetXml(rows || [], styler, cols, merges, rowHeights); // cellXfs 인덱스가 여기서 누적됨
  const parts = [
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: enc(styler.buildXml()) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
  ];
  return zipStore(parts);
}

/* 하위호환: 스타일 없는 2차원 배열 → .xlsx */
export function aoaToXlsx(sheetName, rows) {
  return sheetToXlsx({ sheetName, rows });
}
