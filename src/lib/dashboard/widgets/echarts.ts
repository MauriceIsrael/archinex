import type { EChartsOption } from './echarts-custom';

/**
 * Svelte Action to render ECharts.
 * Usage: <div use:chart={options} class="w-full h-full"></div>
 *
 * @performance
 * - Import dynamique (lazy) → exclu du bundle principal.
 * - Import depuis echarts-custom.ts → tree-shaking radical.
 *   Seuls BarChart + PieChart + composants UI sont chargés.
 *   ~1.1 MB minifié → ~200 kB minifié (375 kB → ~65 kB gzip).
 */
export function chart(node: HTMLElement, options: EChartsOption) {
  let chartInstance: import('echarts/core').ECharts | undefined;
  let isDestroyed = false;
  let currentOptions = options;

  async function init() {
    try {
      const { echarts } = await import('./echarts-custom');
      if (isDestroyed || !node) return;
      chartInstance = echarts.init(node);
      if (currentOptions) {
        chartInstance.setOption(currentOptions, true);
      }
    } catch (err) {
      console.warn('[ECharts] Init or setOption failed:', err);
    }
  }

  // Lance l'init sans bloquer
  init();

  // ResizeObserver to handle container resizes automatically
  const resizeObserver = new ResizeObserver(() => {
    try {
      if (chartInstance && !isDestroyed) {
        chartInstance.resize();
      }
    } catch (err) {
      console.warn('[ECharts] Resize failed:', err);
    }
  });

  try {
    resizeObserver.observe(node);
  } catch (err) {
    console.warn('[ECharts] ResizeObserver observe failed:', err);
  }

  return {
    update(newOptions: EChartsOption) {
      currentOptions = newOptions;
      try {
        if (chartInstance && !isDestroyed && newOptions) {
          chartInstance.setOption(newOptions, true);
        }
      } catch (err) {
        console.warn('[ECharts] Update setOption failed:', err);
      }
    },
    destroy() {
      isDestroyed = true;
      try {
        resizeObserver.disconnect();
      } catch {}
      try {
        if (chartInstance) {
          chartInstance.dispose();
          chartInstance = undefined;
        }
      } catch {}
    }
  };
}
