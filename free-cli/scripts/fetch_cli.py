#!/usr/bin/env python3
"""free-cli 실시간 프로브 — 표준 라이브러리만 사용.

GitHub Releases API · npm registry · OpenCode Zen 모델 목록을 읽어
free-cli/data.json 의 probes[].fallback 값을 최신 관측치로 갱신한다.
실패한 프로브는 기존 값(스냅샷)을 그대로 두고 상태만 남긴다.

사용:
    python3 free-cli/scripts/fetch_cli.py            # 갱신 + 저장
    python3 free-cli/scripts/fetch_cli.py --dry-run  # 출력만
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data.json"
KST = timezone(timedelta(hours=9))
UA = "buriburiyj-site-probe/1.0 (+https://buriburiyj.github.io/free-cli/)"
TIMEOUT = 20
QWEN_TAG = re.compile(r"^v\d+\.\d+\.\d+$")


def get_json(url: str):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8"))


def probe_github(repo: str):
    if repo == "QwenLM/qwen-code":
        rels = get_json(f"https://api.github.com/repos/{repo}/releases?per_page=10")
        for r in rels:
            if QWEN_TAG.match(r.get("tag_name", "")):
                return r["tag_name"], r.get("published_at")
        raise ValueError("semver 릴리즈 없음")
    j = get_json(f"https://api.github.com/repos/{repo}/releases/latest")
    return j.get("tag_name"), j.get("published_at")


def probe_npm(pkg: str):
    j = get_json(f"https://registry.npmjs.org/{pkg}/latest")
    return "v" + str(j.get("version")), None


def probe_zen(url: str):
    j = get_json(url)
    models = j.get("data") or []
    free = [
        m for m in models
        if (m.get("cost") or {}).get("text", {}).get("input", {}).get("price") == 0
        and (m.get("cost") or {}).get("text", {}).get("output", {}).get("price") == 0
    ]
    return f"{len(free)} / {len(models)} 무료", None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    probes = data.get("probes") or []
    changed = 0

    def norm(v):
        return str(v or "").lstrip("vV").strip()

    for p in probes:
        kind = p.get("kind")
        old = (p.get("fallback") or {}).get("tag")
        try:
            if kind == "gh":
                tag, at = probe_github(p["repo"])
            elif kind == "npm":
                tag, at = probe_npm(p["pkg"])
            elif kind == "zen":
                tag, at = probe_zen(p["url"])
            else:
                print(f"  ? {p.get('label')}: 알 수 없는 kind={kind}")
                continue
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as exc:
            print(f"  ! {p.get('label')}: 실패 ({exc}) — 스냅샷 유지")
            continue

        mark = "" if norm(tag) == norm(old) else "  (변경)"
        if norm(tag) != norm(old):
            changed += 1
        print(f"  · {p.get('label')}: {old} -> {tag}{mark}")
        p["fallback"] = {"tag": tag, "at": at}

    now = datetime.now(timezone.utc)
    data["probes"] = probes
    data["generated_utc"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    data["generated_kst"] = now.astimezone(KST).strftime("%Y-%m-%d %H:%M KST")
    data["generated_by"] = "free-cli/scripts/fetch_cli.py"

    if args.dry_run:
        print(f"dry-run: {changed}건 변경 예정")
        return 0

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"저장 완료 · 변경 {changed}건 · {data['generated_kst']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
