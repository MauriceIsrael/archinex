import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 [seed-dev] Initialisation de la base de développement Archinex...');

  const adminPass = await bcrypt.hash('admin123', 10);
  const userPass = await bcrypt.hash('user123', 10);

  // 1. Utilisateur Lead Architect / Admin
  await prisma.user.upsert({
    where: { id: 'usr_admin_001' },
    update: { 
      name: 'Lead Architect (Admin)',
      email: 'admin@archinex.local',
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

  // 2. Utilisateur Contributeur
  await prisma.user.upsert({
    where: { id: 'usr_architect_002' },
    update: {
      name: 'Architecte Domaine',
      email: 'architect@archinex.local',
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

  // 3. Utilisateur Expert KB (Security & Cloud)
  const expertUser = await prisma.user.upsert({
    where: { id: 'usr_expert_003' },
    update: {
      name: 'Expert Sécurité & Cloud',
      email: 'expert@archinex.local',
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

  // Profils KB
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

  // 4. Règles d'autorisation Casbin
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
      // Groupements
      { ptype: 'g', v0: 'usr_admin_001', v1: 'admin' },
      { ptype: 'g', v0: 'usr_admin_001', v1: 'kb:admin' },
      { ptype: 'g', v0: 'usr_architect_002', v1: 'user' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'user' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'kb:review' },
      { ptype: 'g', v0: 'usr_expert_003', v1: 'kb:maintain' }
    ]
  });

  console.log('✅ [seed-dev] Base de développement initialisée avec succès (0 projet, 3 utilisateurs, 2 profils KB).');
  console.log('👉 Pour charger un projet de démonstration : npm run seed -- examples/suse-telco-cloud');
}

main()
  .catch((e) => {
    console.error('[seed-dev] Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
