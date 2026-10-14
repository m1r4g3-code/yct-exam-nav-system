"""Build the YCT Exam Portal presentation PDFs from docs/presentation/src/.

Usage (from the repository root or anywhere):
    python docs/presentation/build.py                 # build all three PDFs
    python docs/presentation/build.py overview        # build one (overview | admin | student)
    python docs/presentation/build.py --preview DIR   # also render every page to PNG in DIR/<doc>/

Requirements: Python 3.10+, playwright, pypdf, PyMuPDF (fitz) and an installed
Google Chrome (or Microsoft Edge). Fonts are local files in src/assets/fonts.

How it works
  1. Each source page (src/*.html) is expanded: <!--#include file="partials/x.html" -->
     lines are replaced by the partial's contents (recursively).
  2. Pass 1 renders the PDF with invisible markers inside every heading that the
     table of contents points at (data-ref="id"); PyMuPDF finds the page of each marker.
  3. Pass 2 writes those page numbers into the contents page and renders the final PDF.
  4. pypdf adds the document metadata (title, author, subject, keywords).
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"

DOCS = {
    "overview": {
        "src": "overview.html",
        "out": "YCT-Exam-Portal-Project-Overview.pdf",
        "title": "YCT Exam Portal: Project Overview",
        "subject": "Smart Examination Timetable Generator & Real-Time Hall Navigation: "
                   "project documentation for Yaba College of Technology",
    },
    "admin": {
        "src": "admin-guide.html",
        "out": "YCT-Exam-Portal-Exams-Office-Guide.pdf",
        "title": "YCT Exam Portal: Exams Office Guide",
        "subject": "How exams officers set up, generate, review and publish the examination timetable",
    },
    "student": {
        "src": "student-guide.html",
        "out": "YCT-Exam-Portal-Student-Guide.pdf",
        "title": "YCT Exam Portal: Student Guide",
        "subject": "How students register, choose courses, read their timetable and find their exam hall",
    },
}

AUTHOR = "YCT Exam Portal"
KEYWORDS = "Yaba College of Technology, Yabatech, examination timetable, exam hall navigation, DSatur"

INCLUDE_RE = re.compile(r'<!--#include\s+file="([^"]+)"\s*-->')
REF_RE = re.compile(r'data-ref="([A-Za-z0-9_-]+)"')
MARKER_TEXT = "@@M:{}@@"
CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def expand_includes(text: str, base: Path, depth: int = 0) -> str:
    if depth > 8:
        raise RuntimeError("Include nesting too deep")

    def repl(match: re.Match) -> str:
        path = (base / match.group(1)).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Include not found: {path}")
        return expand_includes(path.read_text(encoding="utf-8"), base, depth + 1)

    return INCLUDE_RE.sub(repl, text)


def prepare_html(doc: dict) -> str:
    text = (SRC / doc["src"]).read_text(encoding="utf-8")
    text = expand_includes(text, SRC)
    base_tag = f'<base href="{SRC.as_uri()}/">'
    return text.replace("<head>", "<head>\n" + base_tag, 1)


def add_markers(html: str, refs: list[str]) -> str:
    for ref in refs:
        pattern = re.compile(r'(<[A-Za-z][A-Za-z0-9]*\b[^>]*\bid="' + re.escape(ref) + r'"[^>]*>)')
        marker = f'<span class="toc-marker">{MARKER_TEXT.format(ref)}</span>'
        html, count = pattern.subn(lambda m: m.group(1) + marker, html, count=1)
        if count == 0:
            print(f"   ! contents entry points at missing id '{ref}'")
    return html


def fill_toc(html: str, pages: dict[str, int]) -> str:
    # Replace the (empty) contents of every <span class="t-page" data-ref="x"></span>.
    def fill(match: re.Match) -> str:
        ref = match.group(2)
        num = pages.get(ref)
        return f"{match.group(1)}{num if num is not None else ''}{match.group(3)}"

    return re.sub(r'(<span class="t-page" data-ref="([A-Za-z0-9_-]+)">)[^<]*(</span>)', fill, html)


def launch_browser(p):
    try:
        return p.chromium.launch(channel="chrome")
    except Exception:
        pass
    for exe in CHROME_PATHS:
        if Path(exe).is_file():
            try:
                return p.chromium.launch(executable_path=exe)
            except Exception:
                continue
    return p.chromium.launch()


def render(page, html: str, out_pdf: Path, workdir: Path, name: str) -> None:
    tmp_html = workdir / f"{name}.html"
    tmp_html.write_text(html, encoding="utf-8")
    page.goto(tmp_html.as_uri(), wait_until="load")
    page.evaluate("async () => { await document.fonts.ready; return true; }")
    page.wait_for_timeout(150)
    page.pdf(
        path=str(out_pdf),
        prefer_css_page_size=True,
        print_background=True,
        display_header_footer=False,
        outline=True,
        tagged=True,
    )


def find_marker_pages(pdf_path: Path, refs: list[str]) -> tuple[dict[str, int], int]:
    import fitz  # PyMuPDF

    pages: dict[str, int] = {}
    with fitz.open(str(pdf_path)) as pdf:
        count = pdf.page_count
        for index, pg in enumerate(pdf):
            text = pg.get_text()
            for ref in refs:
                if ref not in pages and MARKER_TEXT.format(ref) in text:
                    pages[ref] = index + 1
    return pages, count


def tidy_outline(writer) -> None:
    """Chrome occasionally repeats a heading's text in its bookmark ("TitleTitle")
    when the heading moves to the next page; collapse such titles."""
    from pypdf.generic import NameObject, TextStringObject

    def walk(node):
        while node is not None:
            item = node.get_object()
            title = str(item.get("/Title", ""))
            half = len(title) // 2
            if title and len(title) % 2 == 0 and title[:half] == title[half:]:
                item[NameObject("/Title")] = TextStringObject(title[:half])
            if "/First" in item:
                walk(item["/First"])
            node = item.get("/Next")

    outlines = writer._root_object.get("/Outlines")
    if outlines is not None and "/First" in outlines.get_object():
        walk(outlines.get_object()["/First"])


def set_metadata(src_pdf: Path, out_pdf: Path, doc: dict) -> int:
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(src_pdf))
    writer = PdfWriter(clone_from=reader)
    try:
        tidy_outline(writer)
    except Exception as exc:  # bookmarks are a nicety; never fail the build over them
        print(f"   ! could not tidy bookmarks: {exc}")
    writer.add_metadata({
        "/Title": doc["title"],
        "/Author": AUTHOR,
        "/Subject": doc["subject"],
        "/Keywords": KEYWORDS,
        "/Creator": "YCT Exam Portal documentation build (HTML + Chrome)",
    })
    try:
        writer.page_mode = "/UseOutlines"
    except Exception:
        pass
    with open(out_pdf, "wb") as fh:
        writer.write(fh)
    return len(reader.pages)


def render_preview(pdf_path: Path, out_dir: Path, dpi: int = 110) -> None:
    import fitz

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("page-*.png"):
        old.unlink()
    with fitz.open(str(pdf_path)) as pdf:
        for index, pg in enumerate(pdf):
            pix = pg.get_pixmap(dpi=dpi)
            pix.save(str(out_dir / f"page-{index + 1:02d}.png"))


def lint_text(pdf_path: Path) -> None:
    import fitz

    placeholders = re.compile(r"\b(TBD|TODO|lorem|ipsum|FIXME|XXX)\b", re.I)
    # The documents describe the system as it works; these words should not appear.
    tone = re.compile(r"\b(bugs?|issues?|limitations?|workarounds?|defects?|gotchas?|"
                      r"known problems?|technical debt)\b", re.I)
    with fitz.open(str(pdf_path)) as pdf:
        for index, pg in enumerate(pdf):
            text = pg.get_text()
            for hit in sorted(set(placeholders.findall(text))):
                print(f"   ! page {index + 1}: found placeholder text '{hit}'")
            for hit in sorted({h.lower() for h in tone.findall(text)}):
                print(f"   ! page {index + 1}: check the wording '{hit}'")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the YCT Exam Portal PDFs")
    parser.add_argument("docs", nargs="*",
                        help="Which documents to build: overview, admin, student (default: all)")
    parser.add_argument("--preview", metavar="DIR", help="Also render every page to PNG under DIR/<doc>/")
    parser.add_argument("--dpi", type=int, default=110, help="Preview resolution (default 110)")
    args = parser.parse_args()

    selected = args.docs or list(DOCS.keys())
    unknown = [d for d in selected if d not in DOCS]
    if unknown:
        parser.error(f"unknown document(s): {', '.join(unknown)} (choose from {', '.join(DOCS)})")

    from playwright.sync_api import sync_playwright

    started = time.time()
    results = []
    with tempfile.TemporaryDirectory(prefix="yct-pdf-") as tmp, sync_playwright() as p:
        workdir = Path(tmp)
        browser = launch_browser(p)
        page = browser.new_page()
        for key in selected:
            doc = DOCS[key]
            print(f"-> {doc['out']}")
            html = prepare_html(doc)
            refs = list(dict.fromkeys(REF_RE.findall(html)))

            pass1 = workdir / f"{key}-pass1.pdf"
            render(page, add_markers(html, refs), pass1, workdir, f"{key}-pass1")
            pages, count1 = find_marker_pages(pass1, refs)
            missing = [r for r in refs if r not in pages]
            if missing:
                print(f"   ! no page found for: {', '.join(missing)}")

            pass2 = workdir / f"{key}-pass2.pdf"
            render(page, fill_toc(html, pages), pass2, workdir, f"{key}-pass2")

            out_pdf = HERE / doc["out"]
            count2 = set_metadata(pass2, out_pdf, doc)
            if count1 != count2:
                print(f"   ! page count changed between passes ({count1} -> {count2}); check the contents page")
            lint_text(out_pdf)
            print(f"   {count2} pages")
            results.append((out_pdf, count2))

            if args.preview:
                render_preview(out_pdf, Path(args.preview) / key, args.dpi)
        browser.close()

    print(f"Done in {time.time() - started:.0f}s")
    for out_pdf, count in results:
        print(f"  {out_pdf}  ({count} pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
