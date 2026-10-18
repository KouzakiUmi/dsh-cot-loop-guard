# 参考源码索引 / Reference source index

[中文首页](../README.md) | [English home](../README.en.md)

这里保存已提交源码的精确快照，原项目路径保留在 `reference/packages/` 下。文件中的 workspace 导入、样式导入和模块扩展依赖原项目；**不可把它们当成可安装插件或独立工程**。

These files are byte-exact committed snapshots for reading. Their imports and service contracts depend on the original project. There is intentionally no package manifest, installer, or supported patch-application workflow.

| 阅读顺序 / Area | 源码 / Source | 作用 / Role |
|---|---|---|
| 1. 插件边界 | [index.ts](packages/guard/repeat-tool-reminder/src/index.ts) | 工具提醒与可选 reasoningLoop 分开 / advisory reminders versus optional editing |
| 2. 策略 | [reasoning-policy.ts](packages/guard/repeat-tool-reminder/src/reasoning-policy.ts) | 双检测器组合、恢复预算与来源 / detector composition, recovery budget and attribution |
| 3. 精确副本 | [reasoning-watch.ts](packages/guard/repeat-tool-reminder/src/reasoning-watch.ts) | 精确证据、待定区间与抑制 / exact evidence, pending spans and suppression |
| 4. 水坝 | [visible-stall.ts](packages/guard/repeat-tool-reminder/src/visible-stall.ts) | 联合指标、扩窗、围栏与阶段 / metrics, growth, fences and stages |
| 5. 性能维护 | [sentence-units.ts](packages/guard/repeat-tool-reminder/src/sentence-units.ts) | 终止符预检查、低分配模式检查 / precheck and lower-allocation pattern check |
| 6. 调用生命周期 | [agent.ts](packages/core/agent-loop/src/agent.ts) | 本次调用取消、清理、结算、续跑 / call-local cancellation, cleanup, settlement, continuation |
| 7. 帧与持久流 | [assistant-stream.ts](packages/core/agent-loop/src/assistant-stream.ts) | 接纳内容与纯呈现阶段分流 / accepted stream versus presentation stages |
| 8. 契约 | [runtime-types.ts](packages/core/agent/src/runtime-types.ts) | 输出策略、控制项与 stream frame / policy and frame contracts |
| 9. Host 状态 | [host assistant-stream.ts](packages/api/session-controller/src/assistant-stream.ts) | 活动 attempt 和重连基线 / active attempt and reconnect baseline |
| 10. Client 状态 | [client assistant-stream.ts](packages/api/session-controller/src/client/sessions/assistant-stream.ts) | 临时行、重放、结算退场 / transient rows, replay and retirement |
| 11. 展示事件 | [events.ts](packages/api/session-controller/src/client/contract/events.ts) | chunk 与 stage 的联合载荷 / discriminated presentation payload |
| 12. Chat 投影 | [assistant.ts](packages/client/ui-chat/src/client/conversation-nodes/assistant.ts) | retained、recovery、interruption、stall |
| 13. Chat 数据 | [chat-nodes.ts](packages/client/ui-chat/src/client/contract/chat-nodes.ts) | 展示模型 / presentation data |
| 14. Chat 行 | [AssistantNodeView.tsx](packages/client/ui-chat/src/client/chat/AssistantNodeView.tsx) | 安全前缀和当前调用 / retained prefixes and current call |
| 15. 提示 | [RecoveryNotice.tsx](packages/client/ui-chat/src/client/chat/RecoveryNotice.tsx) / [样式](packages/client/ui-chat/src/client/chat/RecoveryNotice.module.css) | 实时阶段和可展开提示 / stage notice and prompt |
| 16. 重放能力门 | [plain-reasoning.ts](packages/llm/llm-pi-ai/src/plain-reasoning.ts) | 签名拒绝与原文重放 / signature rejection and plain replay |
| 17. 最终块 | [assembler.ts](packages/llm/llm/src/assembler.ts) | 从已接纳推理关闭 block / close reasoning from accepted content |

## 代表性测试 / Representative tests

- [reasoning-policy.spec.ts](packages/guard/repeat-tool-reminder/tests/reasoning-policy.spec.ts)：真实 loop 组合、取消、预算、stage 与持久流隔离。
- [reasoning-watch.spec.ts](packages/guard/repeat-tool-reminder/tests/reasoning-watch.spec.ts)：精确副本与释放边界。
- [visible-stall.spec.ts](packages/guard/repeat-tool-reminder/tests/visible-stall.spec.ts)：水坝正反例、围栏、硬上限、chunk 不变性。
- [sentence-units.spec.ts](packages/guard/repeat-tool-reminder/tests/sentence-units.spec.ts)：性能维护辅助函数。
- [reasoning-fixtures.ts](packages/guard/repeat-tool-reminder/tests/reasoning-fixtures.ts)：脱敏/合成的循环与正常进展示例。

共 23 份源码/测试快照。每份的原始路径和指纹见[来源清单](../provenance.json)。

23 source/test snapshots are included. Tests depend on original-workspace infrastructure; publication validation is described in [the validation record](../docs/VALIDATION.md), not implied to run here independently.
