import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('Sandbox Windows Support & Docker Desktop Contract', () => {
	const rootDir = path.resolve(__dirname, '../..');
	const sandboxDir = path.join(rootDir, 'deploy/sandbox');
	const sandboxPs1 = path.join(sandboxDir, 'sandbox.ps1');
	const sandboxSh = path.join(sandboxDir, 'sandbox.sh');
	const composeYml = path.join(sandboxDir, 'compose.yml');
	const gitattributes = path.join(rootDir, '.gitattributes');

	function resolvePowerShellCmd(): string | null {
		for (const candidate of ['pwsh', 'powershell']) {
			try {
				execFileSync(candidate, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
					stdio: 'ignore',
					timeout: 5000
				});
				return candidate;
			} catch {
				// binaire non disponible sur la machine ou le runner CI
			}
		}
		return null;
	}

	it('fournit le script PowerShell natif sandbox.ps1 avec en-tête UTF-8 BOM pour Windows PowerShell', () => {
		expect(fs.existsSync(sandboxPs1)).toBe(true);

		const buffer = fs.readFileSync(sandboxPs1);
		// Vérification du BOM UTF-8 (0xEF, 0xBB, 0xBF)
		expect(buffer[0]).toBe(0xef);
		expect(buffer[1]).toBe(0xbb);
		expect(buffer[2]).toBe(0xbf);

		const content = buffer.toString('utf-8');
		expect(content).toContain('New-SandboxEnv');
		expect(content).toContain('Invoke-Smoke');
		expect(content).toContain('Find-Llmops');
		expect(content).toContain('docker compose');
	});

	it('valide la syntaxe PowerShell de sandbox.ps1 sans erreur de parsing', { timeout: 30000 }, () => {
		const isWindows = process.platform === 'win32';
		const psCmd = isWindows ? resolvePowerShellCmd() : null;
		if (!psCmd) {
			// Sur un environnement non-Windows (runner CI Linux / macOS),
			// on effectue des vérifications structurelles indispensables de sandbox.ps1.
			const content = fs.readFileSync(sandboxPs1, 'utf-8');
			expect(content).toContain('param(');
			expect(content).toContain('New-SandboxEnv');
			expect(content).toContain('switch ($Command)');
			expect(content).toContain('Invoke-Smoke');
			expect(content).toContain('Find-Llmops');
			expect(content).not.toMatch(/\$pAdmin\s*=\s*$/m);
			return;
		}

		try {
			const script = [
				`$content = [System.IO.File]::ReadAllText('${sandboxPs1.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)`,
				`$tokens = $null`,
				`$errors = $null`,
				`[void][System.Management.Automation.Language.Parser]::ParseInput($content, [ref]$tokens, [ref]$errors)`,
				`if ($errors.Count -gt 0) { exit 1 } else { exit 0 }`
			].join('; ');

			execFileSync(psCmd, ['-NoProfile', '-NonInteractive', '-Command', script], {
				stdio: 'pipe',
				timeout: 20000
			});
		} catch (err) {
			throw new Error(`Erreur de syntaxe PowerShell dans sandbox.ps1 : ${String(err)}`);
		}
	});

	it('fournit sandbox.sh avec fins de ligne LF et compatibilité cygpath/Windows', () => {
		expect(fs.existsSync(sandboxSh)).toBe(true);
		const content = fs.readFileSync(sandboxSh, 'utf-8');

		// Pas de CRLF dans sandbox.sh
		expect(content).not.toContain('\r\n');
		// Support des chemins natifs / cygpath
		expect(content).toContain('to_native_path');
		expect(content).toContain('cygpath');
		// Repli Node.js pour OpenSSL
		expect(content).toContain('crypto.generateKeyPairSync');
	});

	it('garantit des fins de ligne LF sur les fichiers montés dans les conteneurs', () => {
		const containerFiles = [
			path.join(sandboxDir, 'Caddyfile'),
			path.join(sandboxDir, 'hub-init.py'),
			path.join(sandboxDir, 'archinex-init.mjs')
		];

		for (const file of containerFiles) {
			expect(fs.existsSync(file)).toBe(true);
			const content = fs.readFileSync(file, 'utf-8');
			expect(content).not.toContain('\r\n');
		}
	});

	it('configure .gitattributes pour forcer les fins de ligne appropriées sous Windows', () => {
		expect(fs.existsSync(gitattributes)).toBe(true);
		const content = fs.readFileSync(gitattributes, 'utf-8');
		expect(content).toMatch(/\*\.sh\s+text\s+eol=lf/);
		expect(content).toMatch(/Caddyfile\s+text\s+eol=lf/);
		expect(content).toMatch(/\*\.ps1\s+text\s+eol=crlf/);
	});

	it('génère une clé Ed25519 et un JWKS conformes RFC 8037 attendus par le Hub LLMOps', () => {
		const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
		const kid = 'sandbox-1';
		const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig' };
		const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();

		expect(jwk.kty).toBe('OKP');
		expect(jwk.crv).toBe('Ed25519');
		expect(jwk.kid).toBe('sandbox-1');
		expect(jwk.use).toBe('sig');
		expect(jwk.x).toBeDefined();
		expect(typeof jwk.x).toBe('string');
		expect(jwk.x!.length).toBeGreaterThanOrEqual(42);

		expect(pem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
		expect(pem).toMatch(/-----END PRIVATE KEY-----$/);
	});

	it('valide la configuration docker compose config avec les variables du bac à sable', () => {
		const tmpEnv = path.join(sandboxDir, 'test-contract.env');
		const envContent = [
			"SANDBOX_ORIGIN='https://localhost:8443'",
			"SANDBOX_DOMAIN='localhost'",
			"SANDBOX_HTTPS_PORT='8443'",
			"SANDBOX_HTTP_PORT='8080'",
			"SERVICE_TOKEN='test_token_12345'",
			"DEMO_TOKEN='demo_token_12345'",
			"JWT_SECRET='jwt_secret_12345'",
			"ARCHINEX_ACTOR_KID='sandbox-1'",
			"ARCHINEX_ACTOR_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----'",
			"ARCHINEX_JWKS='{\"keys\":[{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"abc\",\"kid\":\"sandbox-1\",\"use\":\"sig\"}]}'",
			"SANDBOX_HUB_PERSONAS='@maintainers=admin@sandbox.test'",
			"SANDBOX_ARCHINEX_USERS='[{\"key\":\"admin\",\"name\":\"Admin\",\"email\":\"admin@sandbox.test\",\"password\":\"pass\"}]'",
			"LLMOPS_DIR='C:/Users/Momo/Documents/Dev/LLMOps'"
		].join('\n');

		fs.writeFileSync(tmpEnv, envContent, 'utf-8');

		try {
			const cmd = `docker compose -f "${composeYml}" --env-file "${tmpEnv}" --project-directory "${sandboxDir}" config`;
			const stdout = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
			expect(stdout).toContain('archinex-sandbox');
			expect(stdout).toContain('hub');
			expect(stdout).toContain('archinex');
			expect(stdout).toContain('proxy');
		} finally {
			if (fs.existsSync(tmpEnv)) {
				fs.unlinkSync(tmpEnv);
			}
		}
	});

	it('configure des mots de passe conviviaux par défaut pour localhost', () => {
		const ps1Content = fs.readFileSync(sandboxPs1, 'utf-8');
		expect(ps1Content).toContain('admin123');
		expect(ps1Content).toContain('architect123');
		expect(ps1Content).toContain('security123');
		expect(ps1Content).toContain('ciso123');

		const shContent = fs.readFileSync(sandboxSh, 'utf-8');
		expect(shContent).toContain('admin123');
		expect(shContent).toContain('architect123');
		expect(shContent).toContain('security123');
		expect(shContent).toContain('ciso123');
	});
});
