// Tiny Svelte actions shared across components.

/** Focus an element as soon as it is mounted (native `autofocus` is unreliable
 * for elements inserted after initial page load, e.g. inline edit inputs). */
export function focusOnMount(node: HTMLElement): void {
  node.focus();
}
