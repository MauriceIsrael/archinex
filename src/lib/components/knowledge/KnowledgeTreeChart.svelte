<script lang="ts">
  import { onMount } from 'svelte';
  import { echarts } from '$lib/dashboard/widgets/echarts-custom';
  import type { ECharts } from 'echarts/core';

  let {
    legendData,
    series,
    isDark = true,
    height = '560px',
    onNodeClick
  }: {
    legendData?: Array<{ name: string; icon: string }>;
    series: any[];
    isDark?: boolean;
    height?: string;
    onNodeClick?: (nodeRaw: any) => void;
  } = $props();

  let chartContainer: HTMLDivElement | null = $state(null);
  let chartInstance: ECharts | null = null;

  function renderChart() {
    if (!chartContainer) return;

    if (!chartInstance) {
      chartInstance = echarts.init(chartContainer, isDark ? 'dark' : undefined, {
        renderer: 'canvas'
      });

      chartInstance.on('click', (params: any) => {
        if (params.data && onNodeClick) {
          onNodeClick(params.data);
        }
      });
    }

    const hasLegend = legendData && legendData.length > 0;

    const option: any = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: {
          color: isDark ? '#f8fafc' : '#0f172a',
          fontSize: 12
        },
        padding: [10, 14],
        formatter: (params: any) => {
          const data = params.data;
          if (!data) return '';
          const match = data.match;
          const isMatched = match?.isMatched;

          let badgeHtml = '';
          if (isMatched) {
            badgeHtml = `
              <div style="margin-top: 6px; padding: 3px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; font-weight: bold; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                <span>★</span> Éclairé pour le projet actif (Score: ${match.score}%)
              </div>
            `;
          }

          let reasonsHtml = '';
          if (match?.reasons && match.reasons.length > 0) {
            reasonsHtml = `
              <div style="margin-top: 6px; font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'};">
                ${match.reasons.map((r: string) => `• ${r}`).join('<br/>')}
              </div>
            `;
          }

          return `
            <div style="max-width: 320px; font-family: ui-sans-serif, system-ui, sans-serif;">
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${isDark ? '#38bdf8' : '#0284c7'}; font-weight: bold;">
                ${data.typeLabel || data.category || 'Concept'}
              </div>
              <div style="font-size: 13px; font-weight: bold; margin-top: 2px; line-height: 1.3;">
                ${data.name}
              </div>
              ${badgeHtml}
              ${reasonsHtml}
              <div style="margin-top: 8px; font-size: 10px; color: ${isDark ? '#64748b' : '#94a3b8'}; border-top: 1px solid ${isDark ? '#1e293b' : '#f1f5f9'}; padding-top: 4px;">
                Cliquer pour ouvrir l'inspecteur d'architecture
              </div>
            </div>
          `;
        }
      },
      series: series
    };

    if (hasLegend) {
      option.legend = {
        top: '2%',
        left: 'center',
        orient: 'horizontal',
        data: legendData,
        selectedMode: true,
        textStyle: {
          color: isDark ? '#e2e8f0' : '#1e293b',
          fontSize: 12,
          fontWeight: 600
        },
        itemGap: 24,
        icon: 'roundRect'
      };
    }

    chartInstance.setOption(option, true);
  }

  $effect(() => {
    // Re-render when series, legendData, or theme changes
    if (series) {
      renderChart();
    }
  });

  onMount(() => {
    renderChart();

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize();
      }
    });

    if (chartContainer) {
      resizeObserver.observe(chartContainer);
    }

    return () => {
      resizeObserver.disconnect();
      if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
      }
    };
  });
</script>

<div class="relative w-full rounded-xl overflow-hidden" style="height: {height}; min-height: {height};">
  <div bind:this={chartContainer} class="w-full h-full" style="height: {height}; min-height: {height};"></div>
</div>
