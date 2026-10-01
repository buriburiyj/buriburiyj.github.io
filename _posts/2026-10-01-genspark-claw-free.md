---
layout: post
title: "젠스파크 Claw를 무료 플랜으로 쓰면 생기는 일 (LLM proxy 에러)"
---

[English version]({% post_url 2026-10-01-genspark-claw-free-en %})

젠스파크 Claw 데스크탑 앱을 무료 플랜으로 쓰다가 이런 메시지를 받았습니다.

```
Free-plan credits can't be used with the Genspark API / LLM proxy.
Please visit https://www.genspark.ai/pricing ... to subscribe or purchase credits.
Stop retrying this request.
```

## 무슨 뜻인가요?

데스크탑 앱의 Claw(로컬 모드)는 **Genspark API / LLM 프록시**를 거쳐서 AI 모델을 부릅니다.
그런데 **무료 플랜에서 매일 받는 크레딧은 이 프록시에 쓸 수 없습니다.**

그래서 다시 시도해도 계속 같은 메시지가 나옵니다.
"이거 기억해" 같은 메모리 저장 요청도 이 상태에서는 처리되지 않을 수 있습니다.

## 해결 방법

1. **유료 구독 또는 크레딧 구매:** 메시지에 나온 pricing 링크에서 할 수 있습니다.
2. **Claw 대신 다른 기능 쓰기:** AI Slides, AI Docs 같은 다른 기능이나 다른 무료 AI 도구를 씁니다.
3. **실패한 요청 확인:** [genspark.ai/credit-usage](https://www.genspark.ai/credit-usage)에서 크레딧이 빠졌는지 봅니다.

## 유료로 쓸 때 크레딧 아끼는 법

Claw는 메시지마다, 그리고 도구를 쓸 때마다 크레딧을 씁니다. 그래서 일반 채팅보다 훨씬 빨리 줄어듭니다.

- **가벼운 모델로 바꾸기:** 사용자 후기에 따르면 가벼운 모델로 바꿨을 때 사용량이 크게 줄었다고 합니다.
- **Heartbeat와 안 쓰는 Schedules 끄기:** 말을 걸지 않아도 뒤에서 크레딧을 씁니다.
- **규칙은 "기억해"로 한 번만 저장하기:** 매번 붙여넣지 않아도 됩니다.
- **계획 먼저 받기:** "계획부터 3줄로 보여주고 내가 OK하면 진행해"라고 하면 잘못된 방향으로 크레딧을 쓰는 걸 막을 수 있습니다.
- **작업 폴더 지정하기:** 입력창의 폴더 아이콘으로 프로젝트 폴더를 고르면 다른 폴더까지 뒤지지 않습니다.
- **일이 바뀌면 새 세션 열기:** 대화가 길수록 비싸집니다.

긴 대화를 새 세션으로 넘길 때는 제가 만든 스킬을 써도 됩니다:
[github.com/buriburiyj/genspark-skills-ko](https://github.com/buriburiyj/genspark-skills-ko)
