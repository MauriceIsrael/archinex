export default async function globalTeardown() {
  console.log('\n[Playwright Global Teardown] Nettoyage des ressources E2E...');

  const viteProcess = (globalThis as any).__VITE_PROCESS__;
  if (viteProcess) {
    console.log('[Playwright Global Teardown] Arrêt du serveur Vite...');
    try {
      if (process.platform === 'win32') {
        const { execSync } = await import('node:child_process');
        try {
          execSync(`taskkill /pid ${viteProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          viteProcess.kill();
        }
      } else {
        viteProcess.kill('SIGTERM');
      }
    } catch {
      // Ignorer
    }
  }

  const container = (globalThis as any).__CONTAINER__;
  if (container) {
    console.log('[Playwright Global Teardown] Arrêt du conteneur Docker LLMOps...');
    try {
      await container.stop();
    } catch (e: any) {
      console.warn('[Playwright Global Teardown] Erreur lors de l’arrêt du conteneur :', e.message);
    }
  }

  console.log('[Playwright Global Teardown] Nettoyage terminé.\n');
}
