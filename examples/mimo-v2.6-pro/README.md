# MiMo-v2.6-Pro：真实循环拦截与续跑案例

[中文首页](../../README.md) | [English home](../../README.en.md) | [结构化摘录 / Curated events](observed-events.json)

## 案例性质

这是从一条真实历史会话中选出的**少量、经授权公开的脱敏记录**，不是合成正例，也不是把今天的检测器离线跑在旧文本上得到的结果。

消息中记录的模型 ID 为 `mimo-v2.6-pro`，本文展示名为 **MiMo-v2.6-Pro**。这只是该型号的一次具体观察，不表示该型号总会循环，也不能用于和其他模型比较质量。

公开材料不包含原会话 ID、原始事件序号、绝对时间、本机路径、供应商端点、工具参数、工具返回正文或项目标识。事件标签 A–E 是本案例重新编排的标签；它们不是原日志的序号。中间事件有省略，因此不是连续日志或可直接重放的 Session 文件。

## 1. 拦截前：不断说要调用工具，但该条消息没有工具调用

被中断的 assistant 消息包含 **13,328 个 UTF-16 码元的已接纳 reasoning 前缀**，没有 `tool-call` block。下面仅公开该前缀末尾连续的 **165 个 UTF-16 码元**，内容逐字保留；更早的项目讨论和代码已省略：

```text
让me执行 2 个 edit。

好。

我直接调用 edit 工具。

执行。

好。

（果断，直接调用。）

让me执行 edit 修正测试。

好。

我直接调用 edit。

执行 2 个 edit。

好。

果断，不循环。

让me执行 edit 修正测试 1 和测试 2。

好。

我直接调用 edit 工具。
```

这段输出反复自我要求“执行”“不循环”，但这些词句本身不是工具协议调用。其保留意义是展示循环的可见形态，而非暴露具体项目任务。

短摘录的 UTF-8 SHA-256：

```text
11e14810b6d223305194b3e7de0f9a268bf87a790aed39a831120a648e2e8a9a
```

该指纹仅用于检查本仓库短摘录的一致性；由于完整私密会话不公开，它不能作为第三方独立验证原日志真实性的证明。

## 2. 实际拦截记录

该消息的持久结算标记为 `interrupted: true`。其记录的 stream 中存在 `finish`，原因为 `error`，错误码及原文是：

```text
REASONING_LOOP
Reasoning output was interrupted after sustained repetition of nearly identical reasoning sentences.
```

这是原记录中的真实本地策略失败，不是从“用户按了停止”推断出来的，也不是事后补写的检测标签。错误文案指向近似句子反复的路径；这不意味着我们能从摘录恢复当时完整的配置或构建版本。

## 3. 实际恢复提示

后续持久记录中出现一条 `user/message`，专属来源为：

```json
{"kind":"reasoning-loop-recovery"}
```

这条历史记录的 source **只有 `kind`**。没有补造后来接口中的 `turn`、`step`、`attempt`、`limit` 字段，也不把它伪装成人类新发的指令。

恢复提示原文如下，未包含项目内容：

> The preceding reasoning was interrupted after sustained repetition of nearly identical sentences. Its retained prefix is available above exactly as written; the unconfirmed repetitive tail was discarded. Continue the unfinished task using a different approach. Do not repeat that reasoning. Use the actual tool protocol when an action is needed.

它说明保留了前缀、丢弃的是尚未证实的重复尾巴，并要求换一种方式继续未完成的任务、使用真实工具协议。它没有宣称每个被丢弃字符都是已经证明的精确副本。

## 4. 恢复后：出现真实工具调用

同一个 turn、同一个 step 的下一条 assistant 消息仍记录模型为 `mimo-v2.6-pro`。其 reasoning 的首尾如下；方括号是本案例明确标出的脱敏编辑，不是模型原文：

```text
停止循环。[具体测试修改细节已省略]立即调用。
```

