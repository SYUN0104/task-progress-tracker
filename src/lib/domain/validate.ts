// Runtime schema validation for untrusted AppState payloads (persisted files,
// user imports). Without this, any syntactically-valid JSON would be accepted
// verbatim and could persist corruption or crash the UI (review finding #1).
//
// `validateAppState` NEVER throws on any input and returns a freshly
// constructed, normalized AppState on success or `null` on any structural
// violation. Building new objects also strips unknown/extra fields.

import type { AppState, Block, WorkUnit, BlockStatus, Theme, Annotation } from './types';

const STATUSES: readonly BlockStatus[] = ['active', 'held', 'completed'];
const THEMES: readonly Theme[] = ['dark', 'light'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/** Validate an annotation shape: required string title, optional string body. */
function validateAnnotation(v: unknown): Annotation | null {
  if (!isPlainObject(v)) return null;
  if (!isString(v.title)) return null;
  if (v.body !== undefined && !isString(v.body)) return null;
  const annotation: Annotation = { title: v.title };
  if (v.body !== undefined) annotation.body = v.body;
  return annotation;
}

function validateBlock(v: unknown): Block | null {
  if (!isPlainObject(v)) return null;
  if (!isString(v.id)) return null;
  if (!isString(v.text)) return null;
  if (!isFiniteNumber(v.createdAt)) return null;
  if (!(v.parentId === null || isString(v.parentId))) return null;
  if (!isString(v.workUnitId)) return null;
  if (!isFiniteNumber(v.order)) return null;
  if (!isString(v.status) || !STATUSES.includes(v.status as BlockStatus)) return null;
  const status = v.status as BlockStatus;

  // accumulatedHeldMs / collapsed default when absent, but must be typed if present.
  let accumulatedHeldMs = 0;
  if (v.accumulatedHeldMs !== undefined) {
    if (!isFiniteNumber(v.accumulatedHeldMs)) return null;
    accumulatedHeldMs = v.accumulatedHeldMs;
  }
  let collapsed = false;
  if (v.collapsed !== undefined) {
    if (!isBoolean(v.collapsed)) return null;
    collapsed = v.collapsed;
  }

  const block: Block = {
    id: v.id,
    text: v.text,
    createdAt: v.createdAt,
    parentId: v.parentId as string | null,
    workUnitId: v.workUnitId,
    order: v.order,
    status,
    accumulatedHeldMs,
    collapsed,
  };

  if (v.completedAt !== undefined) {
    if (!isFiniteNumber(v.completedAt)) return null;
    block.completedAt = v.completedAt;
  }

  // A held block MUST carry a numeric heldAt (its frozen elapsed reference);
  // otherwise heldAt is optional and may be number or null.
  if (status === 'held') {
    if (!isFiniteNumber(v.heldAt)) return null;
    block.heldAt = v.heldAt;
  } else if (v.heldAt === null) {
    block.heldAt = null;
  } else if (v.heldAt !== undefined) {
    if (!isFiniteNumber(v.heldAt)) return null;
    block.heldAt = v.heldAt;
  }

  if (v.holdRootId !== undefined) {
    if (!(v.holdRootId === null || isString(v.holdRootId))) return null;
    block.holdRootId = v.holdRootId as string | null;
  }

  if (v.annotation !== undefined) {
    const annotation = validateAnnotation(v.annotation);
    if (!annotation) return null;
    block.annotation = annotation;
  }

  return block;
}

function validateWorkUnit(v: unknown): WorkUnit | null {
  if (!isPlainObject(v)) return null;
  if (!isString(v.id)) return null;
  if (!isFiniteNumber(v.order)) return null;
  const workUnit: WorkUnit = { id: v.id, order: v.order };
  if (v.name !== undefined) {
    if (!isString(v.name)) return null;
    workUnit.name = v.name;
  }
  if (v.color !== undefined) {
    if (!isString(v.color)) return null;
    workUnit.color = v.color;
  }
  if (v.label !== undefined) {
    if (!isString(v.label)) return null;
    workUnit.label = v.label;
  }
  return workUnit;
}

/**
 * Validate an unknown value as an AppState. Returns a fresh, normalized state
 * on success or null on any violation. Safe on any input (never throws).
 */
export function validateAppState(input: unknown): AppState | null {
  if (!isPlainObject(input)) return null;
  if (!Array.isArray(input.blocks)) return null;
  if (!Array.isArray(input.workUnits)) return null;
  if (!isString(input.theme) || !THEMES.includes(input.theme as Theme)) return null;

  const blocks: Block[] = [];
  for (const raw of input.blocks) {
    const block = validateBlock(raw);
    if (!block) return null;
    blocks.push(block);
  }

  const workUnits: WorkUnit[] = [];
  for (const raw of input.workUnits) {
    const workUnit = validateWorkUnit(raw);
    if (!workUnit) return null;
    workUnits.push(workUnit);
  }

  return { blocks, workUnits, theme: input.theme as Theme };
}
