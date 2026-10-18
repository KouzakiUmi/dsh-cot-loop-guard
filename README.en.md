# CoT Loop Guard: a dam for streamed reasoning

[中文](README.md) | English

**A technical reference, not an installable plugin, generic patch kit, or DSH distribution.**

This repository documents an implementation developed in DeepSeek Harness (DSH). Normal reasoning passes immediately. Only a qualifying observation begins withholding subsequent output. Recovery releases the pending text; sustained evidence cancels the current model call, preserves the accepted prefix, and may request a different approach within a finite recovery allowance.

“CoT” here means observable reasoning supplied by an adapter. It does not mean access to hidden model state, a reasoning-correctness classifier, or detection of every semantic loop.

## Purpose: intervene early and preserve session usability

The objective is not to make a model incapable of looping. It is to limit the damage while retaining room to continue or hand off:

1. **Proactive interception, not indefinite reliance on self-correction.** On editable output routes, observe evidence, buffer only when suspicious, and interrupt a confirmed loop. Continued output is not necessarily continued task progress.
2. **Reduce CoT contamination, not promise its complete prevention.** Here this means repetitive reasoning accumulating in history and replay context, crowding out task information and remaining context capacity. Evidence takes time to accumulate, early repetition can pass, and already committed history is not retroactively purged.
3. **Keep the session as usable as possible, including an earlier handoff when needed.** Try a bounded continuation first; otherwise stop explicitly while retaining accepted content, existing tool records, and the interruption reason. This gives the user or a higher-level workflow a better basis for switching models, curating context, or handing off instead of spending the remaining token/context budget on a loop.

**A timely, understandable stop can be a useful outcome even when automatic recovery fails.** The guard does not guarantee task correctness, automatically produce handoff summaries, switch models, or ensure provider billing stops immediately after cancellation. It aims to reduce further waste, not recover tokens already spent.

See [the detailed purpose and trade-offs](docs/DESIGN.en.md#2-goals-and-invariants).

## Reading map

- [Detailed design](docs/DESIGN.en.md): algorithms, formulas, state transitions, capabilities, cancellation, tools, recovery, and live presentation.
- [Why this DSH layer?](docs/LAYERING.en.md): alternatives, plugin/Core ownership, integration difficulty, and practical trade-offs.
- [Validation and limitations](docs/VALIDATION.md): what was actually tested and what was not.
- [Reference source index](reference/README.md).
- [Provenance and SHA-256](provenance.json).
- [Attribution](NOTICE.md) and [MIT license](LICENSE).
- [MiMo-v2.6-Pro observed interception case](examples/mimo-v2.6-pro/README.md): an authorized, privacy-minimized historical excerpt, recovery, subsequent tool calls, and a separate terminal failure boundary.

## Two different authorities

```text
prepared call explicitly permits editable-plain replay
  -> original reasoning
  -> visible-stall dam: withhold / release / stop
  -> exact-copy filter: remove proven copies only
  -> accepted stream: live display, persistence, and replay
```

**Exact-copy suppression** needs exact evidence and an accepted original. It does not equate changed numbers, identifiers, or negations.

**Visible-stall interruption** combines recurring sentences with reused character fragments. It may discard an uncommitted suffix when stopping a call; it does not perform fuzzy sentence deletion or rewrite already published text.

## Observable states

| State | Meaning |
|---|---|
| Suspected | A complete observation qualifies; subsequent output is being checked in a buffer |
| Released | Pending output was released after evidence fell back or a tool-protected path released it; the label is not universal proof that repetition decreased |
| Barrier | A fence or settlement released pending output without judging repetition |
| Interrupted | Repetition was confirmed; cancellation is in progress, followed by settlement and possibly bounded recovery |

One notice follows transitions rather than producing a notification per token. Stages are not model tokens or injected prompts. A live attempt's latest stage is included in its reconnect baseline. Ended probe episodes are not fabricated as durable history. Actual interrupted settlements and attributed recovery prompts are durable facts.

## Defaults at a glance

The visible stall starts with a 1024-UTF-16-code-unit observation window, checks every 128 code units, and expands toward a hard retention ceiling of 8192. It requires at least 16 complete units, recurring-unit occurrence share ≥ 0.5, recurring-unit character share ≥ 0.15, and repeated 8-code-unit fragment coverage ≥ 0.6. Three consecutive qualifying observations confirm; two nonqualifying observations recover.

8192 is neither a required wait nor a whole-application memory budget. Exact-copy filtering maintains additional bounded buffers.

The default recovery allowance is **one per Agent/turn/policy instance**. Three is a deployment choice, not the source default. Advisory repeated-tool-call reminders and reasoning output editing are independently enabled features.

## What is included

- 23 committed source snapshots with original paths and byte fingerprints, including representative tests.
- Chinese and English explanations of the design and its safety boundaries.
- Provenance, attribution, and a scoped validation record.
- One authorized, curated [MiMo-v2.6-Pro historical case](examples/mimo-v2.6-pro/README.md), not a complete session recording.

There is no installer, binary patch, installation/upgrade script, provider secret, user Profile, private session recording, or cross-version compatibility promise. The reference files depend on the original project context and are not a standalone build.

The inspected source identifies Core `0.2.1-rc.2`; the complete source commit is recorded in [the manifest](provenance.json). Initial implementation: `7443b297a2`; later detection performance maintenance: `26a31687da`. Commit IDs identify provenance, not an official release or a guarantee of remote branch availability.

For this publication, **275 relevant tests across 10 files passed in the original workspace**. That is not a build of this reference repository and is not an accuracy benchmark. See [validation](docs/VALIDATION.md).

## Boundaries

Unknown, signed, encrypted, or opaque replay routes are not made editable by stripping metadata. User/parent cancellation, teardown failure, or policy disposal must not revive a task. Complete protocol tool blocks disable repetition-driven cancellation; a separate settlement budget bounds unfinished output without executing partial arguments.

Legitimate repetition and repetition that would eventually recover can still trigger the heuristic. No zero-false-positive or fixed-latency claim is made.

MIT licensed, retaining the [DeepSeek license](LICENSE). This is an independent reference, not an official endorsement by upstream.
