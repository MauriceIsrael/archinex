/**
 * Empaquetage éditorial pour l'export HLD / Document Engine (#424).
 * Produit les artefacts SVG, HTML autonomes hors-ligne et le sidecar `.registry.json`
 * prêts à être embarqués dans un dossier HLD Markdown/HTML/Word ou un bundle d'audit.
 */

import type { EditorialDiagramResult } from './dials';
import { wrapStandaloneHtml } from './primitives';

export interface EditorialHldArtifact {
	filename: string;
	mimeType: 'image/svg+xml' | 'text/html' | 'application/json';
	content: string;
}

export interface EditorialHldPackage {
	slug: string;
	title: string;
	markdownEmbed: string;
	artifacts: EditorialHldArtifact[];
}

/**
 * Emballe un résultat de diagramme éditorial en lot complet pour l'export HLD / Document Engine.
 */
export function buildEditorialHldPackage(diagram: EditorialDiagramResult): EditorialHldPackage {
	const svgFilename = `${diagram.slug}.svg`;
	const htmlFilename = `${diagram.slug}.html`;
	const artifacts: EditorialHldArtifact[] = [
		{
			filename: svgFilename,
			mimeType: 'image/svg+xml',
			content: diagram.svg
		},
		{
			filename: htmlFilename,
			mimeType: 'text/html',
			content: wrapStandaloneHtml(diagram.title, diagram.svg, diagram.dials.skin)
		}
	];

	if (diagram.registryJson) {
		artifacts.push({
			filename: `${diagram.slug}.registry.json`,
			mimeType: 'application/json',
			content: diagram.registryJson
		});
	}

	const markdownEmbed = [
		`### ${diagram.title}`,
		``,
		`![${diagram.title}](./${svgFilename})`,
		``,
		`> ${diagram.description} *(Mode \`${diagram.dials.detail}\` · ${diagram.ledger.drawnNodeCount}/${diagram.ledger.sourceNodeCount} éléments)*`
	].join('\n');

	return {
		slug: diagram.slug,
		title: diagram.title,
		markdownEmbed,
		artifacts
	};
}
