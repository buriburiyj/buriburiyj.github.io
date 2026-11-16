#!/usr/bin/env python3
"""free-deals 매일 갱신 — 표준 라이브러리만 사용.

하는 일
1) 각 혜택의 출처 URL을 실제로 열어 HTTP 상태와 최종 주소를 기록한다(liveness).
   → 링크가 죽었거나 다른 페이지로 튕기면 '확인 필요'로 드러난다.
2) 마감일이 지난 항목을 자동으로 tier=ended 로 내린다(공식 공지 없이도 안전하게).
3) free-ai/data.json 요약을 함께 받아 상단 숫자용 스냅샷을 남긴다.
4) generated_utc / generated_kst 갱신.

사용:
    python3 free-deals/scripts/fetch_deals.py
    python3 free-deals/scripts/fetch_deals.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "data.json"
ROOT = HERE.parent
FREE_AI = ROOT / "free-ai" / "data.json"
KST = timezone(timedelta(hours=9))
UA = "Mozilla/5.0 (compatible; buriburiyj-deals-check/1.0; +https://buriburiyj.github.io/free-deals/)"
TIMEOUT = 25


def head_ok(url: str, timeout: int = TIMEOUT) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return {"status": res.status, "final_url": res.geturl()}
    except urllib.error.HTTPError as exc:
        return {"status": exc.code, "final_url": url, "error": f"HTTP {exc.code}"}
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        return {"status": 0, "final_url": url, "error": str(exc)[:80]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    today = datetime.now(KST).date()
    now = datetime.now(timezone.utc)
    deals = data.get("deals") or []

    problems = 0
    expired = 0
    for d in deals:
        # 1) 링크 생존 확인 (첫 번째 출처만 — 트래픽 최소화)
        src = (d.get("src") or [{}])[0]
        url = src.get("url")
        if url:
            res = head_ok(url)
            d["liveness"] = {"status": res.get("status"), "checked": today.isoformat()}
            if res.get("status") != 200:
                problems += 1
                print(f"  ! {d['id']}: {res.get('status')} {url}")
            elif res.get("final_url") != url:
                print(f"  ~ {d['id']}: 리다이렉트 -> {res.get('final_url')}")
                d["liveness"]["final_url"] = res.get("final_url")

        # 2) 마감 지난 항목은 ended 로 (이미 ended면 그대로)
        dl = d.get("deadline")
        if dl and d.get("tier") != "ended":
            try:
                if date.fromisoformat(dl) < today:
                    d["tier"] = "ended"
                    d["auto_ended"] = True
                    expired += 1
                    print(f"  > {d['id']}: 마감({dl}) 지남 -> ended")
            except ValueError:
                pass

    # 3) free-ai 요약 스냅샷
    if FREE_AI.exists():
        try:
            ai = json.loads(FREE_AI.read_text(encoding="utf-8"))
            data["free_ai_snapshot"] = {
                "generated_kst": ai.get("generated_kst"),
                "totals": ai.get("totals"),
            }
        except json.JSONDecodeError:
            print("  ! free-ai/data.json 파싱 실패")

    data["deals"] = deals
    data["totals"] = {
        "deals": len(deals),
        "now": sum(1 for d in deals if d.get("tier") == "now"),
        "verify": sum(1 for d in deals if d.get("tier") == "verify"),
        "caution": sum(1 for d in deals if d.get("tier") == "caution"),
        "ended": sum(1 for d in deals if d.get("tier") == "ended"),
    }
    data["generated_utc"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    data["generated_kst"] = now.astimezone(KST).strftime("%Y-%m-%d %H:%M KST")
    data["generated_by"] = "free-deals/scripts/fetch_deals.py"

    print(f"링크 문제 {problems}건 · 마감 처리 {expired}건 · {data['totals']}")
    if args.dry_run:
        print("dry-run: 저장하지 않음")
        return 0

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"저장 완료 · {data['generated_kst']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
