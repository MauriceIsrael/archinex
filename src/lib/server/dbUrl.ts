import { isAbsolute, resolve } from 'node:path';

/**
 * Résout l'URL SQLite (`file:...`). Les chemins relatifs sont interprétés par rapport
 * au dossier `prisma/` (comportement historique de Prisma 6), afin que le CLI
 * (`prisma db push`) et l'adaptateur better-sqlite3 (relatif au cwd) ciblent le même fichier.
 */
export function resolveDatabaseUrl(raw: string | undefined = process.env.DATABASE_URL): string {
	const url = raw ?? 'file:./dev.db';
	if (!url.startsWith('file:')) return url;
	const path = url.slice('file:'.length);
	if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path)) return url;
	return `file:${resolve(process.cwd(), 'prisma', path)}`;
}