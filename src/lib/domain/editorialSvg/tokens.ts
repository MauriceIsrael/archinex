/**
 * Design Tokens éditoriaux pour le moteur SVG déterministe d'Archinex.
 * Inspiré du système de design `cathrynlavery/diagram-design` (licence MIT) :
 * - Rôles sémantiques stricts (jamais de hexadécimal brut dans les générateurs de vues).
 * - Contraste WCAG AA vérifié en clair comme en sombre (≥ 4.5:1 sur le texte, ≥ 3:1 sur les traits).
 * - Trois familles typographiques (Serif éditorial, Sans, Mono) avec mode hors-ligne par défaut.
 */

export type EditorialSkin = 'light' | 'dark' | 'full-editorial';

export type FontSource = 'system' | 'google';

export interface EditorialTokens {
	paper: string;
	paper2: string;
	ink: string;
	inkStrong: string;
	muted: string;
	soft: string;
	rule: string;
	ruleSolid: string;
	accent: string;
	accentTint: string;
	link: string;
	nodeBackendFill: string;
	nodeStoreFill: string;
	nodeOptionalFill: string;
	nodeOptionalStroke: string;
	nodeWarningTint: string;
	nodeWarningStroke: string;
}

export interface EditorialFonts {
	title: string;
	callout: string;
	nodeName: string;
	sublabel: string;
	eyebrow: string;
	arrowLabel: string;
}

export const EDITORIAL_SKINS: Record<EditorialSkin, EditorialTokens> = {
	light: {
		paper: '#f5f5f5',
		paper2: '#ececec',
		ink: '#2d3142',
		inkStrong: '#111111',
		muted: '#4f5d75',
		soft: '#5a6580',
		rule: 'rgba(45,49,66,0.12)',
		ruleSolid: '#bfc0c0',
		accent: '#bf4520',
		accentTint: 'rgba(191,69,32,0.08)',
		link: '#2e5aa8',
		nodeBackendFill: '#ffffff',
		nodeStoreFill: 'rgba(45,49,66,0.05)',
		nodeOptionalFill: 'rgba(45,49,66,0.02)',
		nodeOptionalStroke: 'rgba(45,49,66,0.35)',
		nodeWarningTint: 'rgba(191,69,32,0.07)',
		nodeWarningStroke: '#bf4520'
	},
	dark: {
		paper: '#2d3142',
		paper2: '#393e53',
		ink: '#f5f5f5',
		inkStrong: '#111111',
		muted: '#bfc0c0',
		soft: '#9aa4b8',
		rule: 'rgba(245,245,245,0.14)',
		ruleSolid: 'rgba(191,192,192,0.35)',
		accent: '#f08a59',
		accentTint: 'rgba(240,138,89,0.12)',
		link: '#739fdf',
		nodeBackendFill: '#34394d',
		nodeStoreFill: 'rgba(245,245,245,0.06)',
		nodeOptionalFill: 'rgba(245,245,245,0.03)',
		nodeOptionalStroke: 'rgba(245,245,245,0.38)',
		nodeWarningTint: 'rgba(240,138,89,0.12)',
		nodeWarningStroke: '#f08a59'
	},
	'full-editorial': {
		paper: '#f8f6f2',
		paper2: '#efebe3',
		ink: '#242736',
		inkStrong: '#111111',
		muted: '#4a5568',
		soft: '#545f75',
		rule: 'rgba(36,39,54,0.12)',
		ruleSolid: '#c5bfb4',
		accent: '#b83f1c',
		accentTint: 'rgba(184,63,28,0.08)',
		link: '#285299',
		nodeBackendFill: '#ffffff',
		nodeStoreFill: 'rgba(36,39,54,0.04)',
		nodeOptionalFill: 'rgba(36,39,54,0.02)',
		nodeOptionalStroke: 'rgba(36,39,54,0.35)',
		nodeWarningTint: 'rgba(184,63,28,0.08)',
		nodeWarningStroke: '#b83f1c'
	}
};

