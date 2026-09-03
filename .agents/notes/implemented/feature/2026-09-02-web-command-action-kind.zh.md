# Agent Note: Web 命令 action 型与 /new composer 快捷方式

Status: implemented

[English](2026-09-02-web-command-action-kind.md) | 中文

## 问题

在同一工作区新建会话需要去点侧边栏的「新会话」按钮。composer 快捷方式（`/new`）才是自然形态，但客户端命令表面此前只提供 popupSelect 贡献项，而宿主命令承载不了一个按客户端计的导航事实。

## 决策

客户端命令契约新增 `action` 贡献项：菜单选中或裸回车会消费 token 并立即执行贡献项的 `run(session)`——无弹窗、无宿主 RPC、无会话日志事件。带参数的行（`/name args`）落入默认通道；携带图片的裸提交与 popup 型一样拒绝；抛错的 action 路由到会话的 composer 通知通道。装饰项仍仅限 popupSelect。

`/new` 是首个消费者：ui-workspace client half 注册该贡献项并驱动共享的 `startSession` 动词——在当前 Workspace 复用空白 Session 或新建（回退到最近的 Workspace）——与其他 Agent 绑定条目一样对被寻址的 subagent 会话隐藏。

## 考虑过的替代方案

**宿主命令（`ctx.commands`）。** 否决：导航是按客户端计的浏览器状态；宿主命令会把 `command/run`/`command/done` 写进旧会话的日志，而该日志并不拥有这一事实，且仍需新的 host→client 机制才能移动任何客户端的选中项。

**复用 popupSelect 并只放一个选项。** 否决：单行选择器多了一次交互步骤，且在模仿一个命令已经做出的决定。

## 后果

客户端本地的 UI 动词有了第一类贡献形态；`command/executed` 确认仍为宿主命令专属。需要触达其他客户端或跨重载存续的 action 需要持久会话事件，而非本类型。
