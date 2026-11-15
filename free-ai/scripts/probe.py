#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
free-ai 실시간 프로브 (표준 라이브러리만 사용)

- 공개 카탈로그 API를 실제로 호출해 "지금 이 순간" 무료 모델 목록/컨텍스트/모달리티를 수집한다.
- 키 없이 호출 가능한 엔드포인트는 실제 chat/completions 요청으로 200 여부와 응답 시간(ms)을 잰다.
- 키가 필요한 곳은 인증 없이 찔러 HTTP 상태만 기록한다(추정 금지, 측정값만).
- 결과는 free-ai/data.json 하나로 합쳐진다. index.html은 이 파일만 읽으면 된다.

사용:
    python3 free-ai/scripts/probe.py            # data.json 생성/덮어쓰기
    python3 free-ai/scripts/probe.py --stdout   # 파일 대신 표준출력으로

환경변수(선택): OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY,
ROUTEWAY_API_KEY, ZAI_API_KEY, COHERE_API_KEY, MISTRAL_API_KEY ... 가 있으면
해당 제공사 호출에 Bearer 토큰을 붙여 실제 응답까지 측정한다. 없으면 키 없이 측정.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # free-ai/
OUT = os.path.join(ROOT, "data.json")
META = os.path.join(HERE, "providers.json")

ORIGIN = "https://buriburiyj.github.io"
UA = ("Mozilla/5.0 (compatible; free-ai-probe/3.0; +https://buriburiyj.github.io/free-ai/) "
      "Python/" + ".".join(map(str, sys.version_info[:3])))
TIMEOUT = 30

# --------------------------------------------------------------------------- http


