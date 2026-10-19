# Why place the guard at DSH's output-acceptance boundary?

[English home](../README.en.md) | [中文](LAYERING.zh-CN.md) | [Algorithms and full design](DESIGN.en.md)

## Short answer

The chosen location is **inside the DSH Host, after an adapter produces structured model chunks but before they enter the accepted-output stream**—not merely a UI filter or another instruction telling the model not to loop.

Acceptance here means entry into the common assembly, live-publication, and eventual durable-settlement path. It does not mean every character is immediately written to disk or that UI, network, and disk form an atomic transaction.

Three layers cooperate:

- A **policy plugin** decides when to withhold, release, suppress proven copies, or request interruption and bounded continuation.
- The **Core call loop** owns cancellation, iterator cleanup, safe-prefix settlement, tool execution boundaries, and authorization of another call.
- The **client and stream bridge** present actual state and reconcile reconnects and multiple calls within one Step; they do not decide which hidden backend text becomes history.

This puts intervention where enough semantic information exists without granting a detector unrestricted control over sessions and tools. It is a reference architecture, not the only possible architecture for another harness.

## 1. Why DSH makes this a cross-layer problem

### A model request is more than a text box

```text
Agent / turn / step context
  -> prepared call: adapter, model and replay capability resolved
  -> asynchronous chunks: reasoning, text, tools, usage, finish
  -> output policy: acceptance and possible interruption
  -> accepted stream
       -> block assembly
       -> compact stream record, persisted at settlement
       -> live frames and UI projection
  -> settlement / tool dispatch / next request
```

Reasoning can appear in live display, the final assistant message, a durable stream, and replayed context. Editing one visible copy does not necessarily reduce redundancy in the other representations.

### A plugin does not automatically own the running call

The reference participates through a typed `agent/output-policy` seam. It does not globally monkeypatch every provider SDK or edit installed runtime files.

**That seam includes Core changes introduced for this design.** It must not be advertised as a universally available extension API in every unmodified DSH release. This repository is a fixed technical snapshot, not a promise that an arbitrary installation needs only one added plugin.

