import { newEnforcer, type Enforcer } from 'casbin';
import { PrismaAdapter } from 'casbin-prisma-adapter';
import { prisma } from './prisma';
import path from 'path';

let enforcerPromise: Promise<Enforcer> | null = null;

/**
 * Initialize or get the Casbin Enforcer singleton.
 * Uses the Prisma adapter for persistent policy storage.
 */
export async function getEnforcer(): Promise<Enforcer> {
  if (!enforcerPromise) {
    enforcerPromise = (async () => {
      const modelPath = path.resolve('prisma/model.conf');
      const adapter = await PrismaAdapter.newAdapter(prisma);
      const enf = await newEnforcer(modelPath, adapter);
      await enf.loadPolicy();
      return enf;
    })();
  }
  return enforcerPromise;
}

/**
 * Helper to check permission using ABAC objects.
 * 
 * @param sub Subject (user object with attributes)
 * @param obj Object (resource object with type and attributes)
 * @param act Action (string or object)
 */
export async function checkPermission(sub: any, obj: any, act: string) {
  const ef = await getEnforcer();
  return await ef.enforce(sub, obj, act);
}
