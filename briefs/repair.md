# Repair one step of a trace

A trace is a path through a mobile app that replays with no model. It replayed on a new version of the app and stopped on one step. Your job: propose a new action for that one step, so that the path does again what it did before.

The trace, without its checks (the texts it typed are only names, like `{"param": "TEXT_1"}`):

```json
{{STEPS}}
```

The replay stopped here: {{DIVERGENCE}}

The phone now shows the screen where it stopped. The screenshot is `{{SCREENSHOT}}` (half size); read it. Its elements, with their centres in real screen pixels:

```
{{ELEMENTS}}
```
{{EARLIER}}
Rules:
- Propose one action for one step, nothing else. You cannot add or remove a step.
- Use only these actions: `tapOn` and `longPressOn` with `target` `{"text": "..."}` or `{"id": "..."}` (optionally with `"index": n`, from 0, when several elements match) or `{"point": "x%,y%"}`; `inputText` with `text`; `eraseText`; `pressKey` with `key` Enter, Backspace, Home or Back; `swipe` with `direction` UP, DOWN, LEFT or RIGHT; `scrollUntilVisible` with `target`; `hideKeyboard`. A text target must be the whole text of one element, as listed above.
- Prefer a target by text over a point.
- Do not try to make the path pass at any cost: if the step can no longer be done with one action, say so with `"action": null`.

Answer with one JSON object and nothing else:

{"stepId": "<id of the step>", "action": { ... } or null, "why": "<one sentence>"}