def http(url, method="GET", payload=None, headers=None, timeout=TIMEOUT):
    """단일 요청. 예외도 결과 dict로 돌려준다(프로브 전체가 죽지 않도록)."""
    hdrs = {"User-Agent": UA, "Accept": "application/json", "Origin": ORIGIN}
    if headers:
        hdrs.update(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            ms = int(round((time.perf_counter() - t0) * 1000))
            return {
                "ok": True, "status": resp.status, "ms": ms,
                "json": _loads(body), "text": _text(body),
                "cors": _cors(resp.headers), "error": None,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        ms = int(round((time.perf_counter() - t0) * 1000))
        return {
            "ok": False, "status": exc.code, "ms": ms,
            "json": _loads(body), "text": _text(body),
            "cors": _cors(exc.headers), "error": None,
        }
    except Exception as exc:  # URLError, timeout, ssl ...
        ms = int(round((time.perf_counter() - t0) * 1000))
        return {
            "ok": False, "status": 0, "ms": ms, "json": None,
            "text": "", "cors": None, "error": "%s: %s" % (type(exc).__name__, exc),
        }


def _loads(body):
    try:
        return json.loads(body.decode("utf-8", "replace"))
    except Exception:
        return None


def _text(body):
    try:
        return body[:400].decode("utf-8", "replace")
    except Exception:
        return ""


def _cors(headers):
    if headers is None:
        return None
    value = headers.get("Access-Control-Allow-Origin")
    if not value:
        return None
    return value


# --------------------------------------------------------------------- model helpers

CODING_RE = re.compile(
    r"(cod(er|ing|estral)|swe|devstral|codex|kimi-k2.*code|qwen.*coder|"
    r"north-mini-code|sonnet|gpt-oss|deepseek-v4|deepseek-v3|qwen3?\.\d|codestral)",
    re.I,
)
REASON_RE = re.compile(
    r"(reason|thinking|think|r1\b|nemotron|gpt-oss|glm|kimi-k2|minimax|"
    r"deepseek-v4|ernie|ling|qwen3\.\d|qwq)",
    re.I,
)
VISION_HINT_RE = re.compile(r"(vl|vision|4\.6v|omni|image)", re.I)


def guess_tags(model_id, name, input_mods, supported_params=None):
    """모델명 기반 분류는 '추정'이다. UI에서도 추정이라고 표기한다."""
    blob = "%s %s" % (model_id, name or "")
    tags = []
    if CODING_RE.search(blob):
        tags.append("코딩")
    if REASON_RE.search(blob) or (supported_params and "reasoning" in supported_params):
        tags.append("추론")
    if ("image" in (input_mods or [])) or VISION_HINT_RE.search(blob):
        tags.append("비전")
    return tags


def int_or_none(value):
    try:
        if value is None:
            return None
        ivalue = int(value)
        return ivalue if ivalue > 0 else None
    except (TypeError, ValueError):
        return None


def model(pid, pname, mid, name=None, ctx=None, in_mods=None, out_mods=None,
          tier="free", keyless=False, note="", free=True, latency_ms=None,
          params=None):
    in_mods = in_mods or ["text"]
    return {
        "p": pid,
        "pn": pname,
        "id": mid,
        "name": name or mid,
        "ctx": ctx,
        "in": in_mods,
        "out": out_mods or ["text"],
        "tier": tier,
        "keyless": keyless,
        "free": free,
        "tags": guess_tags(mid, name, in_mods, params),
        "note": note,
        "latency_ms": latency_ms,
    }


def is_zero(value):
    try:
        return float(value) == 0.0
    except (TypeError, ValueError):
        return False


# ------------------------------------------------------------------ catalog parsers


def parse_openrouter_like(payload, pid, pname, tier, keyless):
    """
    OpenRouter / Kilo AI Gateway / Routeway 공통 카탈로그(모양이 같다).
    pricing.prompt == pricing.completion == '0' 인 것만 무료로 본다.
    """
    out = []
    rows = payload.get("data") if isinstance(payload, dict) else payload
    for row in rows or []:
        pricing = row.get("pricing") or {}
        free = is_zero(pricing.get("prompt")) and is_zero(pricing.get("completion"))
        if not free:
            continue
        arch = row.get("architecture") or {}
        in_mods = arch.get("input_modalities") or _mods_from_string(arch.get("modality"))
        out.append(model(
            pid, pname, row.get("id"), row.get("name"),
            ctx=int_or_none(row.get("context_length") or
                            (row.get("top_provider") or {}).get("context_length")),
            in_mods=in_mods,
            out_mods=arch.get("output_modalities") or ["text"],
            tier=tier, keyless=keyless,
            note=_price_note(pricing),
            params=row.get("supported_parameters"),
        ))
    return out


def _mods_from_string(modality):
    if not modality or "->" not in modality:
        return ["text"]
    left = modality.split("->")[0]
    mods = [m.strip() for m in left.split("+") if m.strip()]
    return mods or ["text"]


def _price_note(pricing):
    ctx_free = pricing.get("prompt")
    if ctx_free in ("0", 0):
        return "$0"
    return ""


def parse_routeway(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        pricing = row.get("pricing") or {}
        inp = ((pricing.get("input") or {}).get("price_per_million_t"))
        outp = ((pricing.get("output") or {}).get("price_per_million_t"))
        free = is_zero(inp) and is_zero(outp)
        if not free and not str(row.get("id", "")).endswith(":free"):
            continue
        out.append(model(
            pid, pname, row.get("id"), row.get("name"),
            ctx=int_or_none(row.get("context_length")),
            tier=tier, keyless=keyless,
            note=":free",
        ))
    return out


def _ovh_kind(mid):
    low = mid.lower()
    if low.startswith("nvr-tts") or "tts" in low:
        return ["text"], ["audio"]
    if "whisper" in low or "asr" in low:
        return ["audio"], ["text"]
    if "stable-diffusion" in low or "flux" in low or "sdxl" in low:
        return ["text"], ["image"]
    if "embedding" in low or low.startswith("bge") or "embed" in low:
        return ["text"], ["embedding"]
    if "guard" in low:
        return ["text"], ["text"]
    return ["text"], ["text"]


def parse_ovh(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        mid = row.get("id") or ""
        in_mods, out_mods = _ovh_kind(mid)
        priced = not is_zero((row.get("pricing") or {}).get("prompt"))
        out.append(model(
            pid, pname, mid, None,
            ctx=int_or_none(row.get("context_length")),
            in_mods=in_mods, out_mods=out_mods,
            tier=tier, keyless=keyless,
            note="익명 2 RPM · 무료 키로 상향" if not priced else "익명 호출 200 실측",
        ))
    return out


def parse_pollinations(payload, pid, pname, tier, keyless):
    out = []
    for row in payload if isinstance(payload, list) else []:
        out.append(model(
            pid, pname, row.get("name"), row.get("description"),
            in_mods=row.get("input_modalities") or ["text"],
            out_mods=row.get("output_modalities") or ["text"],
            tier=tier, keyless=keyless,
            note="익명 등급" + (" · 도구 지원" if row.get("tools") else ""),
        ))
    return out


def parse_novita(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        pricing = row.get("pricing") or {}
        prompt = (pricing.get("prompt") or {})
        if not is_zero(prompt.get("price_per_m")):
            continue
        out.append(model(pid, pname, row.get("id"), row.get("title"),
                         ctx=int_or_none(row.get("context_size") or row.get("context_length")),
                         tier=tier, keyless=keyless, note="$0"))
    return out


def parse_deepinfra(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        meta = row.get("metadata") or {}
        if not is_zero((meta.get("pricing") or {}).get("input_tokens")):
            continue
        out.append(model(pid, pname, row.get("id"), None,
                         ctx=int_or_none(meta.get("context_length")),
                         tier=tier, keyless=keyless, note="$0"))
    return out


def parse_hf(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        providers = row.get("providers") or []
        if not any(p.get("is_free") for p in providers):
            continue
        ctx = max([p.get("context_length") or 0 for p in providers] or [0]) or None
        out.append(model(pid, pname, row.get("id"), None, ctx=ctx,
                         tier=tier, keyless=keyless, note="is_free 제공사 있음"))
    return out


def parse_nvidia(payload, pid, pname, tier, keyless):
    out = []
    for row in (payload.get("data") if isinstance(payload, dict) else payload) or []:
        out.append(model(pid, pname, row.get("id"), None,
                         tier=tier, keyless=keyless, note="NVIDIA 계정 키 필요"))
    return out


PARSERS = {
    "openrouter": parse_openrouter_like,
    "routeway": parse_routeway,
    "ovh": parse_ovh,
    "pollinations": parse_pollinations,
    "novita": parse_novita,
    "deepinfra": parse_deepinfra,
    "hf": parse_hf,
    "nvidia": parse_nvidia,
}


# ------------------------------------------------------------------ chat probing

CHAT_PROMPT = "Reply with exactly: ok"


def _auth_headers(env_name):
    if not env_name:
        return {}
    token = os.environ.get(env_name)
    if token:
        return {"Authorization": "Bearer " + token}
    return {}


def probe_chat(spec, provider):
    """키 없이(또는 환경변수 키로) 실제 chat/completions을 때려 본다."""
    headers = _auth_headers(provider.get("env"))
    payload = {
        "model": spec["model"],
        "messages": [{"role": "user", "content": CHAT_PROMPT}],
        "max_tokens": 16,
        "temperature": 0,
    }
    attempts = []
    result = None
    for attempt in range(2):
        result = http(spec["url"], method="POST", payload=payload, headers=headers)
        attempts.append({"status": result["status"], "ms": result["ms"]})
        if result["status"] == 200:
            break
        if result["status"] not in (0, 429, 502, 503, 504):
            break
        time.sleep(1.5 * (attempt + 1))
    sample = ""
    data = result.get("json") or {}
    try:
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or choice.get("delta") or {}
        sample = (msg.get("content") or "").strip()[:80]
    except Exception:
        sample = ""
    ok = result["status"] == 200 and bool(sample)
    return {
        "provider": provider["id"],
        "model": spec["model"],
        "url": spec["url"],
        "status": result["status"],
        "ms": result["ms"],
        "ok": ok,
        "sample": sample,
        "attempts": attempts,
        "cors": result.get("cors"),
        "error": result.get("error") or (None if ok else (result.get("text") or "")[:160]),
    }


# ---------------------------------------------------------------------- assembling


def kst_now():
    now = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)
    return now.strftime("%Y-%m-%d %H:%M KST")


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_meta():
    with open(META, "r", encoding="utf-8") as handle:
        return json.load(handle)


def build():
    meta = load_meta()
    providers = meta["providers"]
    grades = meta.get("grades", {})
    spotlight = meta.get("spotlight", [])

    catalogs = []
    live_models = []
    catalog_by_provider = {}

    for provider in providers:
        spec = provider.get("catalog")
        if not spec:
            continue
        parser = PARSERS.get(spec.get("shape"))
        if parser is None:
            continue
        result = http(spec["url"])
        entry = {
            "provider": provider["id"],
            "name": provider["name"],
            "url": spec["url"],
            "status": result["status"],
            "ms": result["ms"],
            "cors": result.get("cors"),
            "total": None,
            "free": 0,
            "error": result.get("error"),
        }
        if result["status"] == 200 and result["json"] is not None:
            rows = parser(result["json"], provider["id"], provider["name"],
                          provider["tier"], provider["keyless"])
            payload_rows = (result["json"].get("data")
                            if isinstance(result["json"], dict) else result["json"])
            entry["total"] = len(payload_rows or [])
            entry["free"] = len(rows)
            live_models.extend(rows)
        else:
            entry["error"] = entry["error"] or (result.get("text") or "")[:120]
        catalogs.append(entry)
        catalog_by_provider[provider["id"]] = entry
        print("[catalog] %-26s HTTP %-3s %5sms free=%-3s total=%s"
              % (provider["id"], result["status"], result["ms"],
                 entry["free"], entry["total"]))

    status_probes = {}
    for provider in providers:
        spec = provider.get("status")
        if not spec:
            continue
        result = http(spec["url"], headers=_auth_headers(provider.get("env")))
        status_probes[provider["id"]] = {
            "url": spec["url"], "status": result["status"], "ms": result["ms"],
            "cors": result.get("cors"), "error": result.get("error"),
        }
        print("[status ] %-26s HTTP %-3s %5sms" % (provider["id"], result["status"], result["ms"]))

    chat_probes = []
    chat_by_provider = {}
    for provider in providers:
        spec = provider.get("chat")
        if not spec:
            continue
        probe = probe_chat(spec, provider)
        chat_probes.append(probe)
        chat_by_provider[provider["id"]] = probe
        print("[chat   ] %-26s HTTP %-3s %5sms ok=%s" %
              (provider["id"], probe["status"], probe["ms"], probe["ok"]))

    # 실측 지연을 모델 행에 붙인다(같은 제공사의 대표 모델에만).
    latency_by_provider = {p["provider"]: p["ms"] for p in chat_probes if p["ok"]}
    for row in live_models:
        if row["p"] in latency_by_provider and row["id"] == (
                chat_by_provider[row["p"]]["model"]):
            row["latency_ms"] = latency_by_provider[row["p"]]

    # 제공사 병합
    merged = []
    for provider in providers:
        item = dict(provider)
        g = grades.get(provider["id"], {})
        item["grade"] = g.get("grade")
        item["barrier"] = g.get("barrier", "email")
        item["why"] = g.get("why", "")
        cat = catalog_by_provider.get(provider["id"])
        if cat:
            item["probe"] = {
                "kind": "catalog", "url": cat["url"], "status": cat["status"],
                "ms": cat["ms"], "cors": cat["cors"], "total": cat["total"],
                "free": cat["free"], "error": cat["error"],
            }
        stat = status_probes.get(provider["id"])
        if stat:
            item["probe"] = {
                "kind": "status", "url": stat["url"], "status": stat["status"],
                "ms": stat["ms"], "cors": stat["cors"],
            }
        chat = chat_by_provider.get(provider["id"])
        if chat:
            item["chat_probe"] = {
                "status": chat["status"], "ms": chat["ms"], "ok": chat["ok"],
                "model": chat["model"], "sample": chat["sample"],
                "cors": chat["cors"],
            }
        item["live_note"] = _live_note(item)
        item["models_live"] = [m for m in live_models if m["p"] == provider["id"]]
        if item["models_live"]:
            # 카드에 보여줄 대표 모델: 컨텍스트 큰 순 3개
            top = sorted(item["models_live"],
                         key=lambda r: (-(r.get("ctx") or 0), r["id"]))[:3]
            item["models_top"] = [{"id": r["id"], "note": _ctx_label(r)} for r in top]
        else:
            item["models_top"] = item.get("models") or []
        merged.append(item)

    totals = {
        "providers": len(merged),
        "free_models": len(live_models),
        "keyless_models": len([m for m in live_models if m["keyless"]]),
        "keyless_live": len([c for c in chat_probes if c["ok"]]),
        "catalogs_ok": len([c for c in catalogs if c["status"] == 200]),
        "catalogs": len(catalogs),
        "chats_ok": len([c for c in chat_probes if c["ok"]]),
        "chats": len(chat_probes),
        "grades": {
            g: len([p for p in merged if p["grade"] == g])
            for g in ("S", "A", "B", "주의")
        },
    }
    data = {
        "schema": 3,
        "generated_utc": utc_now(),
        "generated_kst": kst_now(),
        "generator": "free-ai/scripts/probe.py",
        "origin": ORIGIN,
        "raw_url": ("https://raw.githubusercontent.com/buriburiyj/buriburiyj.github.io/"
                    "main/free-ai/data.json"),
        "totals": totals,
        "catalogs": catalogs,
        "chat_probes": chat_probes,
        "live_models": live_models,
        "providers": merged,
        "spotlight": spotlight,
        "notes": {
            "free_rule": "무료 판정은 각 카탈로그의 가격 필드가 0인 모델만. 응답에 가격 정보가 없으면 무료로 단정하지 않는다.",
            "tag_rule": "코딩/추론/비전 태그는 모델명·모달리티·supported_parameters 기반 추정이다.",
            "keyless_rule": "keyless=true는 키 없이 chat/completions 200을 실제로 받은 경우에만 표시한다.",
            "unknown": "측정하지 못한 값은 null 또는 '확인 못 함'으로 남긴다.",
        },
    }
    return data


def _ctx_label(row):
    ctx = row.get("ctx")
    if not ctx:
        return ""
    if ctx >= 1000000:
        return "%sM" % (round(ctx / 1000000, 1))
    if ctx >= 1000:
        return "%sK" % int(round(ctx / 1000))
    return str(ctx)


def _live_note(item):
    notes = []
    probe = item.get("probe")
    if probe and probe.get("kind") == "catalog":
        if probe.get("status") == 200:
            notes.append("카탈로그 HTTP 200 · %sms · 무료 %s종 / 전체 %s개"
                         % (probe.get("ms"), probe.get("free"), probe.get("total")))
        else:
            notes.append("카탈로그 HTTP %s — 무료 목록 조회 실패" % probe.get("status"))
    elif probe:
        status = probe.get("status")
        if status == 401:
            notes.append("인증 없이 HTTP 401 — 키 필요(%sms)" % probe.get("ms"))
        elif status == 403:
            notes.append("인증 없이 HTTP 403 — 키 필요(%sms)" % probe.get("ms"))
        elif status == 200:
            if item.get("keyless"):
                notes.append("키 없이 목록 HTTP 200 (%sms)" % probe.get("ms"))
            else:
                notes.append("커넥션은 열려 있음(HTTP 200, %sms) — 호출에는 키 필요"
                             % probe.get("ms"))
        else:
            notes.append("HTTP %s" % status)
    chat = item.get("chat_probe")
    if chat:
        if chat.get("ok"):
            notes.append("키 없이 채팅 200 · %sms" % chat.get("ms"))
        else:
            notes.append("채팅 HTTP %s%s" % (
                chat.get("status"),
                " (CORS 차단)" if chat.get("status") == 0 else ""))
    return " · ".join(notes)


def main():
    data = build()
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if "--stdout" in sys.argv:
        sys.stdout.write(blob)
        return 0
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(blob)
    print("\nwrote %s (%.1f KB)" % (OUT, len(blob.encode("utf-8")) / 1024))
    print("totals: %s" % json.dumps(data["totals"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
