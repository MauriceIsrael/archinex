import { execSync } from 'child_process';
import * as fs from 'fs';

const steps = [
	{
		name: '1/7 Denylist & Couplage Scénario',
		cmd: 'node scripts/check-no-project-names.mjs && node scripts/check-scenario-coupling.mjs'
	},
	{ name: '2/7 Changelog Fragments Check', cmd: 'node scripts/consolidate-changelog.mjs --check' },
	{
		name: '3/7 File Size & Route Lint + Hub Contract Types',
		cmd: 'node scripts/check-file-size.mjs && node scripts/generate-llmops-types.mjs --check'
	},
	{
		name: '4/7 Bootstrap Test Env (OPA, Prisma, SvelteKit) & Sylva OPA Golden Rules',
		cmd: 'node scripts/ensure-test-env.mjs && npx tsx scripts/check-sylva-golden-rules.ts'
	},
	{
		name: '5/7 Vitest Tests & Coverage (v8)',
		cmd: 'npx vitest run --coverage --reporter=default --reporter=json --outputFile=test-results/vitest-report.json'
	},
	{ name: '6/7 Svelte Check', cmd: 'npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json' },
	{
		name: '7/7 Production Build',
		cmd: 'npx vite build',
		checkSuccess: () => fs.existsSync('.svelte-kit/output/server/index.js')
	}
];

console.log('=== Archinex Global Verification ===\n');

for (const step of steps) {
	console.log(`--> Running ${step.name}...`);
	try {
		execSync(step.cmd, { stdio: 'inherit', env: process.env });
		console.log(`✓ ${step.name} passed.\n`);
		if (step.name.startsWith('5/7')) {
			execSync('node scripts/ci-test-summary.mjs', { stdio: 'inherit', env: process.env });
		}
	} catch (err) {
		// Gère l'anomalie de déchargement de thread de Node v22 sous Windows (STATUS_ACCESS_VIOLATION 0xC0000005)
		if (
			step.checkSuccess &&
			step.checkSuccess() &&
			(err.status === 3221225477 || err.status === -1073741819)
		) {
			console.log(
				`✓ ${step.name} passed (artefacts de build confirmés, sortie Node v22 Windows tolérée).\n`
			);
			continue;
		}
		if (step.name.startsWith('5/7')) {
			try {
				execSync('node scripts/ci-test-summary.mjs', { stdio: 'inherit', env: process.env });
			} catch {
				// Best effort summary
			}
		}
		console.error(
			`\n❌ Error during ${step.name}: status=${err.status}, signal=${err.signal}, msg=${err.message}`
		);
		process.exit(1);
	}
}

console.log('🎉 All 7 verification gates passed successfully!');
process.exit(0);
