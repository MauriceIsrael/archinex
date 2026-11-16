#!/usr/bin/env tsx
/**
 * Génère le bundle d'exécution CI Palier 2 du Jumeau Numérique Sylva :
 *  - sushy-emulator.conf (bouchon Redfish BMC capm3)
 *  - kwok-nodes.json (manifestes Node KWOK avec hugepages-1Gi & SR-IOV)
 *  - kwok-workloads.json (Namespace + Deployments des charges Telco)
 *  - helm-values.json (valeurs Sylva LATEST pour helm template)
 *  - t1-evaluation.json (prédictions analytiques T1 pour calibration T1 <-> T2)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  evaluateSylvaTopologyProfile,
  generateKwokWorkloadManifests,
  type SylvaTopologyProfileId
} from '../src/lib/domain/edp/sylvaTwin.js';

function parseArgs(argv: string[]) {
  let outDir = '.twin-ci-bundle';
  let profileId: SylvaTopologyProfileId = '3dc-active';
  let writeIntegratorConf = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      outDir = argv[i + 1];
      i += 1;
    } else if (arg === '--profile' && argv[i + 1]) {
      profileId = argv[i + 1] as SylvaTopologyProfileId;
      i += 1;
    } else if (arg === '--write-integrator-conf') {
      writeIntegratorConf = true;
    }
  }
  return { outDir, profileId, writeIntegratorConf };
}

function main() {
  const { outDir, profileId, writeIntegratorConf } = parseArgs(process.argv.slice(2));
  const resolvedOut = path.resolve(outDir);
  fs.mkdirSync(resolvedOut, { recursive: true });

  const t1Eval = evaluateSylvaTopologyProfile({ profileId });
  const workloads = generateKwokWorkloadManifests(t1Eval.model);

  const kwokNodesList = {
    apiVersion: 'v1',
    kind: 'List',
    items: t1Eval.kwokNodes
  };

  const kwokWorkloadsList = {
    apiVersion: 'v1',
    kind: 'List',
    items: workloads
  };

  const helmValues = {
    cluster: {
      name: `archinex-sylva-${profileId}`,
      namespace: 'sylva-system',
      sylva_release: t1Eval.model.sylvaRelease,
      capi_providers: {
        infra_provider: 'capm3',
        bootstrap_provider: 'cabpr'
      },
      k8s_version: 'v1.28.11+rke2r1',
      os_image_selector: {
        os: 'sle-micro',
        release: '5.5',
        hardened: true
      }
    },
    units: {
      cilium: { enabled: true },
      kyverno: { enabled: true },
      metallb: { enabled: true },
      vault: { enabled: true },
      multus: { enabled: true },
      sriov: { enabled: true }
    },
    baremetal_hosts: t1Eval.model.bareMetalHosts.map((h) => ({
      name: h.name,
      datacenter: h.datacenter,
      pool: h.pool,
      bootMACAddress: h.bootMACAddress,
      bmcAddress: h.bmcAddress
    }))
  };

  fs.writeFileSync(path.join(resolvedOut, 'sushy-emulator.conf'), `${t1Eval.sushyEmulator.configText}\n`, 'utf8');
  fs.writeFileSync(path.join(resolvedOut, 'kwok-nodes.json'), JSON.stringify(kwokNodesList, null, 2), 'utf8');
  fs.writeFileSync(path.join(resolvedOut, 'kwok-workloads.json'), JSON.stringify(kwokWorkloadsList, null, 2), 'utf8');
  fs.writeFileSync(path.join(resolvedOut, 'helm-values.json'), JSON.stringify(helmValues, null, 2), 'utf8');
  fs.writeFileSync(path.join(resolvedOut, 't1-evaluation.json'), JSON.stringify(t1Eval, null, 2), 'utf8');

  if (writeIntegratorConf) {
    const integratorConfPath = path.resolve('deploy/integrator-tools/sushy-emulator.conf');
    fs.writeFileSync(integratorConfPath, `${t1Eval.sushyEmulator.configText}\n`, 'utf8');
    console.log(`✅ Mis à jour : ${integratorConfPath}`);
  }

  console.log(`✅ Bundle CI Jumeau Sylva (${profileId}) généré dans : ${resolvedOut}`);
  console.log(`   - sushy-emulator.conf : ${t1Eval.sushyEmulator.systems.length} BMC Redfish`);
  console.log(`   - kwok-nodes.json     : ${t1Eval.kwokNodes.length} Node(s) KWOK`);
  console.log(`   - kwok-workloads.json : ${workloads.length - 1} Deployment(s)`);
}

main();
