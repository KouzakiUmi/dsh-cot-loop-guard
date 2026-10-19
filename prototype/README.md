# 改进设计原型：用户可控与诚实回放

[仓库首页](../README.md) | [English](README.en.md) | [验证口径](../docs/VALIDATION.md)

> **这是新的独立实验代码，不是已集成的 Core 修复、可安装插件、补丁包或迁移工具。** 原有[参考源码](../reference/README.md)及其[来源清单](../provenance.json)保持原样。运行下列测试不会修改任何 DSH 实例。

## 为什么另设原型目录

Discussion [#10179](https://github.com/deepseek-ai/deepseek-harness/discussions/10179) 的交流指出了三个值得具体验证的问题：英文句子边界、恢复策略的用户控制权，以及回放工具是否真的保持每次调用与流式判定位置。

直接改写历史快照会破坏“这些字节来自既定 Core 提交”的来源承诺。因此本目录放置新的、范围有限的原型；历史实现和新设计可以对照，但不能把原型结果写成已经升级了运行中的守卫。

## 1. 英文句子边界原型

源码：[sentence-units.mjs](src/sentence-units.mjs)，测试：[sentence-units.test.mjs](test/sentence-units.test.mjs)。

- 支持原有中文/感叹号/问号/分号/换行边界，并识别**后接空白的英文句号**；句号后允许先出现闭引号或闭括号。真实输入结束也可以结算末尾句号。
- 不把一个 delta 的结束当作输入结束。`file.` 与下一块 `txt` 应连成同一段，不能因供应商分包而改判。
- `3.14`、`v1.2.3`、`127.0.0.1`、`src/a.b.ts` 和 URL 内部的点不直接切句；省略号和终止符串不会制造空单位。
- 按 trim 后的完整单位计数，`完好。` 不会被当作 `好。` 的副本。同时给出 novelty 与重复出现占比，但它们是**不同统计量**，没有自动套用新阈值。
- 单个待定单位最多保留 8192 个 UTF-16 码元。超长单位整段不计入，明确标记覆盖不完整；不会保留尾巴并冒充完整句子。

### 局限与集成前提

这不是自然语言分词器：`Dr.` 等缩写仍可能被切开，无空白的英文句号可能无法分句。它也不解析代码、Markdown 或供应商协议。真正接入检测器时，仍需保留围栏保护、观察窗、组合证据与误报验证。

当前只验证了边界扫描和统计，没有把新规则接进历史 `VisibleStallWatch`，也没有据此宣布英文误报率或召回率已经改善。扫描器的 8192 上限不涵盖调用者保存的单位数组、整份回放数据或统计表。

## 2. 用户授权下的有限恢复原型

源码：[recovery.mjs](src/recovery.mjs)，测试：[recovery.test.mjs](test/recovery.test.mjs)。

**用户优先不是禁止自动化，而是自动动作必须来自用户选择。** `RecoveryBudget` 要求显式传入 `maxRecoveries`，原型不替用户设定默认模式：

- `0`：只止损和提示，不授权自动恢复。
- `N > 0`：最多授权 N 次恢复，**不包含初始调用**。一次循环不是对模型或会话的终身判决。
- 工具边界不补回恢复次数。重复或迟到的 attempt 通知不重复授权。
- 用户/父级取消、策略停用、清理失败、持久结算失败、非可编辑重放，以及工具结算超限，均不能变成下一次恢复。
- 停止建议是 `presentation-only` 数据：检查现有状态、考虑整理/压缩上下文、准备交接。它不是发送给模型的指令，更不是自动执行这些操作。

### 授权意图不等于调用已经执行

模块返回 `recover` 或 `stop` 等**意图**，不调用模型、工具或任何 DSH 服务。额度在授权时保守扣除，即使后续没有真正发出请求也不自动退款。未来 Host 集成必须在真正 dispatch 前重新检查取消和策略状态；本模块无法撤销一个已经被外部执行的动作。

生命周期布尔值必须由可信 Host 适配层提供，不能根据模型文本猜测。`attempt` 要在同一范围内单调递增，不能取 turn/step 作为每次调用的唯一标识。

`scope` 只标识调用者持有的稳定预算范围；它本身不创建持久存储。新建控制器会获得新额度，因此调用者不能在每个工具块或每次恢复时重建它。它不是跨 Agent、turn、进程的全局配额，也没有自动会话隔离。

历史 Core 快照仍默认允许一次恢复，并支持设为零；原型要求显式选择，不表示已经改掉 Core 默认值或已有设置界面。

## 3. 按独立 attempt 回放，而不是只看最后尾巴

源码：[replay.mjs](src/replay.mjs)，测试：[replay.test.mjs](test/replay.test.mjs)。

### 读入范围

`readRecordedAttempts(events)` 接受**已经解析的 JSON 事件数组**，读取：

- `assistant/message.data.stream`；
- `assistant/attempt.data.stream`。

每条结算事件保持独立，即使它们拥有相同的 turn/step。紧凑文本 run 保留各 fragment 的顺序和边界；工具参数仍是工具参数，不转换成 reasoning。reader 不从最终 block 正文再造第二份 delta。

未知记录、缺失 stream、异常紧凑 run、缺失/重复/非末尾 finish 均报告不完整。包括旧 `assistant/chunk` 在内的未支持流事件会显式报警。普通 user/tool 等事件记录在忽略清单中，空输入不会获得“完整”结论。

本原型**不直接读取 JSONL、Zstd 或全部历史会话格式**，不声称兼容所有 DSH 版本，也不是完整 Core 协议验证器。调用者需先用正确的源格式读取器取得事件，并保留其读取覆盖率。

### 回放方式

`replayRecordedAttempts(report, createPolicy)` 对每个完整 attempt 创建新策略实例，逐 chunk 调用策略自己的 `push`，再 `flush`。它不复制一份所谓同等检测公式，也不只检查最终尾部。同一已加载模块内，跨 attempt 或跨多次回放函数调用复用同一个策略对象都会被拒绝；模块用 WeakSet 登记，避免为此永久持有对象。不同对象仍可能共享外部闭包状态，所以工厂有责任真正创建独立的调用状态；对象身份检查不等于通用的隐藏状态隔离证明。

输出始终携带 reader 覆盖报告；不完整 attempt 不会被评价成零命中。首次中断发生的 **chunk 序号**会保留，即使输入最后又恢复成正常文本。没有凭空推导同一大 delta 内的准确字符触发位置。

回放也统计策略交出的 reasoning delta 长度，以便检查实验策略是否真的扣留了内容，而不只是记录一个“发现循环”标签。测试里的小型 withholding 策略是**驱动器夹具，不是现有守卫算法或检测准确率基准**。

对其他分析器的要求也应精确：[对方当前代码](https://github.com/argszero/cordis-plugin-thinking-loop-guard/blob/441269f0b7f1489b2fe56c658e6fffde0eaf8c80/tools/analyze-session.mjs#L318-L344)的 novelty 分支已经逐 reasoning delta 更新并保留首次达到阈值的情况，不能说所有规则都只看最终尾部。这里要求的是每次 attempt 保持独立、保留有序事件，并复现各规则实际判定的位置与节奏；当前驱动器只统计中断和已接纳 delta，没有自动断言全部缓冲/放行状态迁移。

### 不可跨越的证据边界

持久 stream 已经是接纳后的记录，可能没有原始供应商尾巴。没有命中不代表原始请求健康；也不能用这些记录恢复被丢弃字符数、真实检测延迟、完整最终 block 一致性、传输清理、计费或任务正确性。

补齐 `assistant/message` 事件的 `data.stream` 读取，只补齐了记录格式，不会补回原始输入：

| 验证目的 | 所需输入 |
|---|---|
| 已接纳前缀及恢复提示是否正确持久化 | 守卫运行后的记录 |
| 原检测位置、实际暂存/丢弃范围 | 守卫处理前的完整有序流，或可控合成流 |
| 本来稍后会自行恢复的样本是否被提前截断 | 包含后续内容的完整反事实样本，不能只有截断前缀 |

如果继续做合作评测，应先对齐脱敏格式、attempt 边界和标签；可从合成样例开始。分享额外真实原始轨迹须另行取得授权，不能把“愿意合作”当作公开用户会话的许可。本原型没有采集原始流或上传数据的功能。

回放驱动器不能替代 Core 生命周期测试。接入真实策略时，还需要分别验证能力门、父级取消、最终 block、防止普通 retry 绕过预算，以及实时/持久呈现一致性。

## 运行独立测试

在仓库根目录，用 Node.js 24.x；实际验证版本为 **v24.13.0**。没有第三方依赖，不需要 `npm install` 或 DSH 源码工作区：

```bash
node --test prototype/test/sentence-units.test.mjs prototype/test/recovery.test.mjs prototype/test/replay.test.mjs prototype/test/integrity.test.mjs
```

当前运行结果及证据范围见[验证记录](../docs/VALIDATION.md)。[完整性测试](test/integrity.test.mjs)会比对原有 23 份源码的大小和 SHA-256，防止原型被误写进历史快照。

Node 接口依据：官方 [24.x test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)、[assert](https://nodejs.org/docs/latest-v24.x/api/assert.html)、[文件 URL](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-url-paths)与 [crypto hash](https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-hash)；通过 Context7 核对后，在本机实际执行验证。

## 尚未做的事情

- 没有集成或修改 Core、桌面壳、生产配置或安装器。
- 没有自动压缩、交接、选择模型、迁移、锁死会话或执行工具。
- 没有全量运行原项目测试，也没有新增真实模型调用或浏览器验收。
- 没有发布完整真实会话、供应商原始输出语料或跨版本安装承诺。
- 没有把合成原型测试统计与历史 Core 的 275 项测试合并成一次运行结果。

本目录按仓库 [MIT 许可](../LICENSE)提供，是独立实验，不代表上游提供、采纳或认证了这些新实现。
