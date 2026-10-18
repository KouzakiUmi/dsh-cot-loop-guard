# Design and operating principles

[Home](../README.en.md) | [中文](DESIGN.zh-CN.md)

## 1. The problem and the two authorities

An assistant can repeatedly say “read the file”, “do it now”, and “stop looping” without emitting a real tool call. Interjections, order changes, and counters can prevent any complete passage from recurring exactly. Conversely, legitimate analysis and code often repeat terms or scaffolding.

Two permissions must therefore remain separate:

1. **Deleting a copy** requires exact evidence.
2. **Stopping a visibly stalled call** may use combined heuristics, but may discard only its uncommitted suffix, not assemble a rewritten history from approximately matching sentences.

The system observes adapter-supplied reasoning, not hidden model state. It does not determine whether an argument or answer is correct.

## 2. Goals and invariants

### Core purpose: limit damage and preserve room to continue or hand off

The product goal is not merely to recognize repetition or promise that a model will never lose progress. It is to turn an escalating loop into a **bounded, observable interruption that still leaves options**.

#### Purpose 1: intercept proactively rather than wait for exhaustion

Repeated promises to act or stop looping are not evidence that recovery is imminent. Depending only on model self-correction, provider output limits, or continuous human attention can allow unproductive generation to continue consuming resources.

The guard intervenes before committing new output: normal work passes, suspicious output is withheld, and confirmation ends the current call. This is a trade-off between false interception and the cost of letting a loop grow, not an immediate ban on repeated words. Missed loops and routes that cannot be safely edited remain possible; proactive does not mean comprehensive.

#### Purpose 2: reduce CoT contamination without promising to eliminate it

Here contamination means an engineering problem in accumulated context: repeated self-instructions, unproductive plans, and recurring explanations enter history and replay, crowding out task requirements, constraints, completed work, and remaining context capacity. It is not a measurement of hidden cognition or proof that any particular text causes another loop.

Pre-commit withholding keeps part of the suspicious tail out of durable history. Confirmation discards an uncommitted suffix, while exact-copy suppression removes only proven copies. This limits further accumulation at its source; it does not rewrite the entire conversation into a clean version afterward.

Complete prevention is unrealistic. Detection needs evidence, some early repetition has already passed, and unproven output must still be released on recovery or barriers. Published prefixes are not retroactively purged. A safe prefix is **safe at protocol and commit boundaries**, not necessarily free of redundancy, mistaken reasoning, or earlier looping. Semantic curation, summaries, compaction, and rebuilding task context are separate work.

#### Purpose 3: keep the session usable, including an earlier handoff

The preferred outcome is resumed useful action after a finite continuation prompt. A less ideal but valuable outcome is an explicit stop when recovery fails, retaining accepted content, existing tool records, the reason, and a reviewable sequence. A user or higher-level workflow can then decide whether to continue, change models, take over, or curate a handoff while context capacity and resources remain—instead of discovering the problem after the session is practically unusable.

Usability is therefore not synonymous with the original model continuing to generate. It includes understanding what happened and retaining enough inspectable state to make the next decision. Bounded recovery, prefix retention, truthful failures, and immediate status each support that objective.

This is **not an automatic handoff feature**. The reference does not automatically summarize the task, select a replacement model, migrate a session, or validate tool effects. A badly contaminated conversation can still require manual curation and may not be salvageable.

#### Evaluate the objectives separately

| Objective | Useful observation | Not established |
|---|---|---|
| Proactive damage limitation | A confirmed loop triggers a call-local stop and finite recovery converges to action or an explicit end | Detection of all loops or fixed stopping latency |
| Less contamination | An uncommitted looping tail is not delivered; proven copies do not return at block-end | Completely clean history or semantic sanitization |
| Usability and handoff space | Retained records and a clear reason let the user choose the next step sooner | An automatic handoff or guaranteed task continuation |
| Less wasted generation | No unbounded policy recovery; an attempt to limit further unproductive output | A fixed token-saving percentage, refund of spent tokens, or immediate provider billing cancellation |

A terminal error does not by itself make the guard useless. The [observed case](../examples/mimo-v2.6-pro/README.md) records both recovery followed by real tool calls and a separate eventual failure boundary. Damage limitation and clarity of the remaining state should be evaluated separately from final task completion.

Goals: govern output before delivery and durable commit; avoid buffering normal output first; bound observation, withholding, interruption, and recovery; affect one model call rather than cancelling the entire user task; make transitions immediately visible.

Non-goals: universal semantic-loop detection, zero false positives, a signature-stripping fallback, or an installation mechanism for other DSH versions.

Invariants:

- The visible stall never retracts or rewrites text already released.
- Unproven pending text is released in original order on recovery.
- Only the exact-copy filter removes proven copies.
- Neither detector executes tools or partial argument JSON.
- Cancellation outranks recovery; teardown failure forbids another policy-authorized call.
- Presentation stages are neither model tokens nor fabricated human input.

