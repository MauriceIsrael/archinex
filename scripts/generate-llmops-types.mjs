#!/usr/bin/env node
/**
 * Génère les types TypeScript et constantes de contrat à partir du schéma OpenAPI du Hub LLMOps
 * (`src/lib/server/llmops/contract/hub-openapi.json`).
 *
 * Usage:
 *   node scripts/generate-llmops-types.mjs          # génère le fichier
 *   node scripts/generate-llmops-types.mjs --check  # vérifie que le fichier est à jour (CI)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA_PATH = path.resolve(ROOT, 'src/lib/server/llmops/contract/hub-openapi.json');
const OUTPUT_PATH = path.resolve(ROOT, 'src/lib/server/llmops/contract/generated-types.ts');

function schemaToTsType(schema) {
	if (!schema || typeof schema !== 'object') return 'unknown';
	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		const union = schema.enum.map((v) => JSON.stringify(v)).join(' | ');
		return schema.nullable ? `(${union}) | null` : union;
	}
	let base = 'unknown';
	switch (schema.type) {
		case 'string':
			base = 'string';
			break;
		case 'number':
		case 'integer':
			base = 'number';
			break;
		case 'boolean':
			base = 'boolean';
			break;
		case 'array':
			base = `${schemaToTsType(schema.items)}[]`;
			break;
		case 'object': {
			const props = schema.properties || {};
			const req = new Set(Array.isArray(schema.required) ? schema.required : []);
			const entries = Object.entries(props).map(([key, propSchema]) => {
				const opt = req.has(key) ? '' : '?';
				return `\t${key}${opt}: ${schemaToTsType(propSchema)};`;
			});
			base = entries.length > 0 ? `{\n${entries.join('\n')}\n}` : 'Record<string, unknown>';
			break;
		}
		default:
			base = 'unknown';
	}
	return schema.nullable ? `${base} | null` : base;
}

function generate(spec) {
	const contractId = spec.info?.['x-contract-id'] || 'CONTRAT-KH-API-V1';
	const apiVersion = spec.info?.version || '1.0.0';
	const supportedVersions = spec.info?.['x-supported-versions'] || ['1.0'];
	const primaryMajorMinor = supportedVersions[0] || apiVersion.split('.').slice(0, 2).join('.');

	const lines = [
		'/* eslint-disable */',
		'// FICHIER GÉNÉRÉ AUTOMATIQUEMENT depuis src/lib/server/llmops/contract/hub-openapi.json',
		'// Ne pas modifier manuellement — exécuter `npm run llmops:gen-types`.',
		'',
		`export const HUB_CONTRACT_ID = ${JSON.stringify(contractId)} as const;`,
		`export const HUB_CONTRACT_SPEC_VERSION = ${JSON.stringify(apiVersion)} as const;`,
		`export const HUB_CONTRACT_VERSION = ${JSON.stringify(primaryMajorMinor)} as const;`,
		`export const HUB_SUPPORTED_CONTRACT_VERSIONS = ${JSON.stringify(supportedVersions)} as const;`,
		`export type HubSupportedContractVersion = (typeof HUB_SUPPORTED_CONTRACT_VERSIONS)[number];`,
		''
	];

	const paths = Object.keys(spec.paths || {});
	lines.push('export const HUB_CONTRACT_PATHS = [');
	for (const p of paths) {
		lines.push(`\t${JSON.stringify(p)},`);
	}
	lines.push('] as const;');
	lines.push('export type HubContractPath = (typeof HUB_CONTRACT_PATHS)[number];');
	lines.push('');

	const schemas = spec.components?.schemas || {};
	for (const [name, schema] of Object.entries(schemas)) {
		if (schema.type === 'object' && schema.properties) {
			lines.push(`export interface ${name} ${schemaToTsType(schema)}`);
		} else {
			lines.push(`export type ${name} = ${schemaToTsType(schema)};`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

const spec = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
const generated = generate(spec);

if (process.argv.includes('--check')) {
	const current = fs.existsSync(OUTPUT_PATH)
		? fs.readFileSync(OUTPUT_PATH, 'utf-8').replace(/\r\n/g, '\n')
		: '';
	if (current !== generated.replace(/\r\n/g, '\n')) {
		console.error(
			'❌ Les types générés du contrat Hub LLMOps ne sont pas à jour. Exécutez `npm run llmops:gen-types`.'
		);
		process.exit(1);
	}
	console.log('✓ Types générés du contrat Hub LLMOps synchronisés avec hub-openapi.json.');
	process.exit(0);
}

fs.writeFileSync(OUTPUT_PATH, generated, 'utf-8');
console.log(`✓ Types générés écrits dans ${path.relative(ROOT, OUTPUT_PATH)}`);
