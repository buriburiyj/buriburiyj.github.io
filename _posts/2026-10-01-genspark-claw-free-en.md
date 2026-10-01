---
layout: post
title: "Using Genspark Claw on the Free Plan (LLM Proxy Error)"
---

[한국어 버전]({% post_url 2026-10-01-genspark-claw-free %})

While using the Genspark Claw desktop app on the free plan, I got this message:

```
Free-plan credits can't be used with the Genspark API / LLM proxy.
Please visit https://www.genspark.ai/pricing ... to subscribe or purchase credits.
Stop retrying this request.
```

## What does it mean?

Claw in the desktop app (local mode) calls AI models through the **Genspark API / LLM proxy**.
But **the daily free-plan credits can't be used for this proxy.**

So retrying won't help — you'll keep getting the same message.
Memory requests like "remember this" may not be saved in this state either.

## How to fix it

1. **Subscribe or buy credits** using the pricing link in the message.
2. **Use other tools instead of Claw**, such as AI Slides, AI Docs, or other free AI tools.
3. **Check failed requests** at [genspark.ai/credit-usage](https://www.genspark.ai/credit-usage).

## Saving credits on a paid plan

Claw uses credits for every message and every tool call, so it drains credits much faster than normal chat.

- **Switch to a lighter model:** some users report much lower usage after switching.
- **Turn off Heartbeat and unused Schedules:** they consume credits in the background.
- **Save rules once with "remember this"** instead of pasting them every time.
- **Ask for a plan first:** "Show me a 3-line plan and wait for my OK."
- **Set a workspace folder** from the input bar so Claw stays inside your project.
- **Start a new session for a new task:** longer chats cost more.

To carry work over to a new session, you can use my Skills:
[github.com/buriburiyj/genspark-skills-ko](https://github.com/buriburiyj/genspark-skills-ko)
