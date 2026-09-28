---
layout: post
title: "젠스파크 크레딧 아끼면서 대화 이어가는 스킬 4개"
---

[English version]({% post_url 2026-09-28-genspark-skills-en %})

[English version]({% post_url 2026-09-28-genspark-skills-en %})

젠스파크(Genspark)를 무료로 쓰다 보면 두 가지 문제가 생깁니다.

1. 대화가 길어질수록 메시지마다 이전 대화를 다시 읽어서 크레딧이 더 듭니다.
2. 그렇다고 새 대화로 옮기면 지금까지 한 작업을 기억하지 못합니다.

그래서 **작업을 요약해서 넘기고, 새 대화에서 이어받는 스킬**을 만들었습니다.

## 스킬 4개

| 스킬 | 하는 일 |
|---|---|
| conversation-handoff | 목표, 파일 구조, 진행 상황, 오류, 규칙을 8개 항목으로 요약 |
| resume-work | 요약을 읽고 남은 할 일부터 이어서 작업 |
| fix-error | 원인 한 줄 + 바뀐 코드만, 두 번 실패하면 멈춤 |
| token-saving-coding | 짧은 답, 바뀐 코드만, 요청 안 한 기능 금지 |

## 사용 흐름

```
resume-work → token-saving-coding → (에러 나면) fix-error → conversation-handoff → 새 대화
```

입력창에 `/`를 치고 영어 앞글자(`/res`, `/tok`, `/fix`, `/con`)로 찾으면 됩니다.

## 설치 방법

1. [genspark.ai/skills](https://www.genspark.ai/skills)에 들어갑니다.
2. **+ New Skill** → **Create for myself**를 누릅니다.
3. GitHub에 올려 둔 `SKILL.md` 내용을 붙여넣고 "이걸로 스킬 만들어줘"라고 보냅니다.

전체 파일은 여기 있습니다: [github.com/buriburiyj/genspark-skills-ko](https://github.com/buriburiyj/genspark-skills-ko)

## 아이폰에서 Skills 메뉴가 안 보일 때

앱에서는 메뉴가 안 보일 수 있습니다. 사파리 주소창에 `genspark.ai/skills`를 직접 입력하고,
**가가(AA) → 데스크탑 웹사이트 요청**을 켜면 보입니다.

## 크레딧 아끼는 팁

- 요청은 한 번에 구체적으로 적기 (다시 생성하면 크레딧이 처음과 똑같이 듭니다)
- 한 대화에서는 한 가지 일만 하기
- 에러는 코드 전체 말고 에러 메시지와 관련 부분만 보내기
- 작은 수정은 직접 고치기
- 무료 플랜의 하루 100 크레딧은 다음 날로 넘어가지 않으니 그날 쓰기
