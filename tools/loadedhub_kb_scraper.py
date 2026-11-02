"""Scrape the Loaded Help Centre (https://www.loadedhub.com/knowledge-base)
into a self-contained local knowledge base:

    local/LoadedHub_AI_KnowledgeBase/
        markdown_files/*.md      # article body as Markdown
        images/*                 # every referenced image, by original filename
        image_database.csv       # image -> source page / alt / original URL
        _crawl_state.json        # resumable frontier + visited set

Only /knowledge-base* pages are crawled. Image references inside each Markdown
file are rewritten to ../images/<file> so the docs are portable and the images
are "referenced" directly from the article text.

Deps: requests, beautifulsoup4, markdownify
Run:  python tools/loadedhub_kb_scraper.py
"""

import os
import csv
import re
import json
import time
import warnings
import hashlib
import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
from urllib.parse import urljoin, urlparse, unquote
from markdownify import markdownify as md

# lxml is not a dependency; the stdlib HTML parser reads the sitemap fine.
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

# --- Configuration ---------------------------------------------------------

SITEMAP_URL = "https://www.loadedhub.com/sitemap.xml"
START_URLS = [
    "https://www.loadedhub.com/knowledge-base",
]
HOSTS = {"www.loadedhub.com", "loadedhub.com"}
# Everything under this path prefix belongs to the help centre.
KB_PREFIX = "/knowledge-base"

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(_ROOT, "local", "LoadedHub_AI_KnowledgeBase")
MD_DIR = os.path.join(OUTPUT_DIR, "markdown_files")
IMG_DIR = os.path.join(OUTPUT_DIR, "images")
STATE_PATH = os.path.join(OUTPUT_DIR, "_crawl_state.json")
CSV_PATH = os.path.join(OUTPUT_DIR, "image_database.csv")

# Content containers, most specific first. The first that matches wins.
CONTENT_SELECTORS = [
    ".kb-article-richtext",       # support article body
    ".kb-article-body-inner",     # FAQ + lightbulb landing pages
    ".kb-cat-body-section",       # category article listing
    ".academy-tabs-row-wrapper",  # training-academy category
    ".kb-results-section",        # hub card grid
]
# Extra sections appended to the chosen content when present (category pages).
EXTRA_SELECTORS = [".kb-cat-faq-section"]
# Never include these in the Markdown.
DROP_SELECTORS = [
    ".kb-search-index-hidden",  # hidden full-site search index (duplicates every page)
    ".kb-article-back-link",
    ".kb-cta-section",
]

os.makedirs(MD_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; loadedhub-kb-scraper/1.0; +local AI knowledge base)"
})


# --- Helpers ---------------------------------------------------------------

def clean_url(url):
    """Normalise a URL: strip query/fragment, canonical host, drop trailing slash."""
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return None
    host = p.netloc.lower().replace("www.", "")
    if host != "loadedhub.com":
        return None
    path = p.path.rstrip("/") or "/"
    return f"https://www.loadedhub.com{path}"


def in_scope(url):
    c = clean_url(url)
    if not c:
        return False
    path = urlparse(c).path
    # /knowledge-base itself, or any /knowledge-base-* tree.
    return path == KB_PREFIX or path.startswith(KB_PREFIX + "-") or path.startswith(KB_PREFIX + "/")


