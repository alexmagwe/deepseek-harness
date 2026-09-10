# Agent Note: The Models page declares whether a model accepts images

Status: implemented

English | [中文](2026-09-07-model-editor-image-modalities.zh.md)

## Problem

The Models page could configure a pi-ai row's id, display name, context window, and output cap, but not whether the model accepts images. The adapter already resolves an entry's `input` list, then the installed catalog entry, then the route's `defaultInput` ([route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md)), so the capability existed in the settings document; only the page that hand-declares providers could not express it. The motivating case is that page's own: an OpenAI-compatible gateway serving a vision model, added through **Add a custom provider**, reported text-only, and the three admission points that read modalities — model selection, prompt admission, and `read_image` — refused the image with advice to select an image-capable model the user had no way to create there.

The fold holding a row's extra fields was also labeled **Capacities**, which stopped describing its contents the moment anything else joined them.

This note reverses the "No configuration surface edits `input`" decision of the note above and leaves its other decisions, the resolution chain in particular, in force.

## Decision

A row's advanced fold gains an **Accepts images** checkbox: checking it stores `input: [text, image]`, clearing it stores `input: [text]`.

**Both states are written explicitly rather than removing the field when images are off.** An absent list asks the next level — the catalog entry, then the route's `defaultInput` — and a route whose default admits images would re-admit them for a model the user just declared text-only. That is the over-claiming direction: prompt admission commits the image durably before the provider can refuse it, and the same misdeclared model can fail again on every later request that still carries the image. `[text]` states the user's answer where the chain reads it first.

**A row that declares nothing of its own shows unchecked.** The page holds only the drafted rows, so the catalog entry and the route default that would answer instead are unreadable here — the limit the capacity placeholders already accept. Clearing the checkbox is therefore a declaration, not a claim about what the route served before.

**The disclosure is renamed "Model details".** Both editors share that copy, and the DeepSeek catalog editor's contents — two capacities — remain details of the model, so one name serves both.

**The DeepSeek catalog editor is unchanged.** That adapter's image entries also carry per-model request limits (`imagePixelBudget`, `imageMaxBytes`), which this page does not edit; a declaration there without them would leave the capability half-configured, and the official route already ships its vision entry.

## Alternatives considered

**Clearing the checkbox removes `input`.** Rejected: absent means "ask the catalog, then the route", so a text-only declaration would silently widen to whatever the route default admits — the failure the explicit write exists to prevent — and the control could not express text-only on such a route at all.

**A three-state control (inherit / text / images).** Rejected: the inherit state cannot be displayed truthfully, because the catalog entry and route default it resolves to are not readable on this page. A control whose third option reads as one value while meaning another is worse than a control that declares the row's own answer.

**A provider-scoped capability switch.** Rejected: modalities are a per-model property and the models on one route disagree about them, so a provider-scoped control could only be set to a value some rows reject — the reason reasoning effort is not editable on the card either.

## Consequences

A vision model on a custom provider costs one checkbox, and the three admission points then admit images on it. The declaration is still unverified: a model declared image-capable whose gateway serves text fails at the provider after prompt admission, the durable image stays in the session log, and recovery is correcting the declaration or selecting a text-only route.

A hand-written `input` list survives until the user toggles that row, because a row patch spreads the stored entry before applying the control's change. The page now writes an array-valued field beside its strings and counts.

## Testing

`packages/client/ui-settings-models/tests/provider-form.client.spec.tsx` covers the edit card (declaring images on one row without touching a neighbour's, and storing text-only explicitly when images are cleared) and the create card (a vision model created with its modalities). `ModelListEditor.tsx` stays inside the per-file coverage gate.
