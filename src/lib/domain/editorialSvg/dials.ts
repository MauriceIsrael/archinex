/**
 * Les 4 Cadrans d'Adaptation (« The Four Dials ») et le Fidelity Ledger
 * inspirés de `cathrynlavery/diagram-design` (`output-spec.md`).
 */

import type { EditorialSkin, FontSource } from './tokens';

export type DiagramFormatDial = 'svg' | 'html' | 'registry';
export type DiagramSizeDial = 'doc-inline' | 'doc-wide' | 'slide-16x9' | 'print-a4-landscape';
export type DiagramDetailDial = 'faithful' | 'balanced' | 'simplified';
export type DiagramAudienceDial = 'engineer' | 'mixed' | 'executive';

export interface EditorialDials {
	skin: EditorialSkin;
	size: DiagramSizeDial;
	detail: DiagramDetailDial;
	audience: DiagramAudienceDial;
	fontSource?: FontSource;
}

export const DEFAULT_EDITORIAL_DIALS: EditorialDials = {
	skin: 'light',
	size: 'doc-wide',
	detail: 'balanced',
	audience: 'mixed',
	fontSource: 'system'
};

export interface SizePreset {
	id: DiagramSizeDial;
	label: string;
	width: number;
	minHeight: number;
	titleFontSize: number;
	nodeFontSize: number;
	sublabelFontSize: number;
	eyebrowFontSize: number;
}

/** All widths and heights are strict multiples of 4px. */
export const SIZE_PRESETS: Record<DiagramSizeDial, SizePreset> = {
	'doc-inline': {
		id: 'doc-inline',
		label: 'Document (inline)',
		width: 760,
		minHeight: 360,
		titleFontSize: 20,
		nodeFontSize: 12,
		sublabelFontSize: 9,
		eyebrowFontSize: 8
	},
	'doc-wide': {
		id: 'doc-wide',
		label: 'Document (large)',
		width: 960,
		minHeight: 420,
		titleFontSize: 22,
		nodeFontSize: 12,
		sublabelFontSize: 9,
		eyebrowFontSize: 8
	},
	'slide-16x9': {
		id: 'slide-16x9',
		label: 'Présentation 16:9',
		width: 1120,
		minHeight: 628,
		titleFontSize: 26,
		nodeFontSize: 14,
		sublabelFontSize: 10,
		eyebrowFontSize: 9
	},
	'print-a4-landscape': {
		id: 'print-a4-landscape',
		label: 'Impression A4 Paysage',
		width: 1080,
		minHeight: 720,
		titleFontSize: 24,
		nodeFontSize: 12,
		sublabelFontSize: 9,
		eyebrowFontSize: 8
	}
};

export const DETAIL_NODE_BUDGET: Record<DiagramDetailDial, number> = {
	faithful: 24,
	balanced: 12,
	simplified: 7
};

export interface FidelityLedgerEntry {
	action: 'collapsed' | 'aggregated' | 'truncated' | 'kept';
	summary: string;
	count?: number;
}

export interface FidelityLedger {
	detail: DiagramDetailDial;
	sourceNodeCount: number;
	drawnNodeCount: number;
	entries: FidelityLedgerEntry[];
}

export interface EditorialDiagramResult {
	diagramType: 'traceable-blocks' | 'requirement-traceability';
	slug: string;
	title: string;
	description: string;
	svg: string;
	width: number;
	height: number;
	dials: EditorialDials;
	ledger: FidelityLedger;
	registryJson?: string;
}
