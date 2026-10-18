# 验证口径 / Validation record

[中文首页](../README.md) | [English home](../README.en.md)

## 本次实际执行 / Executed for this publication

2026-10-18，在来源清单指定提交对应的原始 DSH 源码工作区中，使用 Node `v24.13.0` 和 Vitest `v4.1.11` 执行相关测试：

**10 个测试文件，275 项通过，进程退出码 0。**

These tests ran in the original DSH workspace, not as a standalone build of this reference repository. The inspected root manifest reports Core `0.2.1-rc.2`.

范围包括 / Scope:

| 原项目测试范围 | 主要证据 / Evidence |
|---|---|
| `packages/guard/repeat-tool-reminder` | 精确副本、停滞检测、句子辅助函数、策略组合和既有工具提醒 / detectors, helpers, policy integration and existing reminders |
| Chat conversation node definitions | 逐事件增量投影、保留前缀、恢复与重放 / incremental fold, retained prefixes, recovery and replay |
| Chat branch-tail components | 提示文案、展开内容与状态优先级 / notice presentation and precedence |
| Session controller assistant stream, host + client | 阶段传输、重连基线、attempt 归属和结算退场 / bridge, baseline, attempt identity and settlement |
| pi-ai plain reasoning | 重放能力边界和不透明元数据拒绝 / replay capability and metadata rejection |

参考仓库保留了[检测器和策略测试快照](../reference/packages/guard/repeat-tool-reminder/tests/reasoning-policy.spec.ts)及[脱敏测试语料](../reference/packages/guard/repeat-tool-reminder/tests/reasoning-fixtures.ts)。其余范围用于说明本次原项目验证，**不宣称所有测试文件均复制进了本仓库**。

Representative detector/policy tests and de-identified fixtures are included. Other rows describe the original-workspace verification, not additional files bundled here.

## 关注的性质 / Properties being checked

1. **正常输出不先缓冲**：未出现足够证据时立即输出；正常分析、带新标识符/编号/否定判断的内容不应仅因短填充词反复而被截断。
2. **chunk 边界不改判定**：逐字符与大 delta 的结果一致；同 delta 中多个真实迁移不被覆盖掉。
3. **硬上限**：检测窗口逐字符受限；大确认次数不把上限变成周期性无条件放行。
4. **原因标签**：无 hold 围栏不产生阶段；holding 中进入有效围栏释放，标记为 `barrier` 而非假称重复率回落。
5. **文本保真**：恢复释放按原顺序；已证实副本不会通过受控 reasoning block-end 被重新灌回；已显示前缀不被新 thinking 覆盖。
6. **立即通知**：可控的延迟 iterator cleanup 尚未结束时，已经产生真实 `REASONING_LOOP` finish；这时还没有伪造 durable settlement 或提前续跑。
7. **有限恢复**：次数来源真实，预算耗尽是失败；不能进入普通无限 retry。
8. **取消与生命周期**：用户/父级取消和策略 dispose 不产生幽灵 release 或恢复；旧 attempt 不污染当前状态。
9. **工具边界**：真实工具块保护结算；独立结算预算超限不会派发工具或自动续跑。
10. **实时与历史不混淆**：stage 不进入 token 流和模型输入；活动重连恢复最近阶段；已结束历史保留 durable 截断/续跑事实，不伪造探测流水账。

The suite checks these properties rather than claiming a universal semantic-loop classifier. Read the copied tests for the exact assertions and fixtures.

## 发布内容完整性 / Publication integrity

[provenance.json](../provenance.json) 对每份参考源码记录：原路径、选取的完整 Git 提交、大小和 SHA-256。文件直接从已提交对象导出；源工作区的未提交 lockfile 改动不属于本参考快照。

Publication checks compare each reference file with its committed source bytes, inspect local documentation links, and screen publication files for private host paths, credentials, user configuration, and session recordings. The MIT copyright and license are retained.

这些校验不需要安装、重启或修改任何用户 DSH 实例。本仓库不附带执行校验的安装脚本。

## 不代表什么 / What this does not establish

- **没有在本参考仓库独立构建**：摘录依赖原项目 workspace 类型、服务和测试基础设施。
- **没有在此次发布流程中重新调用真实模型**，不声称某家供应商所有路由都支持可编辑重放。
- **没有在此次发布流程中做真实浏览器交互验收**；节点/组件测试不等同于人眼看到每个中间阶段。
- **没有重新执行原项目全量 lint、文档生成、全量类型检查、全部 native 构建或完整覆盖率统计**。相关测试通过不等于整个 Core 的所有门禁通过。
- **没有给出召回率、误报率或固定截断时延**，没有发布完整私密会话或模型评测语料集；新增的[授权脱敏个案](../examples/mimo-v2.6-pro/README.md)只是有限的观察摘录。
- **不是跨版本应用保证**，也不是对目前所有 DSH/模型组合的认证。

No live-model, browser-interaction, whole-Core release-gate, coverage, accuracy, or cross-version compatibility result is implied by the 275-test count.

## 后续补充：真实历史案例 / Additional historical observation

[MiMo-v2.6-Pro 案例](../examples/mimo-v2.6-pro/README.md)只读核对了一段真实的中断结算、恢复提示、后续工具调用以及 turn 结束记录，并公开 165 个 UTF-16 码元的原文连续短摘录。另一独立 turn 的数量摘要保留了恢复后仍最终失败的事实。

这不是重新调用模型，不是用当前检测器离线重放后冒充原始实测，也不改变上面的 275 项测试统计。案例隐藏原会话身份和项目细节；历史 source 缺失的 ordinal/limit 没有补造。实时 stage、准确历史构建/配置与检测延迟均没有从持久数据推断。

The added case is a curated historical observation, not a new live-model run, accuracy benchmark, or replayable Session export. It does not change the 275-test count. It preserves both an observed recovery and a separate eventual failure without exposing the private session.

## 已知限制 / Known limitations

- 合法重复和本会稍后自愈的重复可能被提前截断；语义相同但缺少足够精确句子/片段复现的循环可能漏过。
- 无完整句子终止符的流不满足句子证据，可能只能依靠精确周期检测。
- 围栏仅暂停可见停滞分支，精确副本分支仍不理解代码的语义合法性；围栏识别等待完整行。
- 默认只治理首个选中的 reasoning index，不是最终答案去重器。
- 8192 是可见停滞窗口的码元上限，不是总内存上限；其他缓冲和匹配数据另有成本。
- 输出量预算不是超时，供应商无输出时依赖适配器 watchdog；取消发出后也不保证供应商已停止计费。
- 恢复计数按 Agent/turn/策略实例在内存中维护，不是跨进程全局配额。
- 在当前源码中，受工具保护时也可能主动放行仍满足重复证据的缓冲。此路径可能共用 `released` stage，因此 UI 的“重复率回落”标签不能被当作所有放行情形的严格原因证明；显式 `barrier` 原因则另有区分。本技术仓库记录此粒度限制，不修改参考实现。
- 截断结算至新恢复事件之间可能短暂呈现上次恢复状态；整个 Step 终止仍由持久结算/错误事实收敛。

These are product trade-offs and implementation limits, not waived assertions hidden behind a green test count.
