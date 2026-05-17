#!/usr/bin/env python3
"""extract_content.py — turn an article HTML into a structured Markdown source.

Pulls page title, meta description, headings, paragraphs, lists, tables, and
images out of the article HTML and renders them as Markdown that an LLM can
consume as a translation source. Image URLs are absolutized against a
provided base URL so the downstream translation keeps the original images
even when the source HTML used relative paths.

CLI:
    python scripts/extract_content.py <input.html> [-o OUT] [--base-url <article-url>]

Library:
    from scripts.extract_content import extract_content
    md = extract_content(html, base_url="https://www.gtn.co.jp/magazine/ja/article177/")
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag


# Main content container candidates, tried in order. The first match wins.
MAIN_CONTENT_SELECTORS: tuple[dict, ...] = (
    {"name": "div", "class_": "article_body_left"},        # GTN Magazine
    {"name": "div", "class_": "ContentEditor_gtn_monely"}, # GTN Magazine inner
    {"name": "div", "class_": "ContentEditor"},
    {"name": "article"},
    {"name": "main"},
    {"name": "div", "class_": "article-body"},
    {"name": "div", "class_": "post-content"},
    {"name": "div", "class_": "entry-content"},
)

SKIP_TAGS: frozenset[str] = frozenset(
    {"script", "style", "noscript", "nav", "header", "footer",
     "aside", "form", "iframe", "svg", "button"}
)


def _extract_meta(soup: BeautifulSoup) -> tuple[str, str]:
    title = ""
    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(strip=True)

    meta_desc = ""
    for attrs in ({"name": "description"}, {"property": "og:description"}):
        md = soup.find("meta", attrs=attrs)
        if md and md.get("content"):
            meta_desc = md["content"].strip()
            break

    return title, meta_desc


def _find_main_content(soup: BeautifulSoup) -> Tag:
    for sel in MAIN_CONTENT_SELECTORS:
        found = soup.find(**sel)
        if found:
            return found
    return soup.body or soup


def _get_inline_text(node: Tag) -> str:
    parts: list[str] = []
    for child in node.descendants:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif isinstance(child, Tag) and child.name == "br":
            parts.append("\n")
    text = "".join(parts)
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(line for line in lines if line.strip()).strip()


def _absolutize(src: str, base_url: str | None) -> str:
    """Return an absolute URL if `base_url` is given and `src` is relative."""
    if not src or not base_url:
        return src
    if src.startswith(("http://", "https://", "data:", "mailto:")):
        return src
    return urljoin(base_url, src)


def _render_image(node: Tag, base_url: str | None) -> str:
    src = (node.get("src") or "").strip()
    alt = (node.get("alt") or "").strip()
    if not src or src.startswith("data:"):
        return ""
    abs_src = _absolutize(src, base_url)
    return f"\n![{alt}]({abs_src})\n"


def _render_list(node: Tag, ordered: bool) -> str:
    lines: list[str] = ["\n"]
    items = node.find_all("li", recursive=False)
    for i, li in enumerate(items, 1):
        text = _get_inline_text(li)
        if not text:
            continue
        prefix = f"{i}. " if ordered else "- "
        text = text.replace("\n", " / ")
        lines.append(f"{prefix}{text}")
    lines.append("")
    return "\n".join(lines)


def _render_table(table: Tag) -> str:
    out: list[str] = []
    thead = table.find("thead")
    headers: list[str] = []
    body_rows_source: list[Tag] = []

    if thead:
        for r in thead.find_all("tr"):
            for cell in r.find_all(["th", "td"]):
                headers.append(_get_inline_text(cell) or " ")
        tbody = table.find("tbody")
        body_rows_source = tbody.find_all("tr") if tbody else table.find_all("tr")
        if not tbody:
            body_rows_source = [r for r in body_rows_source if r.parent != thead]
    else:
        all_rows = table.find_all("tr")
        if not all_rows:
            return ""
        first = all_rows[0]
        if first.find("th") and not first.find("td"):
            headers = [_get_inline_text(c) or " " for c in first.find_all(["th", "td"])]
            body_rows_source = all_rows[1:]
        else:
            body_rows_source = all_rows

    body_rows: list[list[str]] = []
    for r in body_rows_source:
        cells = [_get_inline_text(c) or " " for c in r.find_all(["th", "td"])]
        if cells:
            body_rows.append(cells)

    if not body_rows and not headers:
        return ""

    col_count = max([len(headers)] + [len(r) for r in body_rows] or [1])

    if not headers:
        headers = [" "] * col_count
    while len(headers) < col_count:
        headers.append(" ")

    out.append("\n| " + " | ".join(headers) + " |")
    out.append("| " + " | ".join(["---"] * col_count) + " |")
    for row in body_rows:
        while len(row) < col_count:
            row.append(" ")
        out.append("| " + " | ".join(row[:col_count]) + " |")
    out.append("")
    return "\n".join(out)


def _render_node(node, base_url: str | None) -> list[str]:
    out: list[str] = []

    if isinstance(node, NavigableString):
        text = str(node).strip()
        return [text] if text else []

    if not isinstance(node, Tag):
        return []

    name = (node.name or "").lower()

    if name in SKIP_TAGS:
        return []

    if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        text = _get_inline_text(node)
        if text:
            level = int(name[1])
            out.append(f"\n{'#' * level} {text}\n")
        return out

    if name == "p":
        imgs = node.find_all("img", recursive=False)
        text = _get_inline_text(node)
        if text:
            out.append(f"\n{text}\n")
        for img in imgs:
            md = _render_image(img, base_url)
            if md:
                out.append(md)
        return out

    if name == "img":
        md = _render_image(node, base_url)
        if md:
            out.append(md)
        return out

    if name == "figure":
        img = node.find("img")
        if img:
            md = _render_image(img, base_url)
            if md:
                out.append(md)
        caption = node.find("figcaption")
        if caption:
            cap = _get_inline_text(caption)
            if cap:
                out.append(f"\n*{cap}*\n")
        return out

    if name == "ul":
        out.append(_render_list(node, ordered=False))
        return out

    if name == "ol":
        out.append(_render_list(node, ordered=True))
        return out

    if name == "table":
        out.append(_render_table(node))
        return out

    if name == "blockquote":
        text = _get_inline_text(node)
        if text:
            out.append(f"\n> {text}\n")
        return out

    if name == "hr":
        out.append("\n---\n")
        return out

    if name == "br":
        return []

    for child in node.children:
        out.extend(_render_node(child, base_url))
    return out


def _normalize_output(parts: list[str]) -> str:
    text = "".join(parts)
    lines = text.splitlines()
    cleaned: list[str] = []
    blank_count = 0
    for line in lines:
        if line.strip() == "":
            blank_count += 1
            if blank_count <= 1:
                cleaned.append("")
        else:
            blank_count = 0
            cleaned.append(line)
    return "\n".join(cleaned).strip() + "\n"


def extract_content(html: str, *, base_url: str | None = None) -> str:
    """Parse `html` and return a structured Markdown source.

    `base_url` is used to absolutize relative image URLs and links. When not
    provided, relative URLs are emitted as-is (caller should set base_url to
    avoid broken images in the downstream translation).
    """
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:  # noqa: BLE001 — fall through to stdlib parser
        soup = BeautifulSoup(html, "html.parser")

    title, meta_desc = _extract_meta(soup)
    body = _find_main_content(soup)

    parts: list[str] = []
    parts.append("# === Page Title ===\n\n")
    parts.append(f"{title}\n\n")
    if meta_desc:
        parts.append("# === Meta Description ===\n\n")
        parts.append(f"{meta_desc}\n\n")
    parts.append("# === Article Body ===\n")

    parts.extend(_render_node(body, base_url))
    return _normalize_output(parts)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract translation source Markdown from an article HTML.",
    )
    parser.add_argument("input", help="Input HTML file path (or `-` for stdin)")
    parser.add_argument("--output", "-o", help="Output file path (else stdout)")
    parser.add_argument(
        "--base-url",
        help="Article URL — used to absolutize relative image/link URLs",
    )
    args = parser.parse_args()

    if args.input == "-":
        html = sys.stdin.read()
    else:
        path = Path(args.input)
        if not path.exists():
            print(f"ERROR: file not found: {args.input}", file=sys.stderr)
            return 1
        html = path.read_text(encoding="utf-8")

    md = extract_content(html, base_url=args.base_url)

    if args.output:
        Path(args.output).write_text(md, encoding="utf-8")
        print(f"OK: extracted {len(md):,} chars to {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
