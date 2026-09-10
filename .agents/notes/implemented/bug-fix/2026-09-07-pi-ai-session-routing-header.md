# Agent Note: pi-ai adapter sends the session routing header

Status: implemented

English | [中文](2026-09-07-pi-ai-session-routing-header.zh.md)

## Problem

Harness model requests carry the session identity as `x-deepseek-harness-session-id` so upstream routing can keep one conversation on one path and reuse its prompt cache. The direct-fetch DeepSeek adapter stamps that header on every request, but the library-backed pi-ai adapter did not: it forwarded `GenerateOptions.sessionId` into pi-ai's stream options, and pi-ai turned that value into HTTP headers only behind the off-by-default `sendSessionAffinityHeaders` compat flag. Requests through pi-ai routes — including OpenCode Go, which rejects model requests without a session header with `MissingSessionID` — therefore failed the turn or forfeited routing and cache affinity. OpenCode documents that it recognizes the harness's native header, so sending the same header was the fix; a Go-specific header was not needed.

## Decision

`llm-pi-ai`'s `requestHeaders()` takes the request's `sessionId` and emits `x-deepseek-harness-session-id` whenever it is present, alongside attribution and profile headers. Profile headers cannot override it — the session header is Harness-owned and is placed after the deployment-owned entries, mirroring the attribution-collision rule. When `sessionId` is absent the header is omitted, matching the DeepSeek adapter's conditional stamp. pi-ai's `sessionId` stream option and the `sendSessionAffinityHeaders` flag remain untouched; the header rides the existing per-request `headers` merge.

## Alternatives considered

**Enable `sendSessionAffinityHeaders` in pi-ai.** That emits pi-ai's own `x-session-id`/`x-session-affinity` family, whose shape pi-ai and its compat matrix own, and it is off by default for every other pi-ai consumer. The harness-owned header keeps the wire fact under this repository's control and matches what DeepSeek routes and OpenCode Go already expect.

**Add the header only for OpenCode Go routes.** Route-conditional identity would make session routing behavior depend on the provider table and grow a per-provider special case into the adapter. The DeepSeek adapter already stamps the header on every route, so uniform stamping is the symmetric choice.

**Thread the header through a provider-level `defaultHeaders`.** Provider instances are built per resolved profile and reused across requests, so a provider-level value would freeze one session id into every later conversation. The session id is per-request state and belongs in the per-request merge.

## Consequences

Every pi-ai route now exposes the conversation's session id to its endpoint as an HTTP header. A deployment that treats profile `headers` as private transport can no longer shadow that name with its own value; that name is reserved for the Harness. Adapters added later still choose independently whether to stamp the header — the `LlmAdapter` contract requires attribution but not session routing — so a new adapter that omits it reintroduces this failure on routing-sensitive providers.

## Testing

`packages/llm/llm-pi-ai/tests/adapter.spec.ts` asserts the header equals the request's session id when one is present and its absence when none is, using the recorded mock-server headers.