随后该 assistant 消息包含 **2 个 `tool-call` block**，日志中也实际出现了对应的 **2 条 `tool/call` 与 2 条 `tool/result`**。

已在本地按原始关联 ID 核对两对调用与结果；两个结果均记录 `isError: false`。工具名称、参数、返回正文和原始关联 ID 均未公开。这说明记录没有把结果标记为工具错误，**不是对工具副作用或整个任务正确性的独立验收**。

经过后续步骤，该 turn 的持久结束原因为 `completed`。这说明记录中的 turn 没有以本次循环错误终止；它不是对最终任务内容正确性的独立验收。

## 5. 不只展示成功：同来源的另一轮确实到达失败边界

同一来源中更早的一个独立 turn 还记录到：

| 观察量 | 值 |
|---|---:|
| `REASONING_LOOP` 中断的 assistant 消息 | 4 条 |
| `reasoning-loop-recovery` 提示 | 3 条 |
| 最终 turn 结束原因 | `error` |
| 最终错误码 | `REASONING_LOOP` |

这组数量体现了实际观察到的有限恢复序列：恢复并非保证成功，也没有在该 turn 中无限继续。它不是上面 A–E 那一轮的事件。

历史 source 没有记录数字形式的恢复上限，所以这里**不补写 `limit: 3`，也不把观察数量冒充完整配置证明**。

## 6. 这个案例不能证明什么

- 不知道当时准确的 guard 构建版本、全部阈值或适配器配置，不能声称它运行的就是本仓库当前源码或默认参数。
- **13,328 是已经保留下来的 reasoning 前缀长度**，不是供应商生成的总长度、被丢弃尾巴的长度、循环起点之后的延迟或水坝的内存占用。已经放行的历史内容不等于检测器仍在暂存它。
- 没有从持久事件伪造 `suspected / released / barrier` 的实时阶段、开始时间或截图。该摘录证明的是中断结算与恢复事实，不是 UI 动画验收。
- 没有重新调用模型，也没有把当前检测器离线回放结果混写成历史实测。
- 这是一则经过筛选的真实案例，不是误报率、召回率、固定响应时延或跨供应商兼容性评测。
- 公开文件是人工策展后的说明性投影，完整私密原日志和提取定位信息不公开，因此不能用本文件独立重放整段会话。

完整的机制与限制仍以[设计说明](../../docs/DESIGN.zh-CN.md)和[验证口径](../../docs/VALIDATION.md)为准。

---

## English summary

This is a **curated historical observation**, not a synthetic positive or an offline rerun presented as a real interception. Both the interrupted and resumed assistant messages record `mimo-v2.6-pro`.

The interrupted message retained 13,328 UTF-16 code units of reasoning and no tool-call block. A verbatim 165-code-unit suffix is shown above; earlier task-specific content is omitted. Its actual persisted stream contains an error finish with `REASONING_LOOP` and the quoted near-identical-reasoning failure message.

An attributed recovery message followed. This older source contains only `kind: reasoning-loop-recovery`; newer ordinal/limit fields are not invented. The next assistant message in the same turn and step emitted two tool-call blocks, followed by two call/result pairs matched locally by their original IDs. Both results report `isError: false`; this is not an independent verification of tool effects or task correctness. Their private arguments/results and IDs are omitted. After later steps, the recorded turn ended as `completed`; that is not an independent judgment of task correctness.

A separate earlier turn recorded four loop interruptions, three recovery messages, then a terminal `REASONING_LOOP` error. Recovery is therefore not presented as invariably successful. The observation is not a substitute for an explicit recorded configuration limit.

Original session identity, event sequence numbers, timestamps, host paths, provider endpoints, and task-specific content are not published. The JSON is an explanatory selection, not a replayable Session export. The accepted-prefix length is not generation length, held-tail size, detection latency, or a memory measurement. No transient stage timeline, screenshot, model benchmark, or exact historical build/configuration is inferred.
