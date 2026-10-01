---
layout: post
title: "4 Genspark Skills to Save Credits and Continue Work Across Chats"
---

[한국어 버전]({% post_url 2026-09-28-genspark-skills %})

When you use Genspark on the free plan, you run into two problems:

1. Long chats cost more credits, because every message re-processes the full conversation.
2. But if you start a new chat, Genspark forgets everything you've done.

So I built a set of **Skills that summarize your work and pick it up again in a new chat**.

## The 4 Skills

| Skill | What it does |
|---|---|
| conversation-handoff | Summarizes goal, files, progress, errors, and rules in 8 fixed sections |
| resume-work | Reads the summary and continues from the next task |
| fix-error | One-line cause + only changed code, stops after 2 failed attempts |
| token-saving-coding | Short answers, only code changes, no unrequested features |

## Workflow

```
resume-work → token-saving-coding → (on error) fix-error → conversation-handoff → new chat
```

Type `/` in the input box and search by the first letters (`/res`, `/tok`, `/fix`, `/con`).

## How to install

1. Go to [genspark.ai/skills](https://www.genspark.ai/skills).
2. Click **+ New Skill** → **Create for myself**.
3. Paste the contents of a `SKILL.md` file from GitHub and ask Genspark to create the Skill.

English versions are in [skills-en/](https://github.com/buriburiyj/genspark-skills-ko/tree/main/skills-en), and ready-to-upload `.skill` files are on the [Releases](https://github.com/buriburiyj/genspark-skills-ko/releases/latest) page.

All files are here: [github.com/buriburiyj/genspark-skills-ko](https://github.com/buriburiyj/genspark-skills-ko)

## Can't see Skills on iPhone?

The menu may not appear in the app. Open `genspark.ai/skills` in Safari,
then tap **AA → Request Desktop Website**.

## Tips to save credits

- Write clear, specific requests in one go (every regeneration costs the same as the first try)
- Do one task per chat
- When you hit an error, send only the error message and related code, not the whole file
- Make small edits yourself instead of asking again
- On the free plan, the 100 daily credits don't roll over, so use them the same day
