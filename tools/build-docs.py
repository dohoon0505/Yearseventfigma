#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-docs.py — docs/*.md → Word(.docx) 조판기.

외부 라이브러리를 쓰지 않는다(표준 zipfile + OOXML 직접 작성). 설치 없이 어느
환경에서나 같은 결과가 나오고, 문서가 바뀌면 재생성만 하면 된다.

    python tools/build-docs.py                 # docs/*.md 전부
    python tools/build-docs.py backend-spec    # 하나만

■ 이 파일은 "마크다운을 기계적으로 옮기는 변환기"가 아니라 **조판기**다.
  읽는 사람이 40쪽짜리 명세서를 실제로 읽을 수 있게 하는 것이 목적이라
  아래를 직접 설계했다.

  · 줄간격 — **가독성의 1번 변수.** lineRule 을 auto 가 아니라 atLeast(절대 twips)로
             쓴다. auto 는 글꼴 자연 줄높이의 배수인데 맑은 고딕은 그 값이 1.5em 이라
             auto 1.5 가 실제로는 2.2em 이 돼 본문이 성기게 흩어진다. 표지 제목처럼
             큰 글자는 exact 로 더 조인다. docDefaults 에서 snapToGrid 도 끈다.
  · 표지 — 문서 앞머리 인용(> …)을 표지 메타로 승격. 라벨·값은 2열 표로 맞춘다
           (탭으로 맞추면 값 시작점이 줄마다 어긋난다). 본문과 섹션을 나눈다.
  · 목차 — Word TOC 필드. settings.xml 의 updateFields 로 열 때 자동으로 채워져
           쪽번호와 하이퍼링크가 생긴다. **장 번호는 제목 런에 남겨 둘 것** —
           눈표에만 두면 목차에 번호가 실리지 않아 "(→ 4.2)" 교차참조를 못 따라간다.
  · 머리글/바닥글 — 본문 섹션에만. 쪽번호는 표지를 빼고 1부터.
  · 장 제목 — 새 페이지에서 시작. `CHAPTER` 눈표 + 브랜드색 번호 + 제목.
  · 표 — 49개나 되므로 가독성의 최대 변수다. 열 너비를 내용에서 산정하고,
         가로선만 남기고, 헤더를 페이지마다 반복하고, 줄무늬를 넣고,
         헤더 아래에만 진한 선을 깐다. 행에는 최소 높이를 준다.
  · 콜아웃 — 여러 줄 인용을 **한 박스로 병합**(줄마다 문단으로 쪼개면 간격이 벌어진다).
             ⚠ 로 시작하는 **일반 문단도 경고 박스로 승격**한다 — 본문과 같은 모양이면
             읽는 사람이 그냥 지나친다. ⚠ 글리프는 맑은 고딕에 없어 Segoe UI Symbol 지정.
  · 코드 — 한 덩어리 박스. JSON 은 키/문자열/숫자에 색을 넣는다.
           박스에 cantSplit 을 걸지 않는다 — 걸면 통째로 다음 장으로 밀려
           반쯤 빈 페이지가 생긴다.
  · 인라인 코드 — 424곳에 나온다. 색을 넣으면 페이지가 얼룩지므로 회색 바탕 + 먹색.
                  한글이 섞이면 Consolas 에 글리프가 없어 자간이 무너지니 본문 글꼴로.
                  굵게 안의 `코드` 도 다시 쪼갠다(안 하면 백틱이 그대로 찍힌다).

■ OOXML 주의
  자식 요소 **순서가 스키마로 고정**돼 있다(w:pPr·w:rPr·w:tblPr·w:tcPr·w:sectPr).
  순서를 어기면 Word 가 "읽을 수 없는 콘텐츠"라며 복구를 띄운다. 아래 헬퍼들은
  순서를 지켜 조립하도록 짜여 있으니 문자열을 직접 이어 붙이지 말 것.

■ 검수는 눈으로 한다
  Word COM 으로 PDF 저장 → WinRT(Windows.Data.Pdf)로 PNG 렌더 → 실제 페이지를 본다.
  텍스트 추출로는 반복 헤더·줄간격·빈 페이지를 볼 수 없다.

