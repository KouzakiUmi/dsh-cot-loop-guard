# Design prototypes: user control and honest replay

[Repository home](../README.en.md) | [中文](README.md) | [Validation](../docs/VALIDATION.md)

> **New experimental code, not a shipped Core fix, installable plugin, patch kit or migration tool.** The historical `reference/` files and provenance manifest remain unchanged. These tests do not modify a DSH instance.

## Why a separate directory?

Discussion [#10179](https://github.com/deepseek-ai/deepseek-harness/discussions/10179) raised actionable questions about English sentence boundaries, user control over recovery, and whether offline evaluation preserves individual calls and intermediate decisions.

Changing the pinned reference files would break the promise that their bytes came from a particular committed Core snapshot. This directory instead contains bounded experiments. Passing prototype tests does not mean the running guard was upgraded.

## 1. Sentence-boundary experiment

[Source](src/sentence-units.mjs) | [Tests](test/sentence-units.test.mjs)

- Handles CJK terminators, `!`, `?`, semicolons and line endings, plus **ASCII periods followed by whitespace**, optionally after closing quotes/brackets. A genuine input end can settle a final period.
- A delta boundary is not an input end: `file.` followed by `txt` must stay together.
- Internal decimal, version, IP address, path and URL dots do not directly split a unit. Terminator runs and ellipses do not manufacture empty units.
- Counts trimmed whole units, not substrings such as `好。` inside `完好。`. Novelty and recurring-occurrence share are reported as different descriptive statistics, without automatically transplanting thresholds.
- Retains at most 8192 UTF-16 code units for one pending unit. An overlong unit is omitted whole and coverage becomes incomplete; a truncated suffix is not passed off as a complete sentence.

This is not an NLP tokenizer. Abbreviations such as `Dr.` can still split, and periods without following whitespace can remain unrecognized. It does not parse code, Markdown or provider protocols. Future detector integration still needs fence protection, rolling windows, combined evidence and false-positive evaluation.

The new scanner is **not wired into the historical VisibleStallWatch**. These tests establish boundary behavior, not improved guard recall or false-positive rate. The internal pending limit does not bound caller-owned unit arrays, replay data or frequency tables.

## 2. User-authorized bounded recovery

[Source](src/recovery.mjs) | [Tests](test/recovery.test.mjs)

User priority does not prohibit automation; it requires automation to follow the user's chosen policy. `RecoveryBudget` requires an explicit `maxRecoveries` choice rather than silently choosing a default:

- Zero is stop-only. N > 0 permits at most N recovery authorizations, **excluding the initial call**.
- One loop is not a permanent verdict on the model or conversation.
- Tool boundaries never replenish the allowance. Duplicate/stale attempt notifications cannot authorize another recovery.
- Cancellation, disposal, failed cleanup/settlement, ineligible replay and tool-settlement exhaustion cannot become another recovery.
- Stop advice is `presentation-only` data: review state, consider context curation/compaction, or prepare a handoff. It is not a model instruction or an executed action.

### An authorization is not an executed request

This module returns intents; it calls no model, tool or DSH service. An authorization conservatively consumes an allowance even if the request is never dispatched. A future Host adapter must recheck cancellation and policy state immediately before dispatch. This helper cannot undo an action an external caller already executed.

Lifecycle facts must come from a trusted Host adapter, not model text. Attempt ordinals must increase within the scope; turn/step alone cannot identify each call.

The scope is caller-owned in-memory accounting, not persistent storage. Recreating a controller grants a fresh allowance, so it must not be recreated at each tool boundary or recovery. This is not a global quota across Agents, turns or processes and does not implement quarantine.

The pinned Core still defaults to one recovery and permits zero. The prototype's explicit-choice interface does not change that default or create an existing settings UI.

## 3. Replay each attempt, not just the final tail

[Source](src/replay.mjs) | [Tests](test/replay.test.mjs)

`readRecordedAttempts(events)` takes **already-parsed JSON events** and reads `assistant/message.data.stream` and `assistant/attempt.data.stream`. Every settlement remains a separate attempt even when turn/step match. Packed fragments retain order and boundaries; tool arguments do not become reasoning. Final block contents are not duplicated into another delta.

Unknown records, missing streams, malformed runs and absent/duplicate/nonterminal finish are reported as incomplete. Unsupported stream events, including legacy `assistant/chunk`, are explicitly disclosed. Unrelated user/tool events are inventoried. Empty input is not complete coverage.

This reader does **not** directly read JSONL, Zstd or all historical formats, certify every DSH version, or validate the full Core grammar. The caller must use the correct upstream file reader and preserve its coverage report too.

`replayRecordedAttempts(report, createPolicy)` creates a fresh policy for each complete attempt and feeds each chunk through the policy's own `push`, then `flush`. It neither transcribes another detector nor checks only the last tail. Within the loaded module, reusing a policy object across attempts or separate replay invocations is rejected through a WeakSet without permanently retaining the object. Distinct objects can still share external state, so the factory must genuinely create independent call state; identity checks are not a universal isolation proof.

The result retains reader coverage. Incomplete attempts are not called zero-hit results. The first interrupting **chunk index** remains visible even if the original input later ends normally; no exact intra-delta character offset is invented.

Accepted reasoning-delta counts help test whether an experimental policy actually withheld output rather than merely logged a finding. The tiny withholding policy in the tests is a **driver fixture, not the shipping guard or an accuracy benchmark**.

The distinction should also be fair to other analyzers: the [current sibling analyzer](https://github.com/argszero/cordis-plugin-thinking-loop-guard/blob/441269f0b7f1489b2fe56c658e6fffde0eaf8c80/tools/analyze-session.mjs#L318-L344) already updates novelty per reasoning delta and remembers an intermediate threshold crossing. It is not accurate to call every rule final-tail-only. The requirement here is separate attempts, ordered events, and actual rule decision positions/cadence. This driver records interruption and accepted-delta counts; it does not automatically assert every buffering/release transition.

### Evidence limits

Persisted streams already contain accepted content and can omit the provider's rejected tail. A no-hit result does not establish original request health. It cannot recover discarded length, real detection latency, full final-block consistency, transport teardown, billing or task correctness.

Adding support for `data.stream` on `assistant/message` fixes format coverage, not missing original input:

| Evaluation purpose | Required input |
|---|---|
| Retained-prefix and recovery-prompt persistence | Post-guard records |
| Original trigger position and withheld/discarded range | Complete ordered pre-guard input or controlled synthetic streams |
| Whether a prematurely cut sample would later recover | A complete counterfactual sample, not only a cut prefix |

A cooperative evaluation should first align de-identified formats, attempt boundaries and labels, starting with synthetic fixtures if appropriate. Sharing additional real raw traces needs separate authorization; interest in collaboration is not permission to publish a user's session. This prototype neither captures raw streams nor uploads data.

Core lifecycle tests remain necessary: capability gates, parent cancellation, final blocks, retry-budget isolation and truthful live/durable presentation are separate obligations.

## Run the standalone tests

From the repository root, use Node.js 24.x; the tested version is **v24.13.0**. No third-party dependencies, `npm install`, or original DSH checkout is required:

```bash
node --test prototype/test/sentence-units.test.mjs prototype/test/recovery.test.mjs prototype/test/replay.test.mjs prototype/test/integrity.test.mjs
```

See [validation](../docs/VALIDATION.md) for actual counts and scope. The [integrity tests](test/integrity.test.mjs) compare the 23 pinned source sizes and SHA-256 values so the experiment cannot silently replace the historical snapshot.

Node contracts were checked through Context7 against official [24.x tests](https://nodejs.org/docs/latest-v24.x/api/test.html), [assertions](https://nodejs.org/docs/latest-v24.x/api/assert.html), [file URLs](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-url-paths) and [hashing](https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-hash), then exercised locally.

## Not done

No Core/Desktop/production/installer changes; automatic compaction, handoff, model selection, migration or quarantine; full original-project suite; new live-model/browser run; complete private session/raw-provider corpus publication; or cross-version installation promise. Prototype counts are not combined with the historical 275 Core tests as one execution.

This independently authored experiment uses the repository's [MIT license](../LICENSE). It does not imply upstream adoption or certification.
