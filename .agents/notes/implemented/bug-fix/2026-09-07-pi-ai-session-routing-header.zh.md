# Agent Note: pi-ai 适配器发送会话路由头

Status: implemented

[English](2026-09-07-pi-ai-session-routing-header.md) | 中文

## Problem

Harness 的模型请求通过 `x-deepseek-harness-session-id` 携带会话身份，上游据此把同一会话路由到同一路径并复用其 prompt 缓存。直连的 DeepSeek 适配器在每个请求上都加盖该头，而基于库的 pi-ai 适配器没有：它把 `GenerateOptions.sessionId` 传进了 pi-ai 的流选项，但 pi-ai 只在默认关闭的 `sendSessionAffinityHeaders` 兼容开关下才把该值变成 HTTP 头。因此经由 pi-ai 路由的请求——包括 OpenCode Go，它在模型请求缺少会话头时以 `MissingSessionID` 拒绝——会失败本轮或丧失路由与缓存亲和。OpenCode 文档声明其识别 harness 的原生头，所以发送同一个头即是修复；不需要 Go 专用的头。

## Decision

`llm-pi-ai` 的 `requestHeaders()` 现在接受请求的 `sessionId`，在其存在时连同 attribution 与 profile 头一起发出 `x-deepseek-harness-session-id`。profile 头无法覆盖它——会话头属于 Harness 所有，排在部署自有条目之后，与 attribution 的冲突规则一致。`sessionId` 缺省时不发送该头，与 DeepSeek 适配器的条件加盖一致。pi-ai 的 `sessionId` 流选项和 `sendSessionAffinityHeaders` 开关保持不变；该头走既有的按请求 `headers` 合并。

## Alternatives considered

**启用 pi-ai 的 `sendSessionAffinityHeaders`。** 那会发出 pi-ai 自己的 `x-session-id`/`x-session-affinity` 系列，其形态由 pi-ai 及其兼容矩阵决定，且对其他所有 pi-ai 消费者默认关闭。Harness 自有的头把该 wire 事实留在这个仓库的控制之下，并与 DeepSeek 路由和 OpenCode Go 已经期待的内容一致。

**仅为 OpenCode Go 路由添加该头。** 按路由区分的身份会让会话路由行为依赖 provider 表，并把一个按 provider 的特例长进适配器。DeepSeek 适配器已经在每个路由上加盖该头，统一加盖才是对称的选择。

**通过 provider 级 `defaultHeaders` 传递该头。** provider 实例按解析出的 profile 构建，并在多个请求间复用，provider 级的值会把一个会话 id 冻结进之后的每个会话。会话 id 是按请求的状态，应属于按请求的合并。

## Consequences

现在每个 pi-ai 路由都会把会话的 session id 作为 HTTP 头暴露给其端点。把 profile `headers` 当作私有传输的部署不能再用自己的值遮蔽这个名字；该名字为 Harness 保留。之后新增的适配器仍然独立选择是否加盖该头——`LlmAdapter` 契约要求 attribution 但不要求会话路由——所以省略它的新适配器会在对路由敏感的 provider 上重新引入这个故障。

## Testing

`packages/llm/llm-pi-ai/tests/adapter.spec.ts` 使用 mock server 记录的头，断言有会话 id 时该头等于请求的会话 id，无会话 id 时该头缺席。