See [the call loop](../reference/packages/core/agent-loop/src/agent.ts#L444-L488) and [policy registration](../reference/packages/guard/repeat-tool-reminder/src/reasoning-policy.ts#L218-L258).

### Similar chunks do not imply equal editing rights

Adapters can map different protocols into similar chunk types while retaining different signature, opaque-metadata, and replay requirements. Eligibility must come from the **same prepared call**, not the model's display name or a UI guess.

### Host semantics should not belong to one window

Calls, sessions and tool execution live on the Host/Agent side; Chat presents those facts. Tying detection and cancellation only to a selected conversation, desktop window or mounted page component would make viewing that UI an accidental condition of protection.

Where the policy is actually composed, it should follow the Agent call lifecycle while Web, Desktop, native child agents or other consumers choose their presentation. This does not imply every Profile enables it, or that remounting a component should reset backend state. Desktop window management has separate responsibilities and cannot replace output acceptance and session settlement.

## 2. Why not only another layer?

These layers remain useful. The comparison concerns what each lacks **on its own**.

| Layer | Useful capability | Why it is insufficient alone for these goals |
|---|---|---|
| Prompts/system instructions | Encourage a different approach | The model may repeat the instruction itself; a prompt cannot enforce stream cancellation or prevent history growth |
| Post-tool reminders | Detect repeated tools and arguments | A reasoning loop may never emit an actual tool call, so the hook has no opportunity to intervene |
| UI hiding/folding | Reduce visual noise; offer controls | Backend acceptance, persistence, replay, other views, SDK users and child agents need not depend on this Chat component |
| Provider SDK | Parse protocol; cancel transport or constrain output | It does not independently own DSH turn/step state, durable prefixes, undispatched tools or policy recovery budgets |
| Network proxy/text replacement | Observe protocol bytes and apply central rules | Without application semantics, replacement risks tools/signatures/replay inconsistency; safe integration still needs harness coordination |
| Post-persistence cleanup/compaction | Curate existing context for later use | It cannot undo generation cost or prevent initial accumulation; rewriting history has its own provenance and replay constraints |
| Output limits/general retry | Bound some calls or recover request failures | A limit may arrive too late; unconditional retry can repeat the same contaminated context rather than detect stalled progress |

A UI can invoke backend cancellation, and an SDK can expose safe interception primitives. The point is not that those approaches are impossible. To preserve the prefix, tool, and recovery semantics here, they still need coordination at a boundary that understands the call lifecycle.

## 3. Why after adaptation but before acceptance?

This position combines four requirements:

1. **Actual call capability is known.** Editing can be gated before changing text rather than gambling on later replay.
2. **Events are structured.** Reasoning, ordinary text, tool blocks and finish are distinguishable; a repeated string inside tool JSON need not be treated as reasoning.
3. **Downstream representations have not yet accepted the candidate output.** Withholding and rejecting a tail still have meaning without retroactive rollback across several copies.
4. **The call loop still owns execution.** It can cancel this call, await teardown, settle a safe result and decide whether another request is permitted.

The detector reads original reasoning while downstream receives accepted output. Evidence and committed results are separate: copies another detector managed to remove must not be the sole input to visible-stall detection.

This limits further accumulation only. Earlier delivered repetition does not disappear, and unexposed model state is not observable here.

## 4. Why policy in a plugin, enforcement in Core?

The policy should own bounded evidence, withholding state, tunable thresholds, recovery choices, explanatory prompts, instance counters and disposal authorization.

Core must own the actual iterator and cancellation signal; Agent/turn/step identity and parent cancellation; accepted versus undispatched blocks; successful teardown and durable settlement; and routing that prevents a policy stop from escaping into ordinary retry.

A request to interrupt is not permission for the plugin to fabricate tool results, create another Agent to evade limits, or resume after user cancellation. Conversely, all heuristic thresholds should not be hardcoded into the call loop.

Only one output policy may own a call in this reference. Composing two undefined editors makes ownership of raw text, release, cancellation and final block contents ambiguous. Rejecting that conflict is easier to reason about than silently applying both.

This division is not zero-cost Core integration: the loop, control items and presentation bridge still require explicit contracts. Putting the algorithm in a plugin does not make the execution lifecycle appear automatically.

## 5. Most implementation difficulty is not the repetition score

### Several representations of one original

Filtered deltas followed by an unfiltered full reasoning block can resurrect copies at settlement. [AssistantStreamAttempt.accept](../reference/packages/core/agent-loop/src/assistant-stream.ts#L59-L106) therefore closes controlled reasoning from accepted assembly. Live display, compact records and final messages must agree; a final string replacement is not enough.

### Abort, stopped output and completed cleanup are different moments

Leaving an async iterator can wait for transport teardown. A notice emitted only afterward can leave the user uninformed. Declaring recovery immediately on abort can instead claim a new call started before teardown permits it.

The reference publishes the real local interruption first, requests cancellation, and records continuation only after cleanup and settlement succeed. User cancellation, parent cancellation, teardown failure and persistence rejection cannot all become “retry”. A call-local stop is neither whole-task transactional rollback nor a guarantee of immediate provider billing cancellation.

### Tools are not ordinary text

Partial JSON is not executable. A completed protocol tool block needs settlement protection, while unlimited protection could permit endless output after that block. Repetition protection and an independent settlement budget therefore solve different problems. The detector cannot take credit for validating tool effects or dispatch correctness.

### Bounded continuation must be separate from generic retry

A general retry handler may repeatedly reuse contaminated context or bypass the intended recovery allowance. Continuation needs an attributed prompt, retained prefix, and explicit Agent/turn/policy-instance budget; user cancellation must win.

Native child agents need their own lifecycle boundaries. Recreating instances is not evidence of a durable global quota. The reference's counters remain in memory, and replacement/restart effects must be documented honestly.

### Real-time visibility spans the whole bridge

A translated label in a component is insufficient. A stage must pass from policy to frames, host state, reconnect baseline, client fold and Chat projection. Late frames from old attempts must not contaminate a new one.

Several calls in one Step can otherwise overwrite old thinking or display a generic stopped state. Retained prefixes, current output, an interruption in progress, and a durable continuation need distinct identities. Otherwise persistence can be correct while the active view stays silent until it is reopened.

See [the host baseline](../reference/packages/api/session-controller/src/assistant-stream.ts#L39-L109) and [Chat projection](../reference/packages/client/ui-chat/src/client/conversation-nodes/assistant.ts). Transient stages do not enter model context; recovery prompts deliberately do. They should not be combined merely to simplify rendering.

### Bounded memory does not eliminate CPU or false-positive costs

Valid analysis, code scaffolding, filler words and counters all repeat. Sentence evidence depends on punctuation conventions, and provider chunk boundaries must not change decisions. Negative examples, per-character ceilings, transition ordering and performance fast paths need validation alongside the heuristic itself.

A relatively small detector therefore does not imply a tiny integration: protocol consistency, typed consumers, lifecycle, historical compatibility and tests form a substantial part of the work.

## 6. Practical trade-offs

- **Not zero CoT contamination.** Waiting for evidence and promptly delivering normal reasoning conflict; committed history is not semantically sanitized retroactively.
- **Not equal editing support for every model.** Signed/opaque routes remain usable as models, but cannot gain editing rights by dropping metadata.
- **Not equating stopping with task success.** Tool calls after recovery are useful progress; an explicit bounded failure can also be preferable to indefinite waste.
- **Not guaranteeing a human sees every intermediate stage.** One large delta can contain several quick transitions; truthful final current state matters more than an artificially delayed demonstration.
- **Not guaranteeing session rescue.** Badly redundant history may still need manual curation; automatic summaries, model selection and migration are outside this reference.
- **Not a fixed token-saving claim.** Provider generation, billing and transport cancellation behavior cannot be inferred from a local error code alone.

The layer provides an explainable **damage-limitation and next-decision boundary**, ideally before all remaining context and resources have become looping history.

## 7. Other architectures can be valid

An SDK, middleware layer or unified gateway with complete call semantics could implement a comparable mechanism. A stronger upstream output-governance interface could also make the plugin thinner.

The important question is not the directory name but who owns:

1. Raw versus accepted content truth.
2. Trusted editing capability.
3. Call-local and parent cancellation plus teardown order.
4. Durable settlement, tool dispatch and recovery allowance.
5. Live state, reconnects and durable facts.

Another design that owns these responsibilities can be valid. A duplicate regex or a toast by itself has not addressed the entire problem.

## 8. Evidence scope

This document explains the [pinned reference snapshot](../provenance.json), not extension availability across all official releases. No live-model run, browser acceptance check or full runtime suite was rerun for this documentation update.

The [observed case](../examples/mimo-v2.6-pro/README.md) is limited historical evidence; [validation](VALIDATION.md) describes the tests. Neither substitutes for reviewing another version, adapter or integration layer.

The later [prototypes](../prototype/README.en.md) separately exercise sentence scanning, user authorization and replay boundaries. They add no Host interface, Core integration or installation path and do not transfer those responsibilities to a standalone UI notice.
