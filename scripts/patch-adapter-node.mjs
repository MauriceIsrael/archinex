import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('node_modules/@sveltejs/adapter-node/index.js');
if (fs.existsSync(file)) {
	const content = fs.readFileSync(file, 'utf8');
	if (!content.includes('bundle.close()')) {
		const patched = content.replace(
			/await bundle\.write\(\{[\s\S]*?\}\);/,
			(match) => `${match}\n\n\t\t\tawait bundle.close();`
		);
		if (patched !== content) {
			fs.writeFileSync(file, patched, 'utf8');
			console.log('[patch-adapter-node] Applied bundle.close() patch to @sveltejs/adapter-node.');
		}
	}
}