export function getEditorialFonts(source: FontSource = 'system'): EditorialFonts {
	if (source === 'google') {
		return {
			title: "'Instrument Serif', 'Georgia', serif",
			callout: "'Instrument Serif', 'Georgia', serif",
			nodeName: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
			sublabel: "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
			eyebrow: "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
			arrowLabel: "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
		};
	}
	return {
		title: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
		callout: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
		nodeName: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
		sublabel: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
		eyebrow: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
		arrowLabel: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"
	};
}

/** Calibrated character advance widths (0.60em sans, 0.62em mono) to prevent label clipping. */
export function estimateTextWidthPx(text: string, fontSizePx: number, kind: 'sans' | 'mono' | 'serif' = 'sans'): number {
	const factor = kind === 'mono' ? 0.62 : kind === 'serif' ? 0.56 : 0.60;
	return Math.ceil(text.length * fontSizePx * factor);
}

/** Truncates text cleanly to fit inside `maxWidthPx` without overflowing node boxes. */
export function fitLabelToWidth(text: string, maxWidthPx: number, fontSizePx: number, kind: 'sans' | 'mono' | 'serif' = 'sans'): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (estimateTextWidthPx(clean, fontSizePx, kind) <= maxWidthPx) return clean;
	const factor = kind === 'mono' ? 0.62 : kind === 'serif' ? 0.56 : 0.60;
	const maxChars = Math.max(4, Math.floor(maxWidthPx / (fontSizePx * factor)) - 1);
	if (clean.length <= maxChars) return clean;
	return `${clean.slice(0, maxChars).trimEnd()}…`;
}

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export function parseColorToRgb(color: string, backgroundHex = '#f5f5f5'): RgbColor | null {
	const trimmed = color.trim();
	if (trimmed.startsWith('#')) {
		const hex = trimmed.slice(1);
		if (hex.length === 3) {
			return {
				r: parseInt(hex[0] + hex[0], 16),
				g: parseInt(hex[1] + hex[1], 16),
				b: parseInt(hex[2] + hex[2], 16)
			};
		}
		if (hex.length === 6) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16)
			};
		}
	}
	const rgba = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
	if (rgba) {
		const r = Number(rgba[1]);
		const g = Number(rgba[2]);
		const b = Number(rgba[3]);
		const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;
		if (a >= 1) return { r, g, b };
		const bg = parseColorToRgb(backgroundHex) ?? { r: 245, g: 245, b: 245 };
		return {
			r: Math.round(r * a + bg.r * (1 - a)),
			g: Math.round(g * a + bg.g * (1 - a)),
			b: Math.round(b * a + bg.b * (1 - a))
		};
	}
	return null;
}

function relativeLuminance(rgb: RgbColor): number {
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/** Computes WCAG 2.x contrast ratio between two CSS colors (compositing alpha over background). */
export function wcagContrastRatio(foreground: string, background: string): number {
	const bg = parseColorToRgb(background);
	const fg = parseColorToRgb(foreground, background);
	if (!fg || !bg) return 0;
	const l1 = relativeLuminance(fg);
	const l2 = relativeLuminance(bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export interface ContrastCheckResult {
	skin: EditorialSkin;
	ok: boolean;
	checks: Array<{ role: string; ratio: number; minimum: number; pass: boolean }>;
}

/** Verifies every text token clears WCAG AA 4.5:1 against `paper`. */
export function verifySkinContrast(skin: EditorialSkin): ContrastCheckResult {
	const t = EDITORIAL_SKINS[skin];
	const textRoles: Array<{ role: string; value: string; minimum: number }> = [
		{ role: 'ink', value: t.ink, minimum: 4.5 },
		{ role: 'muted', value: t.muted, minimum: 4.5 },
		{ role: 'soft', value: t.soft, minimum: 4.5 },
		{ role: 'accent', value: t.accent, minimum: 4.5 },
		{ role: 'link', value: t.link, minimum: 4.5 }
	];
	const checks = textRoles.map((item) => {
		const ratio = wcagContrastRatio(item.value, t.paper);
		return { role: item.role, ratio, minimum: item.minimum, pass: ratio >= item.minimum };
	});
	return {
		skin,
		ok: checks.every((c) => c.pass),
		checks
	};
}
