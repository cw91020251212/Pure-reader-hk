#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
weekendhk_image_grabber.py
==========================
抽取「新假期 WeekendHK」(及同類 WordPress + 圖片 CDN 網站) 文章內所有【原圖】。

核心原理 (經實測驗證)：
  1. 真圖不在 <img src>，而在 <picture><source srcset> 裡。src 只放 default.jpg 佔位圖。
  2. imgs.weekendhk.com 的網址帶「寬度前綴」，例如 /322x/ 、/644x/ 、/147x/。
     ── 刪掉該前綴 = 取得未縮放版本。
  3. 檔名尾帶 WordPress 尺寸後綴，例如 -975x630 、-1024x768 。
     ── 刪掉該後綴 = 取得真正原圖 (實測 1024x768 -> 2048x1536)。
  4. 尾綴 .webp / ?v=1 需一併清掉才能命中原檔。

不需要 headless browser、不需要 Jina、不會被 lazy-load 影響。
"""

import argparse
import concurrent.futures as cf
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# ---- 規則 1：CDN 寬度前綴，如 https://imgs.weekendhk.com/322x/wp-content/...
RE_WIDTH_PREFIX = re.compile(r"(https?://[^/]+/)\d+x/")
# ---- 規則 2：WordPress 尺寸後綴，如 -975x630.png
#      注意必須要求前面有 "-"，否則會誤傷 ww_logo350x100.png 這類本身含尺寸的檔名
RE_WP_SIZE = re.compile(r"-\d{2,5}x\d{2,5}(?=\.[A-Za-z0-9]{2,5}$)")

# ---- 站台裝飾圖 (logo / app icon / UI) 特徵，非文章內容
CHROME = re.compile(
    r"(/themes?/|/theme-content/|/voting/|/plugins?/|"
    r"logo|icon|appstore|googlplay|google-?play|badge|sprite|"
    r"arrow|pointer|menu_|nav_|striped|ad_bg|searchbar|search_bg|"
    r"avatar|_btn|button|banner_bg|\b\d{1,3}x\d{1,3}\.png$)", re.I)
# ---- 佔位圖特徵
PLACEHOLDER = re.compile(r"(default\.jpg|placeholder|blank\.gif|data:image|lazy\.png|1x1\.)", re.I)

IMG_EXT = re.compile(r"\.(jpe?g|png|webp|gif|bmp|avif)$", re.I)


def http_get(url, referer=None, timeout=40):
    headers = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), dict(r.headers)


def strip_query(u):
    """移除 ?v=1 之類 cache-buster。"""
    return u.split("?")[0].split("#")[0]


def to_original(url):
    """把任何縮圖網址還原成原圖網址。回傳候選清單 (由最原始排到最縮細)。"""
    u = strip_query(url)
    cands = []

    # 去掉 CDN 加上的 .webp 轉檔尾 (xxx.png.webp -> xxx.png)
    unwebp = re.sub(r"\.(jpe?g|png)\.webp$", r".\1", u, flags=re.I)

    for variant in dict.fromkeys([unwebp, u]):
        no_prefix = RE_WIDTH_PREFIX.sub(r"\1", variant)      # 規則 1
        no_size = RE_WP_SIZE.sub("", no_prefix)              # 規則 2
        for c in (no_size, no_prefix, variant):
            if c not in cands:
                cands.append(c)
    return cands


def scope_to_article(html):
    """只保留 <article>…</article> 區塊，剔除 header / footer / 側欄 / 推薦位。
    找不到就回傳原文。"""
    m = re.search(r"<article\b[^>]*>", html, re.I)
    if not m:
        return html, False
    start = m.end()
    # 由 start 起做 <article> 標籤配對，取對應的收尾
    depth, pos = 1, start
    tag = re.compile(r"</?article\b", re.I)
    while depth > 0:
        t = tag.search(html, pos)
        if not t:
            break
        depth += -1 if t.group(0).lower().startswith("</") else 1
        pos = t.end()
    return html[start:pos], True


def harvest_urls(html, page_url, article_only=True):
    """從 HTML 撈出所有圖片候選網址：src / srcset / data-* / <source> / og:image。"""
    if article_only:
        scoped, ok = scope_to_article(html)
        if ok and len(scoped) > 500:
            html = scoped
    found = []

    # srcset 可含多個 "url 2x, url 1x"
    for m in re.finditer(r'(?:data-)?srcset\s*=\s*["\']([^"\']+)["\']', html, re.I):
        for part in m.group(1).split(","):
            cand = part.strip().split()[0] if part.strip() else ""
            if cand:
                found.append(cand)

    attrs = ("src", "data-src", "data-original", "data-actualsrc", "data-lazy-src",
             "data-lazyload-src", "data-image", "data-url", "content")
    for a in attrs:
        for m in re.finditer(r'%s\s*=\s*["\']([^"\']+)["\']' % re.escape(a), html, re.I):
            found.append(m.group(1).strip())

    # 兜底：整頁正則掃圖片連結 (抓 inline JS / JSON-LD 內的圖)
    for m in re.finditer(r'https?://[^\s"\'<>\\]+?\.(?:jpe?g|png|webp|avif)', html, re.I):
        found.append(m.group(0))

    out = []
    for u in found:
        if not u or u.startswith("data:"):
            continue
        u = urllib.parse.urljoin(page_url, u.replace("\\/", "/"))
        if not u.startswith("http"):
            continue
        if PLACEHOLDER.search(u):
            continue
        if not IMG_EXT.search(strip_query(u)):
            continue
        if CHROME.search(strip_query(u)):
            continue
        out.append(u)
    return list(dict.fromkeys(out))


def probe_and_pick(cands, referer, min_bytes):
    """依序試候選網址，回傳第一個成功且最大的。"""
    best = None
    for c in cands:
        try:
            data, hdrs = http_get(c, referer=referer)
        except Exception:
            continue
        if len(data) < min_bytes:
            continue
        dims = None
        try:
            from PIL import Image
            dims = Image.open(io.BytesIO(data)).size
        except Exception:
            pass
        best = (c, data, dims)
        break  # 候選已按「最原始優先」排序
    return best


def safe_name(url, data, idx):
    base = os.path.basename(strip_query(url)) or "image"
    base = re.sub(r"[^\w.\-]", "_", base)[:90]
    h = hashlib.md5(data).hexdigest()[:8]
    root, ext = os.path.splitext(base)
    if not ext:
        ext = ".jpg"
    return f"{idx:03d}_{root}_{h}{ext}"


def main():
    ap = argparse.ArgumentParser(description="抽取 WeekendHK 文章所有原圖")
    ap.add_argument("url", help="文章網址")
    ap.add_argument("-o", "--outdir", default="weekendhk_images")
    ap.add_argument("--min-bytes", type=int, default=8000, help="細於此位元組視為 icon/佔位，跳過")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--all", action="store_true",
                    help="連站台 logo/UI 圖一齊抓 (預設只抓 <article> 內的內容圖)")
    args = ap.parse_args()

    print(f"[1/4] 下載頁面 HTML …")
    html, _ = http_get(args.url, referer="https://www.weekendhk.com/")
    html = html.decode("utf-8", "ignore")
    print(f"      HTML {len(html):,} bytes  |  <picture>={html.count('<picture')}  "
          f"<source>={html.count('<source')}  default.jpg={html.count('default.jpg')}")

    print(f"[2/4] 解析圖片網址 …")
    raw = harvest_urls(html, args.url, article_only=not args.all)
    print(f"      抓到 {len(raw)} 個候選縮圖網址"
          f"{'' if args.all else '  (已限定 <article> 內容區)'}")

    # 用「還原後的原圖網址」做去重，避免同一張圖多個尺寸重複下載
    groups = {}
    for u in raw:
        cands = to_original(u)
        groups.setdefault(cands[0], cands)
    print(f"      去重後 {len(groups)} 張唯一圖片")

    os.makedirs(args.outdir, exist_ok=True)

    print(f"[3/4] 下載原圖 (並行 {args.workers}) …")
    results = []

    def work(item):
        key, cands = item
        return key, probe_and_pick(cands, args.url, args.min_bytes)

    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        for key, got in ex.map(work, groups.items()):
            results.append((key, got))

    saved, skipped = [], []
    idx = 0
    seen_hash = set()
    for key, got in sorted(results, key=lambda x: x[0]):
        if not got:
            skipped.append(key)
            continue
        url, data, dims = got
        h = hashlib.md5(data).hexdigest()
        if h in seen_hash:
            continue
        seen_hash.add(h)
        idx += 1
        fn = safe_name(url, data, idx)
        with open(os.path.join(args.outdir, fn), "wb") as f:
            f.write(data)
        saved.append({"file": fn, "url": url, "bytes": len(data),
                      "dims": f"{dims[0]}x{dims[1]}" if dims else "?"})

    with open(os.path.join(args.outdir, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"page": args.url, "saved": saved, "failed": skipped},
                  f, ensure_ascii=False, indent=2)

    print(f"[4/4] 完成 ✔")
    print(f"      成功 {len(saved)} 張 / 失敗 {len(skipped)} 個 -> {args.outdir}/")
    total = sum(s["bytes"] for s in saved)
    print(f"      總大小 {total/1048576:.2f} MB")
    for s in saved[:100]:
        print(f"        {s['file']:<58} {s['dims']:>11}  {s['bytes']/1024:8.1f} KB")


if __name__ == "__main__":
    sys.exit(main())
