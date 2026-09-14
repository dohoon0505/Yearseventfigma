#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-docs.py — docs/*.md → Word(.docx) 생성기.

외부 라이브러리를 쓰지 않는다(표준 zipfile + OOXML 직접 작성). 설치 없이
어느 환경에서나 같은 결과가 나오고, 문서가 바뀌면 재생성만 하면 된다.

    python tools/build-docs.py                 # docs/*.md 전부
    python tools/build-docs.py backend-spec    # 하나만

지원 문법: # ## ### 제목 · 표 · 코드블록 · 인용(>) · 목록(- 1.) · 구분선(---)
           인라인 **굵게** `코드`

⚠ 생성물(.docx)은 커밋하지 않는다(.gitignore). 바이너리라 diff 가 안 보이고
  머지 충돌이 나면 복구가 어렵다. 원본은 항상 Markdown 이다.
"""
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")

FONT = "맑은 고딕"
FONT_MONO = "D2Coding"  # 없으면 Word 가 대체 폰트를 쓴다

# ── OOXML 뼈대 ────────────────────────────────────────────────
CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""


def core_props(title):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>{escape(title)}</dc:title>
<dc:creator>올해의경조사</dc:creator>
</cp:coreProperties>"""


def _style(sid, name, based, extra_ppr="", extra_rpr=""):
    return (
        f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/>'
        f'<w:basedOn w:val="{based}"/>'
        f"<w:pPr>{extra_ppr}</w:pPr><w:rPr>{extra_rpr}</w:rPr></w:style>"
    )


def styles_xml():
    rfonts = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:eastAsia="{FONT}"/>'
    mono = f'<w:rFonts w:ascii="{FONT_MONO}" w:hAnsi="{FONT_MONO}" w:eastAsia="{FONT_MONO}"/>'
    s = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        # 기본 — 본문 10.5pt, 줄간격 1.4
        f'<w:docDefaults><w:rPrDefault><w:rPr>{rfonts}<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr><w:spacing w:line="336" w:lineRule="auto" w:after="120"/></w:pPr></w:pPrDefault>'
        "</w:docDefaults>",
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
        _style("Title", "Title", "Normal",
               '<w:spacing w:before="0" w:after="360"/><w:jc w:val="center"/>',
               '<w:b/><w:sz w:val="52"/><w:color w:val="1A1A1A"/>'),
        _style("Subtitle", "Subtitle", "Normal",
               '<w:spacing w:after="480"/><w:jc w:val="center"/>',
               '<w:sz w:val="20"/><w:color w:val="666666"/>'),
        _style("Heading1", "heading 1", "Normal",
               '<w:pageBreakBefore/><w:spacing w:before="0" w:after="240"/>'
               '<w:pBdr><w:bottom w:val="single" w:sz="12" w:color="F15A2A"/></w:pBdr>',
               '<w:b/><w:sz w:val="36"/><w:color w:val="1A1A1A"/>'),
        _style("Heading2", "heading 2", "Normal",
               '<w:spacing w:before="360" w:after="140"/>',
               '<w:b/><w:sz w:val="27"/><w:color w:val="C2410C"/>'),
        _style("Heading3", "heading 3", "Normal",
               '<w:spacing w:before="240" w:after="100"/>',
               '<w:b/><w:sz w:val="23"/><w:color w:val="333333"/>'),
        _style("Quote", "Quote", "Normal",
               '<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="F15A2A"/></w:pBdr>'
               '<w:shd w:val="clear" w:fill="FFF6F1"/><w:spacing w:before="140" w:after="140"/>',
               '<w:color w:val="333333"/>'),
        _style("CodeBlock", "Code Block", "Normal",
               '<w:shd w:val="clear" w:fill="F6F7F8"/><w:spacing w:before="120" w:after="120" w:line="260" w:lineRule="auto"/>'
               '<w:ind w:left="120" w:right="120"/>',
               f'{mono}<w:sz w:val="18"/><w:color w:val="222222"/>'),
        _style("ListPara", "List Paragraph", "Normal",
               '<w:ind w:left="360" w:hanging="200"/><w:spacing w:after="60"/>'),
        _style("TableCell", "Table Cell", "Normal",
               '<w:spacing w:before="40" w:after="40" w:line="288" w:lineRule="auto"/>',
               '<w:sz w:val="19"/>'),
        _style("TableHead", "Table Head", "TableCell", "", '<w:b/><w:sz w:val="19"/>'),
        "</w:styles>",
    ]
    return "".join(s)


# ── 인라인 파싱 ───────────────────────────────────────────────
INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def runs(text, base_rpr=""):
    """**굵게** 와 `코드` 를 런으로 쪼갠다."""
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            body, rpr = part[2:-2], base_rpr + "<w:b/>"
        elif part.startswith("`") and part.endswith("`"):
            body = part[1:-1]
            rpr = (base_rpr + f'<w:rFonts w:ascii="{FONT_MONO}" w:hAnsi="{FONT_MONO}"/>'
                   '<w:shd w:val="clear" w:fill="F0F1F3"/><w:sz w:val="19"/>')
        else:
            body, rpr = part, base_rpr
        body = body.replace("\\|", "|")
        out.append(f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(body)}</w:t></w:r>')
    return "".join(out) or '<w:r><w:t xml:space="preserve"></w:t></w:r>'


def para(text, style="Normal"):
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{runs(text)}</w:p>'


