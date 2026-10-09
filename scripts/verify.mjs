import { execSync } from 'child_process';
import * as fs from 'fs';

const steps = [
	{ name: '1/4 Denylist Check', cmd: 'node scripts/check-no-project-names.mjs' },
	{ name: '2/4 Vitest Tests', cmd: 'npx svelte-kit sync && npx vitest run' },
	{ name: '3/4 Svelte Check', cmd: 'npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json' },
	{
		name: '4/4 Production Build',
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
		console.error(
			`\n❌ Error during ${step.name}: status=${err.status}, signal=${err.signal}, msg=${err.message}`
		);
		process.exit(1);
	}
}

console.log('🎉 All 4 verification gates passed successfully!');
process.exit(0);