## 3. Layers and data flow

```text
prepared model call with explicit replay capability
  -> reasoning output policy
     -> VisibleStallWatch: evidence and withholding over original characters
     -> ReasoningWatch: exact-copy evidence and suppression
  -> AssistantStreamAttempt
     -> accepted chunks: assembly, durable stream, live output
     -> detection stages: live frames and active-attempt baseline only
  -> call-local cancellation / safe-prefix settlement
  -> attributed recovery message
  -> another call in the same activity, if permitted
```

The stall must see original characters, not merely the text left after copy suppression. Otherwise detection depends on copies another detector managed to delete, which may be zero for a micro-variation loop.

Observation positions advance by characters rather than provider deltas. Splitting input into tiny deltas or one large delta should preserve decisions. Multiple transitions inside one delta are retained in occurrence order.

See the [source index](../reference/README.md). Original paths are preserved for navigation, not standalone compilation.

## 4. Exact-copy suppression

Source: [reasoning-watch.ts](../reference/packages/guard/repeat-tool-reminder/src/reasoning-watch.ts).

### Bounded evidence

The detector maintains raw and accepted suffixes and pending spans with original offsets. Each suffix defaults to 4096 UTF-16 code units; observations occur every 32. Its independent state machine is `normal -> tentative -> suppressing`.

Normal characters pass immediately. Evidence at the hold threshold makes subsequent characters tentative. Only evidence at the confirmation threshold permits suppressing proven intervals.

### Evidence families

- Periodic suffixes: periods from 4 through a default maximum of 192, matching at least three periods. Uninformative whitespace/single-character patterns are rejected.
- Reordered complete sentence units: at least 16 units with exact recurring unit characters occupying at least 0.75 of all unit characters.

A candidate copy must have an original present in the accepted suffix. Intervals are merged and removed only from pending text, never from the published prefix. Changed identifiers, numbers, and negations are not normalized into equality.

### Release and interruption

By default, cumulative suppression of 16384 code units plus continuing evidence permits this detector to interrupt. This is not the visible stall's retention limit.

`flush()` releases unproven text; removed copies do not return. Barrier `release()` can still remove proven copies but cannot start a new cancellation during a settlement that can no longer abort safely. This avoids dropping text still owed to the consumer.

## 5. The visible-stall dam

Source: [visible-stall.ts](../reference/packages/guard/repeat-tool-reminder/src/visible-stall.ts).

### Defaults and units

All character budgets count **UTF-16 code units**, not tokens, UTF-8 bytes, graphemes, or seconds.

| Field | Default | Purpose |
|---|---:|---|
| `windowChars` | 1024 | Initial observation window |
| `maxWindowChars` | 8192 | Hard supported retention ceiling |
| `scanChars` | 128 | Observation cadence |
| `minUnits` | 16 | Minimum complete units |
| `unitShare` | 0.5 | Recurring-unit occurrence share |
| `unitCharShare` | 0.15 | Recurring-unit character share |
| `shingleChars` | 8 | Exact fragment length |
| `shingleShare` | 0.6 | Repeated-fragment coverage |
| `confirmWindows` | 3 | Consecutive positive observations |
| `recoveryWindows` | 2 | Consecutive negative observations |

Invalid settings fail at activation rather than silently becoming a different configuration.

### Sentence recurrence

Terminators are `。！？!?；;`, carriage return, and newline. ASCII `.` is not a terminator. Unit edges are trimmed; interior identifiers, counters, and negations are not normalized.

For complete nonempty unit occurrences `u1 ... un`, with `count(u)` denoting exact recurrence:

```text
R_units = sum(count(u), where count(u) > 1) / n
R_chars = sum(count(u) * length(u), where count(u) > 1)
          / sum(length(ui), over all occurrences)
```

All of `n >= 16`, `R_units >= 0.5`, and `R_chars >= 0.15` must hold. Character mass prevents tiny fillers such as “OK.” from dominating an otherwise progressive discussion merely by appearing often. Actual segmentation still follows the terminators above.

### Reused characters

The raw window is scanned for exact fragments of length 8. Equal fragments must occur at least `2 * shingleChars` apart to qualify, avoiding nearby overlap as evidence by itself.

Hashes identify candidates; actual code-unit comparison verifies equality. Coverage counts positions in qualifying later occurrences, once per position:

```text
R_shingle = covered_positions / raw_window_length
qualifies = enough_units
            AND R_units >= 0.5
            AND R_chars >= 0.15
            AND R_shingle >= 0.6
```

This is not edit distance, embedding similarity, or another language model. Neither sentence recurrence nor fragment reuse alone is sufficient.

### Entering the hold

