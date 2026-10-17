"""Print an SVG diagram to PNG (2x) and a one-page PDF with Playwright's Chromium.

Needs Node and Playwright (npm i --no-save playwright in frontend/, or NODE_PATH pointing at
a global install). Set CHROME to use a specific Chromium build. If Playwright is missing,
the SVG is still written and the PNG and PDF are skipped with a note.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _tag_pdf(pdf: Path, title: str) -> None:
    """Give the PDF a proper title and author instead of the print engine's defaults."""
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return
    writer = PdfWriter(clone_from=PdfReader(pdf))
    writer.metadata = None
    writer.add_metadata({"/Title": title, "/Author": "Team Pratibimb", "/Creator": "Pratibimb", "/Producer": "Pratibimb"})
    with open(pdf, "wb") as fh:
        writer.write(fh)


def print_svg(svg: str, width: int, height: int, png: Path, pdf: Path, background: str, title: str = "Pratibimb") -> bool:
    tmp = png.with_suffix(".tmp.html")
    tmp.write_text(f"<!doctype html><html><head><meta charset='utf-8'><style>@page {{ size: {width}px {height}px; margin: 0 }} "
                   f"html,body {{ margin:0; background:{background} }}</style></head><body>{svg}</body></html>")
    launch = json.dumps({"executablePath": os.environ["CHROME"]} if os.environ.get("CHROME") else {})
    js = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const b = await chromium.launch({launch});
  const p = await b.newPage({{ viewport: {{ width: {width}, height: {height} }}, deviceScaleFactor: 2 }});
  await p.goto({json.dumps(tmp.as_uri())});
  await p.waitForTimeout(300);
  await p.screenshot({{ path: {json.dumps(str(png))} }});
  await p.pdf({{ path: {json.dumps(str(pdf))}, width: '{width}px', height: '{height}px', printBackground: true, pageRanges: '1' }});
  await b.close();
}})();
"""
    try:
        subprocess.run(["node", "-e", js], cwd=ROOT / "frontend", check=True)
        _tag_pdf(pdf, title)
        return True
    except (OSError, subprocess.CalledProcessError):
        print("Playwright not available: wrote the SVG only")
        return False
    finally:
        tmp.unlink(missing_ok=True)
