// A single Svelte context object carrying the store/clock plus the
// cross-cutting UI singletons (context menu, modals, snackbar) owned by
// AppShell. Every component below AppShell reads it via `useUi()` instead of
// prop-drilling the store through Section -> Column -> BlockNode.

import { getContext, setContext } from 'svelte';
import type { TaskStore } from '../store';
import type { Clock } from '../ui/clock';
import type { Annotation } from '../domain';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuRequest {
  x: number;
  y: number;
  items: MenuItem[];
}

export type ModalRequest =
  | {
      kind: 'annotation';
      heading: string;
      initial?: Annotation;
      submitLabel: string;
      onSubmit: (annotation: Annotation) => void;
      onCancel?: () => void;
    }
  | { kind: 'warning'; message: string }
  | { kind: 'confirm'; message: string; confirmLabel: string; onConfirm: () => void };

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

export interface UiApi {
  store: TaskStore;
  clock: Clock;
  openMenu(request: MenuRequest): void;
  closeMenu(): void;
  openModal(request: ModalRequest): void;
  closeModal(): void;
  showSnackbar(message: string, action?: SnackbarAction): void;
}

const UI_KEY = Symbol('tpt-ui');

export function setUiContext(api: UiApi): void {
  setContext(UI_KEY, api);
}

export function useUi(): UiApi {
  const api = getContext<UiApi>(UI_KEY);
  if (!api) throw new Error('useUi() called outside of <AppShell>');
  return api;
}