def slug_for(url):
    path = urlparse(url).path.strip("/")
    slug = path.replace("/", "__") or "index"
    slug = re.sub(r"[^A-Za-z0-9_-]", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-_")
    return (slug or "index")[:150]


def unique_md_path(safe_title, source_url):
    dest = os.path.join(MD_DIR, f"{safe_title}.md")
    if os.path.exists(dest):
        with open(dest, encoding="utf-8") as f:
            if source_url in f.readline():
                return dest
        safe_title = f"{safe_title}_{hashlib.md5(source_url.encode()).hexdigest()[:6]}"
    return os.path.join(MD_DIR, f"{safe_title}.md")


def image_filename(img_url):
    name = unquote(os.path.basename(urlparse(img_url).path)) or "image"
    name = re.sub(r"[^A-Za-z0-9._-]", "-", name)
    if "." not in name:
        name += ".png"
    return name


def pick_content(soup):
    for sel in CONTENT_SELECTORS:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return el, sel
    # Fallback: the <main> element or the whole body.
    return (soup.find("main") or soup.find("body") or soup), "fallback"


# --- Crawl setup (resumable) ----------------------------------------------

def seed_from_sitemap():
    seeded = []
    try:
        r = session.get(SITEMAP_URL, timeout=30)
        r.raise_for_status()
        sitemap = BeautifulSoup(r.content, "html.parser")
        for loc in sitemap.find_all("loc"):
            c = clean_url(loc.get_text(strip=True))
            if c and in_scope(c):
                seeded.append(c)
    except Exception as e:
        print(f"[!] Sitemap unavailable ({e}); falling back to link crawl.", flush=True)
    return seeded


if os.path.exists(STATE_PATH):
    with open(STATE_PATH, encoding="utf-8") as f:
        state = json.load(f)
    visited_urls = set(state.get("visited", []))
    urls_to_visit = state.get("queue", [])
    print(f"Resuming: {len(visited_urls)} visited, {len(urls_to_visit)} queued.")
else:
    visited_urls = set()
    urls_to_visit = []

# Always merge fresh sitemap URLs, so newly published or unlinked pages are
# picked up even on a resumed run.
seeded = 0
for u in seed_from_sitemap() + START_URLS:
    if u not in visited_urls and u not in urls_to_visit:
        urls_to_visit.append(u)
        seeded += 1
print(f"{seeded} new knowledge-base pages queued from the sitemap.")


def save_state():
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump({"visited": sorted(visited_urls), "queue": urls_to_visit}, f, indent=1)


# --- Image DB (resume-safe) -----------------------------------------------

csv_exists = os.path.exists(CSV_PATH)
csv_file = open(CSV_PATH, "a", newline="", encoding="utf-8")
csv_writer = csv.writer(csv_file)
if not csv_exists:
    csv_writer.writerow(["File Name", "Source Page (MD File)", "Alt Text", "Original URL"])

# Map absolute image URL -> local filename (dedupe across pages).
image_names = set(os.listdir(IMG_DIR))
image_by_url = {}


def localise_images(content, page_url, md_name):
    """Download every <img>, rewrite its src to ../images/<file>, return count added."""
    added = 0
    for img in content.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src or src.startswith("data:"):
            continue
        img_url = urljoin(page_url, src).split("#")[0]
        name = image_by_url.get(img_url, image_filename(img_url))
        # Avoid clobbering a different file that shares a basename.
        if name in image_names and img_url not in image_by_url:
            stem, ext = os.path.splitext(name)
            name = f"{stem}_{hashlib.md5(img_url.encode()).hexdigest()[:6]}{ext}"
        image_by_url[img_url] = name

        if name not in image_names:
            try:
                data = session.get(img_url, timeout=30).content
                with open(os.path.join(IMG_DIR, name), "wb") as fh:
                    fh.write(data)
                image_names.add(name)
                added += 1
                csv_writer.writerow([name, md_name, img.get("alt", "No description provided"), img_url])
            except Exception:
                print(f"    [!] image failed: {img_url}", flush=True)
                continue
        img["src"] = f"../images/{name}"
        if img.has_attr("srcset"):
            del img["srcset"]
        if img.has_attr("data-src"):
            del img["data-src"]
    return added


# --- Main loop -------------------------------------------------------------

print("Starting Loaded Help Centre crawl...", flush=True)
done = 0

try:
    while urls_to_visit:
        current_url = urls_to_visit.pop(0)
        if current_url in visited_urls:
            continue
        visited_urls.add(current_url)
        done += 1

        try:
            response = session.get(current_url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            h1 = soup.find("h1")
            title = h1.get_text(strip=True) if h1 else slug_for(current_url)
            dest = unique_md_path(slug_for(current_url), current_url)
            md_name = os.path.basename(dest)

            content, sel = pick_content(soup)
            # Clone-ish: operate on the parsed tree, but only markup the chosen
            # container (plus any extra sections), so nav/footer never leak in.
            for sel_drop in DROP_SELECTORS:
                for el in content.select(sel_drop):
                    el.decompose()
            extra_html = "\n".join(
                str(soup.select_one(s)) for s in EXTRA_SELECTORS if soup.select_one(s)
            )

            added = localise_images(content, current_url, md_name)

            body_md = md(str(content), heading_style="ATX")
            if extra_html:
                body_md += "\n\n" + md(extra_html, heading_style="ATX")

            with open(dest, "w", encoding="utf-8") as f:
                f.write(f"**Source URL:** {current_url}\n\n")
                f.write(f"# {title}\n\n")
                f.write(body_md.strip() + "\n")

            # Follow in-scope links (catches pages missing from the sitemap).
            for link in soup.find_all("a"):
                href = link.get("href")
                if not href:
                    continue
                full = clean_url(urljoin(current_url, href))
                if full and in_scope(full) and full not in visited_urls and full not in urls_to_visit:
                    urls_to_visit.append(full)

            print(f"[{done}] {md_name}  (content={sel}, +{added} images, queue={len(urls_to_visit)})", flush=True)

            if done % 20 == 0:
                save_state()
                csv_file.flush()

            time.sleep(0.25)

        except Exception as e:
            print(f"[!] Error scraping {current_url}: {e}", flush=True)

finally:
    save_state()
    csv_file.flush()
    csv_file.close()

print(f"\nCrawl complete: {len(visited_urls)} pages, {len(image_names)} images in '{OUTPUT_DIR}'.", flush=True)