Before the initial window fills, output passes. The first qualifying complete observation sets `holding = true` and `high = 1`. **The character triggering that observation still passes**; subsequent characters are withheld.

Pending text is represented as a suffix length of `raw`, not another complete string. A 1024-code-unit observation window therefore does not impose an initial 1024-character display delay on every call.

### Growth, confirmation, and recovery

While holding, capacity doubles when the growth condition is met, up to 8192. Expanded observations may be partially filled; they still need at least the initial window's character count.

- Positive observation: increment `high`, clear `low`.
- Negative observation: clear `high`, increment `low`.
- Three consecutive positives, unless tool-protected: discard the uncommitted suffix and stop the call.
- Two consecutive negatives: release pending original text and reset observation.

These are **observations**, not three provider chunks or three disjoint full windows. The first positive counts as one, so confirmation can occur well before 8192.

Released text still passes through the exact-copy filter. “Verbatim release by the dam” does not promise that proven copies survive the combined pipeline.

### The ceiling is a decision point

Retention is bounded on every character. Once pending length reaches the configured ceiling:

- Still qualifying and unprotected: interrupt and discard the pending suffix.
- Evidence has fallen back or the call is protected: release and reset.

A very large confirmation count must not turn the ceiling into a periodic unconditional leak.

8192 bounds this detector's raw window only. Exact-copy buffers, hash buckets, coverage arrays, application history, and model tokens have separate costs. This is not an 8192-byte system or a constant-time claim.

## 6. Fences and barriers

The bounded line-prefix state machine does not retain whole lines. It recognizes up to three leading spaces and runs of at least three backticks or tildes. Openers may carry an info string; backtick opener info cannot contain another backtick. Closers need the same marker, at least the opening run length, and trailing whitespace only.

Inline backticks, four-space indentation, and three backticks inside a four-backtick fence do not count as valid closure. Opening/closing is recognized at the completed line's newline. Fenced content suspends visible-stall observation; transitions release pending text and reset its window.

On the normal recovery path, `released` means evidence fell back. `barrier` means a fence or explicit settlement released text **without judging repetition**. There is a granularity limit in this reference: a tool-protected call may release at continued confirmation or at the ceiling and also report `released`. Its UI wording is therefore not universal proof that repetition decreased. This repository documents that limit rather than changing the copied implementation.

Non-reasoning events also settle pending reasoning to preserve ordering. Fence protection belongs to the visible stall, not a semantic code exemption for the exact-copy filter. Exact repeated code remains a boundary to evaluate.

## 7. Capability gating and replay

Source: [plain-reasoning.ts](../reference/packages/llm/llm-pi-ai/src/plain-reasoning.ts).

Configuration must explicitly enable the policy, and the **same prepared call** must declare `reasoningReplay: 'editable-plain'`. A plugin switch, provider name, or model label is insufficient.

The pi-ai adapter's explicit plain mode applies to the checked Chat Completions conversion path. Known plain selectors `reasoning_content`, `reasoning`, and `reasoning_text` are not signatures. Redacted thinking, unknown thinking signatures, and signed text/tools are rejected rather than silently stripped.

Unknown or opaque routes remain untouched. This does not prevent using those models; it prevents this editing path. Every additional adapter needs its own real replay-contract review.

Replay must also preserve a reasoning-only prefix when the native protocol would otherwise drop an assistant message lacking body/tools. A safe same-route conversion preserves its original text; it is not permission to erase signatures across providers.

## 8. Call-local cancellation and bounded continuation

Sources: [agent.ts](../reference/packages/core/agent-loop/src/agent.ts), [reasoning-policy.ts](../reference/packages/guard/repeat-tool-reminder/src/reasoning-policy.ts).

### Notify before teardown

```text
policy decides to interrupt
  -> emit true REASONING_LOOP error finish frame
  -> abort this call's AbortController
  -> leave iteration and await iterator.return / transport teardown
  -> settle the interrupted safe assistant prefix
  -> persist an attributed recovery prompt
  -> start the next call only if authorized
```

Publishing the actual local failure before teardown prevents a slow iterator cleanup from hiding the decision. It is not a fabricated normal stop or token-limit result. Until cleanup finishes, presentation can say “cutting the call”, not that another request has already begun.

### Prefix integrity

Only accepted reasoning/text belongs in the safe prefix. Undispatched tools are not recorded as successful tool calls. A reasoning block closes from accepted text, not the provider's original full block, preventing suppressed copies from returning at block-end.

An empty prefix may settle as `assistant/attempt`; a usable prefix settles as `assistant/message` with `interrupted: true`.

### Finite recovery

A WeakMap isolates counters by Agent and turn. Default `maxRecoveries` is 1. Setting 3 allows three extra calls beyond the original call; zero allows no continuation.

Exhaustion is a real failure and must not be laundered into ordinary `always` retry. Native child agents use the same bounded mechanism in their own Agent/turn; recovery does not require cancelling/recreating the whole parent task.

