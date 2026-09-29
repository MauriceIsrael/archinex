import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 [seed-dev] Initialisation de la base de développement Archinex...');

  const adminPass = await bcrypt.hash('admin123', 10);
  const userPass = await bcrypt.hash('user123', 10);

  // 1. Utilisateur Lead Architect / Admin
  await prisma.user.upsert({
    where: { email: 'admin@archinex.local' },
    update: { passwordHash: adminPass },
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
    where: { email: 'architect@archinex.local' },
    update: { passwordHash: userPass },
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

  // 3. Règles d'autorisation Casbin
  await prisma.casbinRule.deleteMany();

  await prisma.casbinRule.createMany({
    data: [
      { ptype: 'p', v0: 'admin', v1: '*', v2: '*' },
      { ptype: 'p', v0: 'user', v1: 'ui:users', v2: 'read' },
      { ptype: 'p', v0: 'user', v1: 'ui:settings', v2: 'read' },
      { ptype: 'g', v0: 'usr_admin_001', v1: 'admin' },
      { ptype: 'g', v0: 'usr_architect_002', v1: 'user' }
    ]
  });

  console.log('✅ [seed-dev] Base de développement initialisée avec succès (0 projet).');
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