■ 생성물(.docx)은 커밋하지 않는다(.gitignore). 원본은 항상 Markdown 이다.
"""
import io
import math
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape as xesc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")


# ══════════════════════════════════════════════════════════════
#  디자인 토큰
# ══════════════════════════════════════════════════════════════
class T:
    # 페이지 (twips: 1mm = 56.7)
    PAGE_W, PAGE_H = 11906, 16838        # A4
    MARGIN = 1134                         # 20mm
    HEADER_D, FOOTER_D = 624, 624
    BODY_W = PAGE_W - MARGIN * 2          # 9638

    # 글꼴
    KR = "맑은 고딕"
    MONO = "Consolas"

    # 색
    INK = "111111"        # 제목
    BODY = "333333"       # 본문
    SOFT = "666666"       # 보조
    FAINT = "9AA0A6"      # 아주 약한
    BRAND = "F15A2A"
    BRAND_INK = "C2410C"
    BRAND_WASH = "FFF3EE"
    LINE = "E1E4E8"
    RULE = "AEB4BB"       # 표 헤더 아래 굵은 선
    LINE_SOFT = "EFF1F3"
    HEAD_BG = "F3F4F6"
    ZEBRA = "FAFAFB"
    CODE_BG = "EEF1F4"
    CODE_INK = "24292F"   # 인라인 코드 — 문서에 424곳. 색을 넣으면 페이지가 얼룩진다
    WARN_BG = "FFF4F4"
    WARN_BAR = "D92D20"
    NOTE_BAR = "F15A2A"

    # JSON 구문 색
    J_KEY = "1F6FEB"
    J_STR = "0A7B34"
    J_NUM = "B25000"
    J_PUNC = "6E7781"

    # 크기(half-point)
    SZ_BODY = 21          # 10.5pt
    SZ_CELL = 19          # 9.5pt
    SZ_CODE = 17          # 8.5pt
    SZ_H1 = 40            # 20pt
    SZ_H2 = 27            # 13.5pt
    SZ_H3 = 22            # 11pt
    SZ_SMALL = 17
    SZ_TITLE = 60         # 30pt (표지)

    # 줄간격 — **lineRule="atLeast" 로 쓴다**(twips 절대값).
    # auto 는 글꼴의 자연 줄높이에 배수를 곱하는데 맑은 고딕은 그 값이 1.5em 이라
    # auto 1.5 가 실제로는 2.2em 이 돼 버린다. 절대값으로 못 박아야 예측이 된다.
    LN_BODY = 380         # 19pt / 10.5pt 본문 = 1.81em
    LN_CELL = 320         # 16pt / 9.5pt  셀   = 1.68em
    LN_CODE = 265         # 13.3pt / 8.5pt 코드 = 1.56em
    LN_TITLE = 700        # 표지 제목은 exact — 큰 글자는 자연 줄높이가 과하다


def mm(v):
    """mm → twips"""
    return int(round(v * 56.7))


# ══════════════════════════════════════════════════════════════
#  XML 조립 헬퍼 — 스키마 순서를 지켜 만든다
# ══════════════════════════════════════════════════════════════
def rpr(font=None, mono=False, size=None, bold=False, italic=False,
        color=None, shade=None, caps=False, spacing=None, valign=None):
    """w:rPr — 스키마 순서: rFonts, b, i, caps, color, spacing, sz, szCs, shd, vertAlign"""
    f = T.MONO if mono else (font or T.KR)
    out = [f'<w:rFonts w:ascii="{f}" w:hAnsi="{f}" w:eastAsia="{f}" w:cs="{f}"/>']
    if bold: out.append("<w:b/><w:bCs/>")
    if italic: out.append("<w:i/><w:iCs/>")
    if caps: out.append("<w:caps/>")
    if color: out.append(f'<w:color w:val="{color}"/>')
    if spacing is not None: out.append(f'<w:spacing w:val="{spacing}"/>')
    if size: out.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    if shade: out.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>')
    if valign: out.append(f'<w:vertAlign w:val="{valign}"/>')
    return "".join(out)


def ppr(style=None, keep_next=False, page_break=False, numid=None, ilvl=0,
        borders=None, shade=None, tabs=None, spacing=None, ind=None, jc=None,
        outline=None, contextual=False, sect=None):
    """w:pPr — 스키마 순서 준수:
       pStyle, keepNext, pageBreakBefore, numPr, pBdr, shd, tabs, spacing, ind,
       contextualSpacing, jc, outlineLvl, sectPr
    """
    out = []
    if style: out.append(f'<w:pStyle w:val="{style}"/>')
    if keep_next: out.append("<w:keepNext/><w:keepLines/>")
    if page_break: out.append("<w:pageBreakBefore/>")
    if numid is not None:
        out.append(f'<w:numPr><w:ilvl w:val="{ilvl}"/><w:numId w:val="{numid}"/></w:numPr>')
    if borders: out.append(borders)
    if shade: out.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>')
    if tabs: out.append(tabs)
    if spacing: out.append(spacing)
    if ind: out.append(ind)
    if contextual: out.append("<w:contextualSpacing/>")
    if jc: out.append(f'<w:jc w:val="{jc}"/>')
    if outline is not None: out.append(f'<w:outlineLvl w:val="{outline}"/>')
    if sect: out.append(sect)
    return "".join(out)


def sp(before=None, after=None, line=None, rule="atLeast"):
    a = []
    if before is not None: a.append(f'w:before="{before}"')
    if after is not None: a.append(f'w:after="{after}"')
    if line is not None: a.append(f'w:line="{line}" w:lineRule="{rule}"')
    return f"<w:spacing {' '.join(a)}/>" if a else ""


def indent(left=None, right=None, hanging=None, first=None):
    a = []
    if left is not None: a.append(f'w:left="{left}"')
    if right is not None: a.append(f'w:right="{right}"')
    if hanging is not None: a.append(f'w:hanging="{hanging}"')
    if first is not None: a.append(f'w:firstLine="{first}"')
    return f"<w:ind {' '.join(a)}/>" if a else ""


def bdr(**sides):
    """pBdr — 순서: top, left, bottom, right, between, bar"""
    order = ["top", "left", "bottom", "right", "between"]
    parts = []
    for k in order:
        v = sides.get(k)
        if not v:
            continue
        size, color, space = v
        parts.append(f'<w:{k} w:val="single" w:sz="{size}" w:space="{space}" w:color="{color}"/>')
    return f"<w:pBdr>{''.join(parts)}</w:pBdr>" if parts else ""


def run(text, **kw):
    return f'<w:r><w:rPr>{rpr(**kw)}</w:rPr><w:t xml:space="preserve">{xesc(text)}</w:t></w:r>'


def para(runs, **kw):
    p = ppr(**kw)
    body = runs if isinstance(runs, str) else "".join(runs)
    return f"<w:p>{f'<w:pPr>{p}</w:pPr>' if p else ''}{body}</w:p>"


def brk():
    return '<w:r><w:br/></w:r>'


# ══════════════════════════════════════════════════════════════
#  인라인 파싱 — **굵게** `코드`
# ══════════════════════════════════════════════════════════════
INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")
CODE = re.compile(r"(`[^`]+`)")
HANGUL = re.compile(r"[가-힣ㄱ-ㆎ]")


def code_run(body, base):
    """인라인 코드 한 조각.

    한글이 섞이면 Consolas 에 글리프가 없어 대체글꼴로 떨어지고 자간이 무너진다.
    `증빙 불일치` 같은 한국어 코드값이 실제로 쓰이므로 글꼴을 갈라 준다.
    """
    kw = dict(base)
    kw["mono"] = not HANGUL.search(body)
    kw["shade"] = T.CODE_BG
    kw["color"] = T.CODE_INK
    kw["bold"] = False
    kw["size"] = max(16, (kw.get("size") or T.SZ_BODY) - (2 if kw["mono"] else 1))
    return run(body, **kw)


def code_split(text, base):
    """일반 텍스트 안의 `코드` 만 갈라낸다(굵게 안쪽에서도 쓴다)."""
    out = []
    for piece in CODE.split(text):
        if not piece:
            continue
        if piece.startswith("`") and piece.endswith("`") and len(piece) > 1:
            out.append(code_run(piece[1:-1], base))
        else:
            out.append(run(piece, **base))
    return "".join(out)


def inline_runs(text, base=None):
    base = dict(base or {})
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 3:
            # 굵게 안에 코드가 또 들어온다 — **`client_id` 를 빼면 안 됩니다** 같은 꼴.
            # 통째로 처리하면 백틱이 본문에 그대로 찍힌다.
            kw = dict(base)
            kw["bold"] = True
            kw.setdefault("color", T.INK)
            out.append(code_split(part[2:-2], kw))
        elif part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append(code_run(part[1:-1], base))
        else:
            out.append(run(part, **base))
    return "".join(out) or run("", **base)


# ══════════════════════════════════════════════════════════════
#  마크다운 → 블록
# ══════════════════════════════════════════════════════════════
RE_H = re.compile(r"^(#{1,6})\s+(.*)$")
RE_HR = re.compile(r"^-{3,}$")
RE_UL = re.compile(r"^[-*]\s+(.*)$")
RE_OL = re.compile(r"^(\d+)\.\s+(.*)$")
RE_TSEP = re.compile(r"^\s*\|[\s:\-|]+\|\s*$")


def split_row(line):
    cells, buf, esc = [], "", False
    for ch in line.strip().strip("|"):
        if esc:
            buf += ch; esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            cells.append(buf.strip()); buf = ""
        else:
            buf += ch
    cells.append(buf.strip())
    return cells


def parse(md):
    lines = md.splitlines()
    out, i = [], 0
    while i < len(lines):
        t = lines[i].strip()

        if t.startswith("```"):
            lang = t[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append({"k": "code", "lang": lang, "lines": buf})
            continue

        if t.startswith("|") and i + 1 < len(lines) and RE_TSEP.match(lines[i + 1]):
            rows = [split_row(t)]
            align = split_row(lines[i + 1])
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i])); i += 1
            out.append({"k": "table", "rows": rows, "align": align})
            continue

        # 인용 — 연속 줄을 한 블록으로 병합. 빈 '>' 가 문단 구분.
        if t.startswith(">"):
            paras, cur = [], []
            while i < len(lines) and lines[i].strip().startswith(">"):
                body = lines[i].strip()[1:].lstrip()
                if body: cur.append(body)
                else:
                    if cur: paras.append(" ".join(cur)); cur = []
                i += 1
            if cur: paras.append(" ".join(cur))
            tone = "warn" if any("⚠" in p for p in paras) else "note"
            out.append({"k": "callout", "tone": tone, "paras": paras})
            continue

        if not t:
            i += 1; continue
        if RE_HR.match(t):
            out.append({"k": "hr"}); i += 1; continue

        m = RE_H.match(t)
        if m:
            out.append({"k": "h", "level": len(m.group(1)), "text": m.group(2).strip()})
            i += 1; continue

        if RE_UL.match(t) or RE_OL.match(t):
            ordered = bool(RE_OL.match(t))
            items = []
            while i < len(lines):
                s = lines[i].strip()
                mu, mo = RE_UL.match(s), RE_OL.match(s)
                if mu and not ordered: items.append(mu.group(1))
                elif mo and ordered: items.append(mo.group(2))
                elif s and items and lines[i].startswith(("  ", "\t")):
                    items[-1] += " " + s
                else:
                    break
                i += 1
            out.append({"k": "list", "ordered": ordered, "items": items})
            continue

        buf = [t]; i += 1
        while i < len(lines):
            s = lines[i].strip()
            if (not s or s.startswith(("|", ">", "#", "```")) or RE_HR.match(s)
                    or RE_UL.match(s) or RE_OL.match(s)):
                break
            buf.append(s); i += 1
        joined = " ".join(buf)
        if joined.startswith("⚠"):
            out.append({"k": "callout", "tone": "warn", "paras": [joined]})
        else:
            out.append({"k": "p", "text": joined})
    return out


# ══════════════════════════════════════════════════════════════
#  표 — 열 너비 산정
# ══════════════════════════════════════════════════════════════
def vis(s):
    """시각적 폭 — 한글·전각 2, 그 외 1"""
    return sum(2 if ord(c) > 0x2E80 else 1 for c in s)


def plain(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    return s.strip()


def col_widths(rows, total=None, min_ch=5, max_share=0.52):
    """열별 dxa.

    긴 셀 하나가 열을 독식하지 않게 **제곱근으로 감쇠**한 뒤 비례 배분한다.
    max(셀)를 그대로 쓰면 156자짜리 셀 하나가 표를 무너뜨리고, 평균을 쓰면
    헤더가 줄바꿈된다. 그래서 본문은 80퍼센타일, 헤더 폭은 하한으로 넣는다.
    """
    total = total or T.BODY_W
    n = max(len(r) for r in rows)
    head = rows[0]
    dem = []
    for c in range(n):
        cells = [vis(plain(r[c])) for r in rows if c < len(r)]
        body = cells[1:] or cells
        bs = sorted(body)
        p80 = bs[min(len(bs) - 1, int(len(bs) * 0.8))]
        hd = vis(plain(head[c])) if c < len(head) else 0
        dem.append(max(min_ch, hd + 1, math.sqrt(max(p80, 1)) * 3.2))
    s = sum(dem)
    w = [max(int(total * min_ch / 100), int(total * d / s)) for d in dem]
    cap = int(total * max_share)
    over = sum(max(0, x - cap) for x in w)
    w = [min(x, cap) for x in w]
    if over:
        room = [i for i, x in enumerate(w) if x < cap]
        if room:
            for i in room: w[i] += over // len(room)
    w[-1] += total - sum(w)          # 합을 본문 폭에 정확히 맞춘다
    return w


def cell_align(spec, idx, rows):
    """구분행(:---:)이 정렬을 지정하면 그것을, 아니면 내용으로 추정."""
    s = spec[idx] if idx < len(spec) else ""
    if s.startswith(":") and s.endswith(":"): return "center"
    if s.endswith(":"): return "right"
    vals = [plain(r[idx]) for r in rows[1:] if idx < len(r)]
    if vals and all(re.fullmatch(r"[\d,.\s원%+\-–—]*", v) for v in vals):
        return "right"
    if vals and all(vis(v) <= 6 for v in vals):
        return "center"
    return "left"


def table_xml(rows, align_spec):
    ncol = max(len(r) for r in rows)
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    w = col_widths(rows)
    aligns = [cell_align(align_spec, c, rows) for c in range(ncol)]

    grid = "".join(f'<w:gridCol w:w="{x}"/>' for x in w)
    # 가로선만 — 세로선을 빼면 표가 훨씬 조용해진다
    borders = (
        "<w:tblBorders>"
        f'<w:top w:val="single" w:sz="8" w:space="0" w:color="{T.LINE}"/>'
        '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'<w:bottom w:val="single" w:sz="8" w:space="0" w:color="{T.LINE}"/>'
        '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{T.LINE_SOFT}"/>'
        '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        "</w:tblBorders>"
    )
    cellmar = (
        "<w:tblCellMar>"
        '<w:top w:w="72" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>'
        '<w:bottom w:w="72" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>'
        "</w:tblCellMar>"
    )
    # w:tblPr 순서: tblW, tblBorders, tblLayout, tblCellMar, tblLook
    out = [
        "<w:tbl><w:tblPr>"
        f'<w:tblW w:w="{sum(w)}" w:type="dxa"/>{borders}'
        '<w:tblLayout w:type="fixed"/>'
        f"{cellmar}"
        '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
        "</w:tblPr>"
        f"<w:tblGrid>{grid}</w:tblGrid>"
    ]
    for ri, row in enumerate(rows):
        head = ri == 0
        # 줄무늬는 스타일 의존 없이 셀에 직접 — 어떤 Word 버전에서도 보인다
        fill = T.HEAD_BG if head else (T.ZEBRA if ri % 2 == 0 else None)
        cells = []
        for ci in range(ncol):
            txt = row[ci]
            al = "left" if head and aligns[ci] == "right" else aligns[ci]
            if head:
                al = aligns[ci] if aligns[ci] != "left" else "left"
            base = {"size": T.SZ_CELL, "color": T.INK if head else T.BODY, "bold": head}
            # w:tcPr 순서: tcW, shd, tcMar, vAlign
            # w:tcPr 순서: tcW, tcBorders, shd, tcMar, vAlign
            tcpr = f'<w:tcW w:w="{w[ci]}" w:type="dxa"/>'
            if head:
                tcpr += ('<w:tcBorders>'
                         '<w:top w:val="nil"/><w:left w:val="nil"/>'
                         f'<w:bottom w:val="single" w:sz="12" w:space="0" w:color="{T.RULE}"/>'
                         '<w:right w:val="nil"/></w:tcBorders>')
            if fill: tcpr += f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
            tcpr += '<w:vAlign w:val="center"/>'
            p = para(
                inline_runs(txt, base),
                spacing=sp(before=40, after=40, line=T.LN_CELL),
                jc=None if al == "left" else al,
            )
            cells.append(f"<w:tc><w:tcPr>{tcpr}</w:tcPr>{p}</w:tc>")
        # w:trPr 순서: cantSplit, trHeight, tblHeader
        hgt = f'<w:trHeight w:val="{440 if head else 400}" w:hRule="atLeast"/>'
        trpr = (f"<w:trPr><w:cantSplit/>{hgt}<w:tblHeader/></w:trPr>" if head
                else f"<w:trPr><w:cantSplit/>{hgt}</w:trPr>")
        out.append(f"<w:tr>{trpr}{''.join(cells)}</w:tr>")
    out.append("</w:tbl>")
    # 표 뒤 빈 문단 — 없으면 다음 표와 붙어 버린다
    out.append(para("", spacing=sp(after=0, line=120)))
    return "".join(out)


# ══════════════════════════════════════════════════════════════
#  박스(콜아웃·코드) — 1x1 표라야 안쪽 여백이 제대로 들어간다
# ══════════════════════════════════════════════════════════════
def box(inner_paras, fill, bar_color, pad=(120, 160, 120, 160)):
    t, l, b, r = pad
    borders = (
        "<w:tblBorders>"
        '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'<w:left w:val="single" w:sz="18" w:space="0" w:color="{bar_color}"/>'
        '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        "</w:tblBorders>"
    )
    cellmar = (
        "<w:tblCellMar>"
        f'<w:top w:w="{t}" w:type="dxa"/><w:left w:w="{l}" w:type="dxa"/>'
        f'<w:bottom w:w="{b}" w:type="dxa"/><w:right w:w="{r}" w:type="dxa"/>'
        "</w:tblCellMar>"
    )
    return (
        "<w:tbl><w:tblPr>"
        f'<w:tblW w:w="{T.BODY_W}" w:type="dxa"/>{borders}'
        f'<w:tblLayout w:type="fixed"/>{cellmar}'
        '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>'
        "</w:tblPr>"
        f'<w:tblGrid><w:gridCol w:w="{T.BODY_W}"/></w:tblGrid>'
        "<w:tr><w:tc><w:tcPr>"
        f'<w:tcW w:w="{T.BODY_W}" w:type="dxa"/>'
        f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
        "</w:tcPr>"
        + "".join(inner_paras) +
        "</w:tc></w:tr></w:tbl>"
        + para("", spacing=sp(after=0, line=140))
    )


def callout_xml(b):
    warn = b["tone"] == "warn"
    paras = []
    for idx, p in enumerate(b["paras"]):
        text = p.lstrip("⚠").strip() if idx == 0 and warn else p
        runs = ""
        if idx == 0 and warn:
            # 맑은 고딕에 ⚠ 글리프가 없어 가는 대체 글꼴로 떨어진다. 기호 글꼴을 직접 지정.
            runs += run("⚠ ", font="Segoe UI Symbol", bold=True,
                        size=T.SZ_BODY, color=T.WARN_BAR)
        # 참고 콜아웃에는 머리 기호를 넣지 않는다 — 박스 왼쪽 막대가 이미 표식이다.
        runs += inline_runs(text, {"size": T.SZ_BODY, "color": T.BODY})
        paras.append(para(runs, spacing=sp(before=0 if idx == 0 else 100, after=0, line=T.LN_BODY)))
    return box(paras, T.WARN_BG if warn else T.BRAND_WASH,
               T.WARN_BAR if warn else T.NOTE_BAR)


JSON_TOK = re.compile(r'("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b-?\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)|([{}\[\],:])')


def code_line_runs(line, lang):
    base = {"mono": True, "size": T.SZ_CODE, "color": T.BODY}
    if lang != "json":
        return run(line, **base) if line else run("", **base)
    out, pos = [], 0
    for m in JSON_TOK.finditer(line):
        if m.start() > pos:
            out.append(run(line[pos:m.start()], **base))
        key, s, num, punc = m.groups()
        if key: out.append(run(key, **{**base, "color": T.J_KEY, "bold": True}))
        elif s: out.append(run(s, **{**base, "color": T.J_STR}))
        elif num: out.append(run(num, **{**base, "color": T.J_NUM}))
        else: out.append(run(punc, **{**base, "color": T.J_PUNC}))
        pos = m.end()
    if pos < len(line):
        out.append(run(line[pos:], **base))
    return "".join(out) or run("", **base)


def code_xml(b):
    lines = b["lines"] or [""]
    paras = []
    for idx, ln in enumerate(lines):
        paras.append(para(
            code_line_runs(ln, b["lang"]),
            spacing=sp(before=0, after=0, line=T.LN_CODE),
        ))
    return box(paras, T.CODE_BG, T.LINE, pad=(140, 160, 140, 160))


# ══════════════════════════════════════════════════════════════
#  문서 조립
# ══════════════════════════════════════════════════════════════
def heading_xml(level, text, first_body):
    # 제목 안의 마크다운 기호는 없앤다. 남겨 두면 목차 필드에도 백틱이 그대로 실린다.
    text = plain(text)
    if level == 1:
        m = re.match(r"^(\d+)\.\s*(.*)$", text)
        eyebrow, title = (m.group(1).zfill(2), m.group(2)) if m else ("", text)
        out = []
        if eyebrow:
            out.append(para(
                run("CHAPTER", size=T.SZ_SMALL, color=T.BRAND, bold=True, spacing=60, caps=True),
                page_break=not first_body, keep_next=True,
                spacing=sp(before=0, after=60, line=240),
            ))
            out.append(para(
                run(eyebrow, size=T.SZ_H1, bold=True, color=T.BRAND)
                + run("  ", size=T.SZ_H1)
                + run(title, size=T.SZ_H1, bold=True, color=T.INK),
                style="Heading1", keep_next=True,
                spacing=sp(before=0, after=300, line=520, rule="exact"),
                borders=bdr(bottom=(12, T.BRAND, 10)),
                outline=0,
            ))
        else:
            out.append(para(
                run(title, size=T.SZ_H1, bold=True, color=T.INK),
                style="Heading1", keep_next=True, page_break=not first_body,
                spacing=sp(before=0, after=300, line=520, rule="exact"),
                borders=bdr(bottom=(12, T.BRAND, 10)),
                outline=0,
            ))
        return "".join(out)
    if level == 2:
        return para(
            run(text, size=T.SZ_H2, bold=True, color=T.BRAND_INK),
            style="Heading2", keep_next=True,
            spacing=sp(before=460, after=170, line=340), outline=1,
        )
    return para(
        run(text, size=T.SZ_H3, bold=True, color=T.INK),
        style="Heading3", keep_next=True,
        spacing=sp(before=340, after=130, line=300), outline=2,
    )


def meta_table(rows, label_w=1500):
    """표지 메타 — 라벨/값 2열. 탭으로 맞추면 값이 들쭉날쭉해진다."""
    val_w = T.BODY_W - label_w
    cells = []
    for label, value in rows:
        c1 = (f'<w:tc><w:tcPr><w:tcW w:w="{label_w}" w:type="dxa"/>'
              '<w:vAlign w:val="center"/></w:tcPr>'
              + para(run(label, size=T.SZ_SMALL, bold=True, color=T.FAINT),
                     spacing=sp(before=0, after=0, line=300)) + "</w:tc>")
        c2 = (f'<w:tc><w:tcPr><w:tcW w:w="{val_w}" w:type="dxa"/>'
              '<w:vAlign w:val="center"/></w:tcPr>'
              + para(inline_runs(value, {"size": T.SZ_BODY, "color": T.BODY}),
                     spacing=sp(before=0, after=0, line=300)) + "</w:tc>")
        cells.append('<w:tr><w:trPr><w:cantSplit/>'
                     '<w:trHeight w:val="440" w:hRule="atLeast"/></w:trPr>'
                     + c1 + c2 + "</w:tr>")
    return (
        "<w:tbl><w:tblPr>"
        f'<w:tblW w:w="{T.BODY_W}" w:type="dxa"/>'
        "<w:tblBorders>"
        '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
        '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>'
        "</w:tblBorders>"
        '<w:tblLayout w:type="fixed"/>'
        "<w:tblCellMar>"
        '<w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>'
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>'
        "</w:tblCellMar>"
        '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>'
        "</w:tblPr>"
        f'<w:tblGrid><w:gridCol w:w="{label_w}"/><w:gridCol w:w="{val_w}"/></w:tblGrid>'
        + "".join(cells) + "</w:tbl>"
    )


def cover_xml(title, meta_paras, subtitle_paras):
    """표지 — 앞머리 인용을 메타로 승격.

    큰 글자는 **exact 줄간격**이라야 한다. atLeast/auto 로 두면 맑은 고딕의
    자연 줄높이(1.5em)가 그대로 먹혀 30pt 제목의 두 줄이 20mm 나 벌어진다.
    """
    out = []
    out.append(para("", spacing=sp(before=0, after=0, line=240)))
    # 브랜드 색 띠
    out.append(para("", borders=bdr(top=(36, T.BRAND, 0)), spacing=sp(before=0, after=700, line=120)))
    out.append(para(
        run("BACKEND INTEGRATION SPECIFICATION", size=T.SZ_SMALL, bold=True, color=T.BRAND, spacing=60, caps=True),
        spacing=sp(before=0, after=200, line=240),
    ))
    out.append(para(
        run(title, size=T.SZ_TITLE, bold=True, color=T.INK),
        spacing=sp(before=0, after=340, line=T.LN_TITLE, rule="exact"),
        ind=indent(right=mm(10)),
    ))
    for p in subtitle_paras:
        out.append(para(
            inline_runs(p, {"size": T.SZ_BODY, "color": T.SOFT}),
            spacing=sp(before=0, after=120, line=400),
            ind=indent(right=mm(18)),
        ))
    out.append(para("", borders=bdr(top=(6, T.LINE, 0)), spacing=sp(before=5200, after=360, line=120)))
    out.append(meta_table(meta_paras))
    return "".join(out)


def toc_xml():
    """Word TOC 필드 — settings.xml 의 updateFields 로 열 때 자동으로 채워진다."""
    fld = (
        '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
        f'<w:r><w:rPr>{rpr(size=T.SZ_BODY)}</w:rPr>'
        '<w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r><w:rPr>{rpr(size=T.SZ_BODY, color=T.SOFT)}</w:rPr>'
        '<w:t xml:space="preserve">목차를 표시하려면 이 문단을 선택하고 F9 를 누르세요.</w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    )
    return para(fld, spacing=sp(before=0, after=200, line=T.LN_BODY))


def build_body(blocks, title):
    """블록 → 본문 XML. 표지/목차를 앞에 붙이고 섹션을 나눈다."""
    # 1) 표지 재료 — 첫 H1 과 그 뒤 첫 인용
    cover_title = title
    meta, subtitle = [], []
    idx = 0
    if blocks and blocks[0]["k"] == "h" and blocks[0]["level"] == 1:
        cover_title = blocks[0]["text"]
        idx = 1
    if idx < len(blocks) and blocks[idx]["k"] == "callout":
        for p in blocks[idx]["paras"]:
            # "**라벨** 값 **라벨** 값 …" 형태면 메타로, 아니면 부제로
            pairs = re.findall(r"\*\*(.+?)\*\*\s*([^*]+)", p)
            if len(pairs) >= 2:
                meta.extend((k.strip(), v.strip(" ·")) for k, v in pairs)
            else:
                subtitle.append(p.replace("⚠", "").strip())
        idx += 1
    # 표지 다음 구분선은 버린다
    while idx < len(blocks) and blocks[idx]["k"] == "hr":
        idx += 1

    body = [cover_xml(cover_title, meta, subtitle)]

    # 2) 표지 섹션 끝 — sectPr 를 마지막 문단에 넣어 섹션을 끊는다
    cover_sect = (
        "<w:sectPr>"
        f'<w:pgSz w:w="{T.PAGE_W}" w:h="{T.PAGE_H}"/>'
        f'<w:pgMar w:top="{T.MARGIN}" w:right="{T.MARGIN}" w:bottom="{T.MARGIN}" w:left="{T.MARGIN}"'
        f' w:header="{T.HEADER_D}" w:footer="{T.FOOTER_D}" w:gutter="0"/>'
        '<w:cols w:space="425"/><w:docGrid w:type="default" w:linePitch="360" w:charSpace="0"/>'
        "</w:sectPr>"
    )
    body.append(para("", spacing=sp(after=0, line=120), sect=cover_sect))

    # 3) 목차 페이지
    body.append(para(
        run("목차", size=T.SZ_H1, bold=True, color=T.INK),
        spacing=sp(before=0, after=300, line=520, rule="exact"),
        borders=bdr(bottom=(12, T.BRAND, 10)),
    ))
    body.append(toc_xml())

    # 4) 본문
    first_body_h1 = True
    rest = blocks[idx:]
    for n, b in enumerate(rest):
        k = b["k"]
        if k == "h":
            if b["level"] == 1:
                body.append(heading_xml(1, b["text"], False))
                first_body_h1 = False
            else:
                # md 자체 목차 표는 제목을 바꿔 자동 목차와 겹치지 않게
                txt = "문서 구성 · 주 독자" if b["text"].strip() == "목차" else b["text"]
                body.append(heading_xml(b["level"], txt, False))
        elif k == "p":
            body.append(para(
                inline_runs(b["text"], {"size": T.SZ_BODY, "color": T.BODY}),
                spacing=sp(before=0, after=190, line=T.LN_BODY),
            ))
        elif k == "table":
            body.append(table_xml(b["rows"], b["align"]))
        elif k == "callout":
            body.append(callout_xml(b))
        elif k == "code":
            body.append(code_xml(b))
        elif k == "list":
            numid = 2 if b["ordered"] else 1
            for it in b["items"]:
                body.append(para(
                    inline_runs(it, {"size": T.SZ_BODY, "color": T.BODY}),
                    numid=numid, contextual=True,
                    spacing=sp(before=0, after=60, line=T.LN_BODY),
                ))
            body.append(para("", spacing=sp(after=0, line=100)))
        elif k == "hr":
            # 장 제목 바로 앞 구분선은 버린다 — 빈 페이지가 생긴다
            nxt = rest[n + 1] if n + 1 < len(rest) else None
            if nxt and nxt["k"] == "h" and nxt["level"] == 1:
                continue
            body.append(para("", borders=bdr(bottom=(4, T.LINE, 0)),
                             spacing=sp(before=160, after=200, line=120)))

    # 5) 본문 섹션 — 머리글·바닥글·쪽번호 1부터
    main_sect = (
        "<w:sectPr>"
        '<w:headerReference w:type="default" r:id="rIdHdr"/>'
        '<w:footerReference w:type="default" r:id="rIdFtr"/>'
        f'<w:pgSz w:w="{T.PAGE_W}" w:h="{T.PAGE_H}"/>'
        f'<w:pgMar w:top="{T.MARGIN}" w:right="{T.MARGIN}" w:bottom="{T.MARGIN}" w:left="{T.MARGIN}"'
        f' w:header="{T.HEADER_D}" w:footer="{T.FOOTER_D}" w:gutter="0"/>'
        '<w:pgNumType w:start="1"/>'
        '<w:cols w:space="425"/><w:docGrid w:type="default" w:linePitch="360" w:charSpace="0"/>'
        "</w:sectPr>"
    )
    return "".join(body), main_sect


# ══════════════════════════════════════════════════════════════
#  파트 파일
# ══════════════════════════════════════════════════════════════
NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')


def part_document(body, sect):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:document {NS}><w:body>{body}{sect}</w:body></w:document>")


def part_header(title):
    p = para(
        run(title, size=T.SZ_SMALL, color=T.FAINT),
        jc="right",
        borders=bdr(bottom=(4, T.LINE_SOFT, 6)),
        spacing=sp(before=0, after=0, line=240),
    )
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}>{p}</w:hdr>'


def part_footer():
    fld = (
        f'<w:r><w:rPr>{rpr(size=T.SZ_SMALL, color=T.SOFT)}</w:rPr><w:t xml:space="preserve"></w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r><w:rPr>{rpr(size=T.SZ_SMALL, color=T.INK, bold=True)}</w:rPr><w:t>1</w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
        f'<w:r><w:rPr>{rpr(size=T.SZ_SMALL, color=T.FAINT)}</w:rPr><w:t xml:space="preserve">  /  </w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        '<w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        f'<w:r><w:rPr>{rpr(size=T.SZ_SMALL, color=T.FAINT)}</w:rPr><w:t>1</w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    )
    p = para(fld, jc="center", spacing=sp(before=0, after=0, line=240))
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}>{p}</w:ftr>'


def part_settings():
    """updateFields — 열 때 TOC·쪽번호 필드를 Word 가 채운다."""
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:settings {NS}>"
            '<w:zoom w:percent="100"/>'
            '<w:defaultTabStop w:val="720"/>'
            '<w:evenAndOddHeaders w:val="false"/>'
            '<w:updateFields w:val="true"/>'
            '<w:compat><w:compatSetting w:name="compatibilityMode" '
            'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
            "</w:settings>")


def part_numbering():
    def lvl(i, fmt, txt, left, hang):
        return (f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/>'
                f'<w:lvlText w:val="{txt}"/><w:lvlJc w:val="left"/>'
                f'<w:pPr><w:ind w:left="{left}" w:hanging="{hang}"/></w:pPr>'
                f'<w:rPr>{rpr(size=T.SZ_BODY, color=T.BRAND)}</w:rPr></w:lvl>')
    bullets = "".join(lvl(i, "bullet", "•" if i == 0 else "–", 300 + i * 320, 260) for i in range(3))
    nums = "".join(lvl(i, "decimal", "%" + str(i + 1) + ".", 300 + i * 320, 300) for i in range(3))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:numbering {NS}>"
            f'<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>{bullets}</w:abstractNum>'
            f'<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>{nums}</w:abstractNum>'
            '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>'
            '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>'
            "</w:numbering>")


def part_styles():
    base_rpr = rpr(size=T.SZ_BODY, color=T.BODY)
    def st(sid, name, outline=None, size=None, color=None, bold=False):
        p = f'<w:outlineLvl w:val="{outline}"/>' if outline is not None else ""
        r = rpr(size=size or T.SZ_BODY, color=color or T.BODY, bold=bold)
        return (f'<w:style w:type="paragraph" w:styleId="{sid}">'
                f'<w:name w:val="{name}"/><w:basedOn w:val="Normal"/>'
                f'<w:next w:val="Normal"/><w:qFormat/>'
                f'<w:pPr>{p}</w:pPr><w:rPr>{r}</w:rPr></w:style>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:styles {NS}>"
            f"<w:docDefaults><w:rPrDefault><w:rPr>{base_rpr}</w:rPr></w:rPrDefault>"
            "<w:pPrDefault><w:pPr>"
            '<w:widowControl/><w:snapToGrid w:val="0"/>'
            f'<w:spacing w:after="190" w:line="{T.LN_BODY}" w:lineRule="atLeast"/>'
            "</w:pPr></w:pPrDefault></w:docDefaults>"
            '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
            '<w:name w:val="Normal"/><w:qFormat/></w:style>'
            + st("Heading1", "heading 1", 0, T.SZ_H1, T.INK, True)
            + st("Heading2", "heading 2", 1, T.SZ_H2, T.BRAND_INK, True)
            + st("Heading3", "heading 3", 2, T.SZ_H3, T.INK, True)
            + '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/>'
              '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>'
              f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{T.BODY_W}"/></w:tabs>'
              '<w:spacing w:before="120" w:after="0"/></w:pPr>'
              f'<w:rPr>{rpr(size=T.SZ_BODY, color=T.INK, bold=True)}</w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/>'
              '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>'
              f'<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{T.BODY_W}"/></w:tabs>'
              '<w:ind w:left="284"/><w:spacing w:before="40" w:after="0"/></w:pPr>'
              f'<w:rPr>{rpr(size=T.SZ_CELL, color=T.SOFT)}</w:rPr></w:style>'
              '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>'
              f'<w:rPr>{rpr(color=T.BODY)}</w:rPr></w:style>'
            + "</w:styles>")


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
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
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>"""


