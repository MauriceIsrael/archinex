<script lang="ts">
  import { t } from 'svelte-i18n';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';
  
  import DashboardEngine from '$lib/dashboard/DashboardEngine.svelte';
  import type { WidgetDefinition } from '$lib/dashboard/types';
  import FilterBar from '$lib/dashboard/FilterBar.svelte';
  
  import StatWidget from '$lib/dashboard/widgets/StatWidget.svelte';
  import ChartWidget from '$lib/dashboard/widgets/ChartWidget.svelte';
  import AbacWidget from './components/AbacWidget.svelte';
  import ApiWidget from './components/ApiWidget.svelte';
  import NotificationsWidget from './components/NotificationsWidget.svelte';

  // Granular Lucide imports
  import DollarSign from 'lucide-svelte/icons/dollar-sign';
  import Users from 'lucide-svelte/icons/users';
  import CreditCard from 'lucide-svelte/icons/credit-card';
  import Activity from 'lucide-svelte/icons/activity';

  let { data }: { data: PageData } = $props();
  const { abacStatus, session } = data;

  let editMode = $state(false);

  // Demo ECharts Options
  const chartOptions = {
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      axisLine: { show: false },
      axisTick: { show: false }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        data: [40, 65, 45, 90, 55, 75, 30, 85],
        type: 'bar',
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
        barWidth: '50%'
      }
    ]
  };

  const pieChartOptions = {
    tooltip: { trigger: 'item' },
    legend: { top: '5%', left: 'center' },
    series: [
      {
        name: 'Access From',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
        labelLine: { show: false },
        data: [
          { value: 1048, name: 'Search Engine', itemStyle: { color: '#3b82f6' } },
          { value: 735, name: 'Direct', itemStyle: { color: '#10b981' } },
          { value: 580, name: 'Email', itemStyle: { color: '#f59e0b' } },
          { value: 484, name: 'Union Ads', itemStyle: { color: '#ef4444' } },
          { value: 300, name: 'Video Ads', itemStyle: { color: '#8b5cf6' } }
        ]
      }
    ]
  };

  const dashboardWidgets: WidgetDefinition[] = [
    { 
      id: 'stat-revenue', type: 'stat', defaultSize: 'sm', 
      props: { value: '$45,231.89', change: '+20.1% from last month', trend: 'up', icon: DollarSign } 
    },
    { 
      id: 'stat-subs', type: 'stat', defaultSize: 'sm', 
      props: { value: '+2350', change: '+180.1% from last month', trend: 'up', icon: Users } 
    },
    { 
      id: 'stat-sales', type: 'stat', defaultSize: 'sm', 
      props: { value: '+12,234', change: '+19% from last month', trend: 'up', icon: CreditCard } 
    },
    { 
      id: 'stat-active', type: 'stat', defaultSize: 'sm', 
      props: { value: '+573', change: '+201 since last hour', trend: 'neutral', icon: Activity } 
    },
    { 
      id: 'chart-overview', type: 'chart', title: 'Overview', defaultSize: 'lg', w: 7, h: 4,
      component: ChartWidget, props: { options: chartOptions }
    },
    { 
      id: 'chart-traffic', type: 'chart', title: 'Traffic Sources', defaultSize: 'lg', w: 5, h: 4,
      component: ChartWidget, props: { options: pieChartOptions }
    },
    { 
      id: 'abac-status', type: 'custom', title: 'ABAC Status', defaultSize: 'lg', w: 5, h: 4,
      component: AbacWidget, props: { session, abacStatus }
    },
    { 
      id: 'demo-notifications', type: 'custom', title: 'Notifications', defaultSize: 'md', w: 6, h: 2,
      component: NotificationsWidget 
    },
    { 
      id: 'demo-api', type: 'custom', title: 'API Demo', defaultSize: 'md', w: 6, h: 2,
      component: ApiWidget 
    }
  ];

  // We assign the component class for stat widgets dynamically in the engine, but we can also pass it explicitly here
  // Actually, DashboardEngine handles 'stat' type natively with StatWidget, but we need to import it there.
  // Wait, DashboardEngine doesn't import StatWidget to avoid circular deps or bloat.
  // We can just set type: 'custom' and pass the component for everything, or fix DashboardEngine.
  // Let's modify the objects to just use component directly.
  dashboardWidgets.forEach(w => {
    if (w.type === 'stat') w.component = StatWidget;
  });

</script>

<div class="flex-1 space-y-4 p-4 pt-6 md:p-8 overflow-hidden flex flex-col h-[calc(100vh-64px)]">
  <div class="flex items-center justify-between space-y-2">
    <h2 class="text-3xl font-bold tracking-tight">{$t('nav.dashboard')}</h2>
    <div class="flex items-center space-x-2">
      {#if session?.user?.role === 'admin'}
        <Button variant={editMode ? 'default' : 'outline'} onclick={() => editMode = !editMode}>
          {editMode ? 'Terminer' : 'Modifier le layout'}
        </Button>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-auto -mx-4 px-4 pb-4">
    <DashboardEngine 
      dashboardId="main-dashboard"
      widgets={dashboardWidgets} 
      {editMode}
    >
      {#snippet filters()}
        <FilterBar>
          <select class="text-sm border rounded-md px-2 py-1 bg-background">
            <option>Cette année</option>
            <option>Ce mois-ci</option>
            <option>Aujourd'hui</option>
          </select>
          <select class="text-sm border rounded-md px-2 py-1 bg-background">
            <option>Toutes entités</option>
            <option>Entité A</option>
          </select>
        </FilterBar>
      {/snippet}
    </DashboardEngine>
  </div>
</div>

