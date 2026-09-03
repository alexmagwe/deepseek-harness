# Agent Note: Web command action kind and the /new composer shortcut

Status: implemented

English | [中文](2026-09-02-web-command-action-kind.zh.md)

## Problem

Starting a new chat in the same workspace required reaching for the sidebar's New Session button. A composer shortcut (`/new`) is the natural shape, but the client command surface only offered the popupSelect contribution kind, and a host command is the wrong carrier for a per-client navigation fact.

## Decision

The client command contract gains an `action` contribution kind: a menu pick or a bare Enter consumes the token and runs the contribution's `run(session)` immediately — no popup, no host RPC, no session-log event. An argued line (`/name args`) falls through to the default sink; a bare submission carrying images refuses exactly like the popup kind; a throwing action routes to the session's composer-notice channel. Decorations remain popupSelect-only.

`/new` is the first consumer: the ui-workspace client half registers the contribution and drives the shared `startSession` verb — blank-Session reuse or creation in the current Workspace with the recent-Workspace fallback — hidden for addressed subagent sessions like other Agent-bound entries.

## Alternatives considered

**Host command on `ctx.commands`.** Rejected: navigation is per-client browser state; a host command would log `command/run`/`command/done` into the old session's log for a fact that log does not own, and would still need new host-to-client machinery to move any client's selection.

**Reuse popupSelect with a single option.** Rejected: a one-row picker adds an interaction step and imitates a decision the command has already made.

## Consequences

Client-local UI verbs have a first-class contribution shape; the `command/executed` acknowledgment stays host-command-only. An action that must reach other clients or survive a reload needs a durable session event instead of this kind.