These counters live in the policy instance, not a durable global quota. Restarting the process or replacing the plugin does not preserve that same counter map.

### Recovery is intentionally model-visible

Presentation stages never enter model context. The **recovery prompt deliberately does**: an attributed durable `user/message`, not a human-authored instruction. Its source has this illustrative structure:

```json
{"kind":"reasoning-loop-recovery","turn":1,"step":1,"attempt":1,"limit":3}
```

The visible-stall prompt says an unconfirmed repetitive tail was discarded; the exact-copy prompt says copies were discarded. They must not invent each other's evidence. The instruction asks for a different approach and actual tool-protocol use.

User/parent cancellation, policy disposal, iterator teardown failure, or rejected settlement prevents policy-authorized continuation. A captured policy may finish the current filtering/stop but cannot authorize another call after disposal.

## 9. Tools and settlement budget

A complete protocol tool block calls `protectCommit()`. Withholding/release may continue, but repetition no longer arbitrarily cancels that call. Protection neither dispatches tools nor makes partial JSON executable.

The first complete tool block activates an independent `settlementBudget = 65536`. Each subsequent non-finish event costs `1 + new delta UTF-16 length`; another tool block does not reset the budget.

Exhaustion returns `TOOL_SETTLEMENT_LIMIT`, dispatches none of that call's tools, and does not recover automatically. This is not `REASONING_LOOP` and should not be labelled as confirmed reasoning repetition.

An output budget is not a timeout. Silence remains subject to the adapter's idle watchdog.

## 10. Live state versus durable facts

Sources: [attempt framing](../reference/packages/core/agent-loop/src/assistant-stream.ts), [host fold](../reference/packages/api/session-controller/src/assistant-stream.ts), [client fold](../reference/packages/api/session-controller/src/client/sessions/assistant-stream.ts).

`reasoning-stall` control items become `stage` frames carrying attempt identity, revision, turn, step, and index. They never enter the text accumulator, durable token stream, or model requests.

The host updates only a matching live attempt and retains its latest stage in the reconnect baseline. The client folds it into transient presentation. This reference reuses `assistant/live-chunk` with a `chunk | stage` payload for projection compatibility; consumers must discriminate rather than feed stages to text processing. Headless/token consumers ignore presentation-only frames.

A wording-only UI change is insufficient: producer, transport, baseline, consumers, and projection must agree.

| Situation | Truthful presentation |
|---|---|
| Current connection while withholding | Current suspected stage |
| Reconnect while attempt remains live | Latest stage from active baseline |
| Open ended history | Durable interrupted prefix and recovery prompt, not fabricated probe history |

Old attempts, late frames after settlement, and releases after cancellation must not create ghost state.

## 11. Several calls in one Step

One latest assistant value per Step can overwrite interrupted thinking on recovery. A generic “stopped” label also confuses user cancellation with a policy cut. A durable recovery prompt can remain invisible if classified as hidden context.

The reference handles each concern separately:

- `retained`: interrupted prefixes survive subsequent calls.
- `interruption`: the latest actual policy finish outranks an earlier `recovery`.
- `recovery`: persisted turn/step/attempt/limit provide placement and ordinal; its prompt is expandable.
- `stall`: current live dam stage updates one row, not one notification per character.
- Settlement/Step closure clears expired state; user cancellation stays user cancellation.
- Anchoring at a retained prefix's durable seq reduces drift between transient fractional ordering and replay integer ordering.

See [projection](../reference/packages/client/ui-chat/src/client/conversation-nodes/assistant.ts) and [notice](../reference/packages/client/ui-chat/src/client/chat/RecoveryNotice.tsx). Between interrupted settlement and the next recovery event, prior recovery presentation may briefly remain; it does not prove a new call started.

## 12. Performance and limits

Later maintenance introduced [sentence helpers](../reference/packages/guard/repeat-tool-reminder/src/sentence-units.ts): count terminators before a potentially expensive sentence regex; avoid per-period slice/Set allocation; continue verifying hash candidates exactly.

Bounded retention does not mean zero CPU or constant time. Legitimate repetition, language/terminator habits, short loops, absent terminators, and multiple reasoning blocks affect sensitivity. The policy actively filters only its first selected reasoning index; it is not a universal final-answer text deduplicator.

Fence recognition waits for a complete line. A large provider delta can contain multiple transitions, which may reach the UI close together; no guarantee is made that a human sees every intermediate state individually.

## 13. Evidence, not accuracy promises

[Validation](VALIDATION.md) separates detector properties, loop/projection tests, and real-model or real-browser behavior. The 275 relevant tests executed for publication do not prove correctness across every language, route, or deployment.

A repetitive passage that would later self-recover can be stopped earlier. That is the intervention/false-positive trade-off, not a measured universal accuracy threshold.