def part_core(title):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f"<dc:title>{xesc(title)}</dc:title><dc:creator>올해의경조사</dc:creator>"
            "</cp:coreProperties>")


# ══════════════════════════════════════════════════════════════
def build(md_path, out_path, title):
    md = io.open(md_path, encoding="utf-8").read()
    blocks = parse(md)
    body, sect = build_body(blocks, title)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("docProps/core.xml", part_core(title))
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", part_styles())
        z.writestr("word/settings.xml", part_settings())
        z.writestr("word/numbering.xml", part_numbering())
        z.writestr("word/header1.xml", part_header(title))
        z.writestr("word/footer1.xml", part_footer())
        z.writestr("word/document.xml", part_document(body, sect))
    return out_path


TITLES = {"backend-spec": "올해의경조사 — 백엔드 연동 명세서"}


def main():
    names = sys.argv[1:] or [f[:-3] for f in sorted(os.listdir(DOCS)) if f.endswith(".md")]
    if not names:
        print("docs/*.md 가 없습니다."); return 1
    for name in names:
        src = os.path.join(DOCS, name + ".md")
        if not os.path.exists(src):
            print(f"건너뜀: {src} 없음"); continue
        title = TITLES.get(name, name)
        out = os.path.join(DOCS, title.replace(" — ", " ").replace(" ", "_") + ".docx")
        build(src, out, title)
        print(f"생성: {os.path.relpath(out, ROOT)}  ({os.path.getsize(out) // 1024}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
