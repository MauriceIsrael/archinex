import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 [seed] Initialisation de la base Archinex...');

  const adminPass = await bcrypt.hash('admin123', 10);
  const userPass = await bcrypt.hash('user123', 10);

  // 1. Comptes de Démonstration Principaux (@archinex.local)
  // 1.1 Lead Architect / Admin
  await prisma.user.upsert({
    where: { email: 'admin@archinex.local' },
    update: {
      name: 'Lead Architect (Admin)',
      passwordHash: adminPass,
      role: 'admin'
    },
    create: {
      id: 'usr_admin_001',
      name: 'Lead Architect (Admin)',
      email: 'admin@archinex.local',
      passwordHash: adminPass,
      role: 'admin',
      attributes: JSON.stringify({
        clearance: 3,
        department: 'Architecture & Systèmes',
        role: 'lead_architect',
        tags: ['internal']
      })
    }
  });

  // 1.2 Architecte de Domaine (Contributeur)
  await prisma.user.upsert({
    where: { email: 'architect@archinex.local' },
    update: {
      name: 'Architecte Domaine',
      passwordHash: userPass,
      role: 'user'
    },
    create: {
      id: 'usr_architect_002',
      name: 'Architecte Domaine',
      email: 'architect@archinex.local',
      passwordHash: userPass,
      role: 'user',
      attributes: JSON.stringify({
        clearance: 2,
        department: 'Ingénierie',
        role: 'domain_architect',
        tags: ['contributor']
      })
    }
  });

  // 1.3 Expert Sécurité & Cloud (Expert KB)
  const expertUser = await prisma.user.upsert({
    where: { email: 'expert@archinex.local' },
    update: {
      name: 'Expert Sécurité & Cloud',
      passwordHash: userPass,
      role: 'user'
    },
    create: {
      id: 'usr_expert_003',
      name: 'Expert Sécurité & Cloud',
      email: 'expert@archinex.local',
      passwordHash: userPass,
      role: 'user',
      attributes: JSON.stringify({
        clearance: 3,
        department: 'Cybersécurité & Conformité',
        role: 'security_expert',
        tags: ['expert', 'kb']
      })
    }
  });

  // 1.4 Profils KB associés
  await prisma.kbProfile.upsert({
    where: { userId: 'usr_admin_001' },
    update: {
      kbHandle: '@admin-lead',
      kbRoles: JSON.stringify(['kb:admin', 'kb:review', 'kb:evaluate', 'kb:maintain']),
      ownedDomains: JSON.stringify(['architecture', 'governance']),
      delegated: true,
      isActive: true
    },
    create: {
      userId: 'usr_admin_001',
      kbHandle: '@admin-lead',
      kbRoles: JSON.stringify(['kb:admin', 'kb:review', 'kb:evaluate', 'kb:maintain']),
      ownedDomains: JSON.stringify(['architecture', 'governance']),
      delegated: true,
      isActive: true
    }
  });

  await prisma.kbProfile.upsert({
    where: { userId: expertUser.id },
    update: {
      kbHandle: '@sec-expert',
      kbRoles: JSON.stringify(['kb:review', 'kb:maintain']),
      ownedDomains: JSON.stringify(['security', 'cloud']),
      delegated: true,
      isActive: true
    },
    create: {
      userId: expertUser.id,
      kbHandle: '@sec-expert',
      kbRoles: JSON.stringify(['kb:review', 'kb:maintain']),
      ownedDomains: JSON.stringify(['security', 'cloud']),
      delegated: true,
      isActive: true
    }
  });

  // 2. Comptes Hérités de Rétro-Compatibilité (@example.com)
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: adminPass },
    create: {
      id: 'usr_admin_legacy',
      name: 'Admin Legacy',
      email: 'admin@example.com',
      passwordHash: adminPass,
      role: 'admin',
      attributes: JSON.stringify({
        clearance: 3,
        department: 'Security',
        tags: ['internal']
      })
    }
  });

  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: { passwordHash: userPass },
    create: {
      id: 'usr_user_legacy',
      name: 'User Legacy',
      email: 'user@example.com',
      passwordHash: userPass,
      role: 'user',
      attributes: JSON.stringify({
        clearance: 1,
        department: 'Support',
        tags: ['beta']
      })
    }
  });

  // 3. Règles d'Autorisation Casbin
  await prisma.casbinRule.deleteMany();

  await prisma.casbinRule.createMany({
    data: [
      { ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
      { ptype: 'p', v0: 'user', v1: 'ui:users', v2: 'read' },
      { ptype: 'p', v0: 'user', v1: 'ui:settings', v2: 'read' },
      // Politiques KB
      { ptype: 'p', v0: 'kb:review', v1: 'kb:candidate', v2: 'review' },
      { ptype: 'p', v0: 'kb:evaluate', v1: 'kb:eval', v2: 'run' },
      { ptype: 'p', v0: 'kb:maintain', v1: 'kb:doctrine', v2: 'edit' },
      { ptype: 'p', v0: 'kb:admin', v1: 'kb:*', v2: '*' },
      // Groupements utilisateurs actuels
      { ptype: 'g', v0: 'usr_admin_001', v1: 'admin' },
      { ptype: 'g', v0: 'usr_admin_001', v1: 'kb:admin' },
      { ptype: 'g', v0: 'usr_architect_002', v1: 'user' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'user' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'kb:review' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'kb:maintain' },
      // Groupements utilisateurs hérités
      { ptype: 'g', v0: 'usr_admin_legacy', v1: 'admin' },
      { ptype: 'g', v0: 'usr_user_legacy', v1: 'user' }
    ]
  });

  // 4. Projets et Corpus Exemples
  try {
    const { seedProject } = await import('../scripts/seed');
    await seedProject('examples/suse-telco-cloud', prisma);
    await seedProject('examples/cctp-rfp', prisma);
  } catch (err) {
    console.warn('[seed] Avertissement lors du chargement des exemples :', err);
  }

  console.log('✅ [seed] Base initialisée avec succès (comptes démo @archinex.local, règles Casbin et exemples).');
}

main()
  .catch((e) => {
    console.error('[seed] Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
