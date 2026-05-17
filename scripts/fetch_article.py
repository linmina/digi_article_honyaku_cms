#!/usr/bin/env python3
"""fetch_article.py — fetch a Japanese article HTML with a browser-like UA.

Some sites (e.g. GTN Magazine) redirect plain requests to the homepage as a
bot mitigation. We send realistic browser headers and warm up the session by
hitting the homepage first.

CLI:
    python scripts/fetch_article.py <URL> [-o OUT]

Library:
    from scripts.fetch_article import fetch_article
    html = fetch_article("https://www.gtn.co.jp/magazine/ja/article177/")
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from urllib.parse import urlparse

import requests


# Real Chrome / Safari / Firefox / Edge UAs to rotate through.
USER_AGENTS: tuple[str, ...] = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) "
    "Gecko/20100101 Firefox/131.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
)


def _build_headers(url: str, ua: str) -> dict[str, str]:
    parsed = urlparse(url)
    is_chrome_like = "Chrome" in ua or "Edg" in ua

    headers: dict[str, str] = {
        "User-Agent": ua,
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8,"
            "application/signed-exchange;v=b3;q=0.7"
        ),
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
        "DNT": "1",
    }
    if is_chrome_like:
        headers.update(
            {
                "Sec-Ch-Ua": (
                    '"Chromium";v="131", "Not_A Brand";v="24", '
                    '"Google Chrome";v="131"'
                ),
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"macOS"',
            }
        )
    return headers


def fetch_article(
    url: str,
    *,
    timeout: int = 30,
    warm_up: bool = True,
) -> str:
    """Fetch HTML for `url` with a browser-like session.

    Returns the response body as decoded text. Raises `requests.RequestException`
    on HTTP failure and `ValueError` for unsupported schemes.
    """
    parsed = urlparse(url)
    if not parsed.scheme.startswith("http"):
        raise ValueError(f"Invalid URL (scheme must be http/https): {url}")

    ua = random.choice(USER_AGENTS)  # noqa: S311 — not security-sensitive
    session = requests.Session()
    session.headers.update(_build_headers(url, ua))

    if warm_up:
        homepage = f"{parsed.scheme}://{parsed.netloc}/"
        if homepage != url:
            try:
                session.get(homepage, timeout=timeout, allow_redirects=True)
                time.sleep(random.uniform(0.4, 1.2))  # noqa: S311
            except requests.RequestException as e:
                print(f"WARN: homepage warm-up failed: {e}", file=sys.stderr)

    article_headers = dict(session.headers)
    article_headers["Sec-Fetch-Site"] = "same-origin"
    article_headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"

    response = session.get(
        url,
        headers=article_headers,
        timeout=timeout,
        allow_redirects=True,
    )
    response.raise_for_status()

    final_path = urlparse(response.url).path.rstrip("/")
    requested_path = parsed.path.rstrip("/")
    if final_path != requested_path:
        print(
            f"WARN: redirected from {url} -> {response.url}\n"
            f"      Bot mitigation may have intercepted the request.",
            file=sys.stderr,
        )

    if response.encoding and response.encoding.lower() == "iso-8859-1":
        response.encoding = response.apparent_encoding or "utf-8"

    return response.text


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch a Japanese article HTML with a browser-like UA."
    )
    parser.add_argument("url", help="Article URL to fetch")
    parser.add_argument("--output", "-o", help="Output file path (else stdout)")
    parser.add_argument(
        "--timeout", type=int, default=30, help="Request timeout (default 30)"
    )
    parser.add_argument(
        "--no-warm-up",
        action="store_true",
        help="Skip homepage warm-up GET",
    )
    args = parser.parse_args()

    try:
        html = fetch_article(
            args.url,
            timeout=args.timeout,
            warm_up=not args.no_warm_up,
        )
    except requests.RequestException as e:
        print(f"ERROR: fetch failed: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"OK: saved {len(html):,} chars to {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(html)
    return 0


if __name__ == "__main__":
    sys.exit(main())