def code_para(line):
    body = escape(line) if line else ""
    return (f'<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>'
            f'<w:r><w:t xml:space="preserve">{body}</w:t></w:r></w:p>')


def hr():
    return ('<w:p><w:pPr><w:spacing w:before="160" w:after="160"/>'
            '<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="DDDDDD"/></w:pBdr></w:pPr></w:p>')


# ── 표 ───────────────────────────────────────────────────────
def split_row(line):
    line = line.strip().strip("|")
    # 이스케이프된 파이프는 셀 구분자가 아니다
    cells, buf, esc = [], "", False
    for ch in line:
        if esc:
            buf += "\\" + ch
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            cells.append(buf.strip())
            buf = ""
        else:
            buf += ch
    cells.append(buf.strip())
    return cells


def table_xml(rows):
    ncol = max(len(r) for r in rows)
    width = 9360  # 본문 폭(twips)
    col = width // ncol
    grid = "".join(f'<w:gridCol w:w="{col}"/>' for _ in range(ncol))
    borders = (
        "<w:tblBorders>"
        + "".join(
            f'<w:{side} w:val="single" w:sz="4" w:color="D9DCE0"/>'
            for side in ("top", "left", "bottom", "right", "insideH", "insideV")
        )
        + "</w:tblBorders>"
    )
    out = [
        # 테두리를 tblPr 에 직접 넣는다 — 정의하지 않은 tblStyle 을 참조하면
        # Word 가 표를 무테로 그릴 수 있다.
        '<w:tbl><w:tblPr>'
        f'<w:tblW w:w="{width}" w:type="dxa"/>{borders}'
        '<w:tblLayout w:type="fixed"/></w:tblPr>'
        f"<w:tblGrid>{grid}</w:tblGrid>"
    ]
    for i, row in enumerate(rows):
        head = i == 0
        cells = []
        for j in range(ncol):
            txt = row[j] if j < len(row) else ""
            shd = '<w:shd w:val="clear" w:fill="F5F6F7"/>' if head else ""
            style = "TableHead" if head else "TableCell"
            cells.append(
                f'<w:tc><w:tcPr><w:tcW w:w="{col}" w:type="dxa"/>{shd}'
                '<w:vAlign w:val="center"/></w:tcPr>'
                f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{runs(txt)}</w:p></w:tc>'
            )
        keep = '<w:trPr><w:tblHeader/></w:trPr>' if head else ""
        out.append(f"<w:tr>{keep}{''.join(cells)}</w:tr>")
    out.append("</w:tbl>")
    # 표 뒤에 빈 문단이 없으면 Word 가 다음 표와 붙여 버린다
    out.append('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>')
    return "".join(out)


# ── 마크다운 → 본문 ──────────────────────────────────────────
def convert(md):
    body, lines, i = [], md.splitlines(), 0
    first_h1_seen = False
    while i < len(lines):
        line = lines[i]

        # 코드블록
        if line.strip().startswith("```"):
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(code_para(lines[i]))
                i += 1
            i += 1
            continue

        # 표 (구분행이 뒤따르는 헤더행)
        if line.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:\-|]+\|\s*$", lines[i + 1]):
            rows = [split_row(line)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            body.append(table_xml(rows))
            continue

        stripped = line.strip()

        if not stripped:
            i += 1
            continue
        if re.match(r"^-{3,}$", stripped):
            body.append(hr())
            i += 1
            continue
        if stripped.startswith("### "):
            body.append(para(stripped[4:], "Heading3"))
        elif stripped.startswith("## "):
            body.append(para(stripped[3:], "Heading2"))
        elif stripped.startswith("# "):
            # 문서 첫 제목은 표지 제목으로, 이후는 장 제목으로
            if not first_h1_seen:
                body.append(para(stripped[2:], "Title"))
                first_h1_seen = True
            else:
                body.append(para(stripped[2:], "Heading1"))
        elif stripped.startswith("> "):
            body.append(para(stripped[2:], "Quote"))
        elif stripped == ">":
            body.append(para("", "Quote"))
        elif re.match(r"^[-*] ", stripped):
            body.append(para("• " + stripped[2:], "ListPara"))
        elif re.match(r"^\d+\. ", stripped):
            body.append(para(stripped, "ListPara"))
        else:
            body.append(para(stripped))
        i += 1

    sect = (
        "<w:sectPr>"
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1418" w:right="1276" w:bottom="1418" w:left="1276" w:header="851" w:footer="992" w:gutter="0"/>'
        "</w:sectPr>"
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body)}{sect}</w:body></w:document>"
    )


def build(md_path, out_path, title):
    md = open(md_path, encoding="utf-8").read()
    doc = convert(md)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("docProps/core.xml", core_props(title))
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", styles_xml())
        z.writestr("word/document.xml", doc)
    return out_path


TITLES = {"backend-spec": "올해의경조사 — 백엔드 연동 명세서"}


def main():
    targets = sys.argv[1:]
    names = targets or [f[:-3] for f in sorted(os.listdir(DOCS)) if f.endswith(".md")]
    if not names:
        print("docs/*.md 가 없습니다.")
        return 1
    for name in names:
        src = os.path.join(DOCS, name + ".md")
        if not os.path.exists(src):
            print(f"건너뜀: {src} 없음")
            continue
        title = TITLES.get(name, name)
        out = os.path.join(DOCS, title.replace(" — ", " ").replace(" ", "_") + ".docx")
        build(src, out, title)
        print(f"생성: {os.path.relpath(out, ROOT)}  ({os.path.getsize(out) // 1024}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
