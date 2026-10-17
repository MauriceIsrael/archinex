<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import Scale from 'lucide-svelte/icons/scale';
	import DecisionGuideModal from '$lib/components/deliberation/DecisionGuideModal.svelte';
	import { t } from 'svelte-i18n';

	let isGuideOpen = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				variant="ghost"
				size="icon"
				{...props}
				aria-label={$t('nav.help', { default: 'Aide' })}
				title={$t('nav.help', { default: 'Aide' })}
			>
				<HelpCircle class="h-5 w-5" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label>{$t('help.title', { default: 'Aide & Méthodologie' })}</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={() => (isGuideOpen = true)} class="cursor-pointer">
			<Scale class="mr-2 h-4 w-4 text-primary" />
			<span>{$t('help.decisionGuide', { default: 'Comment décider ?' })}</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<DecisionGuideModal bind:isOpen={isGuideOpen} />
