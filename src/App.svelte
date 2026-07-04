<script lang="ts">
  // Bootstraps the platform adapter, store, and clock (D1/D7/D8/D10), then
  // hands off to AppShell once they exist. Kept deliberately thin — all real
  // UI lives under lib/components.
  import { onMount } from 'svelte';
  import { getPlatform } from './lib/platform';
  import { createTaskStore, type TaskStore } from './lib/store';
  import { createClock, type Clock } from './lib/ui/clock';
  import AppShell from './lib/components/AppShell.svelte';

  let store = $state<TaskStore | null>(null);
  let clock = $state<Clock | null>(null);

  onMount(() => {
    let cancelled = false;
    let liveClock: Clock | null = null;

    (async () => {
      const platform = await getPlatform();
      const s = createTaskStore(platform);
      await s.load();
      if (cancelled) return;
      const c = createClock(platform);
      // D10: flush any pending debounced save before the window closes.
      platform.onCloseRequested(() => s.flush());
      liveClock = c;
      store = s;
      clock = c;
    })();

    return () => {
      cancelled = true;
      liveClock?.destroy();
    };
  });
</script>

{#if store && clock}
  <AppShell {store} {clock} />
{:else}
  <div class="boot-splash">불러오는 중…</div>
{/if}

<style>
  .boot-splash {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    color: var(--color-text-muted, #9a9ca3);
    background: var(--color-bg, #1c1d20);
  }
</style>
