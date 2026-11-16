import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSylvaTwinModel,
  calibrateT1WithKwokResults,
  evaluateSylvaTopologyProfile,
  generateKwokNodeManifests,
  generateKwokWorkloadManifests,
  generateSushyEmulatorConfig,
  runSylvaDigitalTwinMatrix,
  simulateTwinFault,
  SYLVA_LATEST_RELEASE
} from '../../src/lib/domain/edp/sylvaTwin.js';
import { summarizeSylvaTwinProfiles } from '../../src/lib/domain/edp/logicalViews.js';
import { validateRefinedInput } from '../../src/lib/domain/edp/validateRefinedInput.js';
import {
  buildTwinRefinedInputSource,
  evaluateSylvaTwinResilienceOpa
} from '../../src/lib/server/edp/sylvaTwinEvaluation.js';
import { composeMultiAxisHydration } from '../../src/lib/server/edp/refinementCoverage.js';
import { loadOntologyCatalog } from '../../src/lib/server/edp/ontologyClient.js';

describe('Jumeau Numérique de Sylva (Issues #292, #293, #294)', () => {
  it('1. Construit par défaut la baseline 3 DCs (3dc-active, Sylva LATEST) et maintient le quorum etcd + stockage sous perte de DC1', () => {
    const model3Dc = buildSylvaTwinModel();

    expect(model3Dc.sylvaRelease).toBe(SYLVA_LATEST_RELEASE);
    expect(model3Dc.profileId).toBe('3dc-active');
    expect(model3Dc.tierBadge).toBe('Gold');
    expect(model3Dc.failureDomains).toHaveLength(3);
    expect(model3Dc.etcdControlPlane.membersByDomain).toEqual({
      dc1: 1,
      dc2: 1,
      dc3: 1
    });
    expect(model3Dc.bareMetalHosts).toHaveLength(6);
    expect(model3Dc.unitDagValid).toBe(true);
    expect(model3Dc.assumptions.length).toBeGreaterThan(0);

    const dc1Loss = simulateTwinFault(model3Dc, 'dc_loss_primary');
    expect(dc1Loss.etcdSurvivingMembers).toBe(2);
    expect(dc1Loss.etcdQuorumSurvives).toBe(true);
    expect(dc1Loss.storageSurvivingReplicas).toBe(2);
    expect(dc1Loss.storageWritable).toBe(true);
    expect(dc1Loss.rescheduledWorkloadsFit).toBe(true);
    expect(dc1Loss.survivesZeroTouch).toBe(true);
    expect(dc1Loss.estimatedRtoSeconds).toBe(0);
  });

  it('2. Prouve la différence entre 2 DCs secs (perte de quorum sur DC1) et 2 DCs + Témoin/Arbiter (quorum maintenu)', () => {
    const eval2DcSplit = evaluateSylvaTopologyProfile({ profileId: '2dc-split' });
    const eval2DcWitness = evaluateSylvaTopologyProfile({ profileId: '2dc-witness' });

    // 2 DCs secs (2+1) : 4 serveurs Bare-Metal, mais la perte de dc1 fait tomber 2/3 membres etcd
    expect(eval2DcSplit.estimatedBareMetalHosts).toBe(4);
    expect(eval2DcSplit.primaryDcLossSurvives).toBe(false);
    const splitDc1Loss = eval2DcSplit.faultResults.find((f) => f.faultId === 'dc_loss_primary')!;
    expect(splitDc1Loss.etcdSurvivingMembers).toBe(1);
    expect(splitDc1Loss.etcdQuorumSurvives).toBe(false);
    expect(splitDc1Loss.storageWritable).toBe(false);
    expect(splitDc1Loss.estimatedRtoSeconds).toBe(3600);

    // 2 DCs + Témoin (1+1+1 arbiter) : 5 serveurs (4 workers + 1 témoin léger), quorum maintenu !
    expect(eval2DcWitness.estimatedBareMetalHosts).toBe(5);
    expect(eval2DcWitness.hasWitnessSite).toBe(true);
    expect(eval2DcWitness.primaryDcLossSurvives).toBe(true);
    const witnessDc1Loss = eval2DcWitness.faultResults.find(
      (f) => f.faultId === 'dc_loss_primary'
    )!;
    expect(witnessDc1Loss.etcdSurvivingMembers).toBe(2);
    expect(witnessDc1Loss.etcdQuorumSurvives).toBe(true);
    expect(witnessDc1Loss.storageWritable).toBe(true);
    expect(witnessDc1Loss.estimatedRtoSeconds).toBe(0);
  });

  it('3. Génère le bouchon Redfish sushy-tools (sushy-emulator.conf) et les nœuds KWOK pour la CI', () => {
    const model = buildSylvaTwinModel({ profileId: '3dc-active' });
    const sushy = generateSushyEmulatorConfig(model);
    const kwokNodes = generateKwokNodeManifests(model);

    expect(sushy.driver).toBe('fake-in-memory');
    expect(sushy.systems).toHaveLength(6);
    expect(sushy.configText).toContain('SUSHY_EMULATOR_FAKE_SYSTEMS');
    expect(sushy.configText).toContain('srv-dc1-sriov-01');
    expect(sushy.systems.every((s) => s.bmcAddress.startsWith('redfish+http://192.0.2.'))).toBe(
      true
    );

    expect(kwokNodes).toHaveLength(6);
    const firstNode = kwokNodes[0] as Record<string, any>;
    expect(firstNode.kind).toBe('Node');
    expect(firstNode.metadata.annotations['kwok.x-k8s.io/node']).toBe('fake');
    expect(firstNode.status.allocatable['intel.com/sriov_netdevice']).toBe('16');
    expect(firstNode.status.allocatable['hugepages-1Gi']).toBe('64Gi');
  });

  it('4. Arbitre en mode Proposition (recommande 3 DCs Gold) et en mode Fixé par le Client (détecte les exigences contradictoires)', async () => {
    // Mode 1 : Proposition par l'équipe d'architecture
    const proposalReport = runSylvaDigitalTwinMatrix({
      governance: { mode: 'proposal' }
    });
    expect(proposalReport.verdict).toBe('compliant');
    expect(proposalReport.recommendedProfileId).toBe('3dc-active');
    expect(proposalReport.violations).toHaveLength(0);

    // Validation du contrat refined_input.sources.twin_report et de l'oracle OPA
    const refinedSource = buildTwinRefinedInputSource({ report: proposalReport });
    const schemaCheck = validateRefinedInput(refinedSource, [
      { source: 'twin_report', schema_version: '1.0' }
    ]);
    expect(schemaCheck.valid).toBe(true);

    const opaProposal = await evaluateSylvaTwinResilienceOpa(refinedSource);
    expect(opaProposal.verdict).toBe('compliant');
    expect(opaProposal.passedRulesCount).toBe(7);

    // Mode 2 : Client impose '2dc-split' (2 DCs sans témoin) mais exige survie quorum & RTO=0
    const clientMandatedConflict = runSylvaDigitalTwinMatrix({
      governance: {
        mode: 'client-mandated',
        mandatedProfileId: '2dc-split',
        requireEtcdQuorumOnDcLoss: true,
        requireStorageWritableOnDcLoss: true,
        maxAllowedRtoSeconds: 0
      }
    });
    expect(clientMandatedConflict.verdict).toBe('violated');
    expect(
      clientMandatedConflict.violations.some(
        (v) => v.rule === 'twin_rule_01_etcd_quorum_on_dc_loss'
      )
    ).toBe(true);
    expect(
      clientMandatedConflict.violations.some(
        (v) => v.rule === 'twin_rule_02_storage_writable_on_dc_loss'
      )
    ).toBe(true);

    const opaConflict = await evaluateSylvaTwinResilienceOpa(clientMandatedConflict);
    expect(opaConflict.verdict).toBe('violated');
    expect(opaConflict.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('5. Est branché directement dans composeMultiAxisHydration et génère les diagrammes Mermaid avec site témoin', async () => {
    const catalog = await loadOntologyCatalog({ includeRuntimeOverlay: false });
    const hydrated = composeMultiAxisHydration(
      'sub-telco-twin-hydration',
      [
        { urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 },
        { urn: 'urn:archinex:ontology:infrastructure:compute:suse_telco_cloud_sylva', revision: 1 }
      ],
      catalog
    );

    expect(hydrated.sylva_twin_report).toBeDefined();
    expect(hydrated.sylva_twin_report?.defaultProfileId).toBe('3dc-active');
    expect(hydrated.sylva_twin_report?.profiles).toHaveLength(3);

    const summarized = summarizeSylvaTwinProfiles(hydrated.sylva_twin_report!);
    const witnessSummary = summarized.find((p) => p.profileId === '2dc-witness')!;
    expect(witnessSummary.deploymentMermaid).toContain('dc3-witness');
    expect(witnessSummary.deploymentMermaid).toContain('sylva-witness-quorum');

    // Si on force une seule adduction électrique (powerFeedsCount: 1), le jumeau détecte la vulnérabilité PDU-A
    const singleFeedHydrated = composeMultiAxisHydration(
      'sub-telco-single-pdu',
      [{ urn: 'urn:archinex:ontology:infrastructure:server:baremetal', revision: 1 }],
      catalog,
      { powerFeedsCount: 1 }
    );
    expect(singleFeedHydrated.sylva_twin_report?.verdict).toBe('violated');
    expect(
      singleFeedHydrated.sylva_twin_report?.violations.some(
        (v) => v.rule === 'twin_rule_04_dual_power_feed_survival'
      )
    ).toBe(true);
  });

  it('6. Génère les manifestes KWOK (nœuds Ready, taint witness, Deployments SR-IOV/Hugepages) pour le Palier 2', () => {
    const model3Dc = buildSylvaTwinModel({ profileId: '3dc-active' });
    const workloads = generateKwokWorkloadManifests(model3Dc);

    expect(workloads[0].kind).toBe('Namespace');
    const deployments = workloads.filter((w) => w.kind === 'Deployment') as Array<Record<string, any>>;
    expect(deployments.length).toBeGreaterThanOrEqual(5);

    const upf = deployments.find((d) => d.metadata.name === 'twin-upf-cnf')!;
    expect(upf).toBeDefined();
    expect(upf.spec.replicas).toBe(6);
    expect(upf.spec.template.spec.nodeSelector['sylva.org/pool']).toBe('sylva-cnf-sriov-dpdk');
    expect(upf.spec.template.spec.containers[0].resources.limits['intel.com/sriov_netdevice']).toBe('1');
    expect(upf.spec.template.spec.containers[0].resources.limits['hugepages-1Gi']).toBe('16Gi');

    // Vérifie que le nœud témoin du profil 2dc-witness porte bien le taint NoSchedule
    const modelWitness = buildSylvaTwinModel({ profileId: '2dc-witness' });
    const witnessNodes = generateKwokNodeManifests(modelWitness) as Array<Record<string, any>>;
    const arbiter = witnessNodes.find(
      (n) => n.metadata.labels['sylva.org/pool'] === 'sylva-witness-quorum'
    )!;
    expect(arbiter).toBeDefined();
    expect(arbiter.spec.taints[0].key).toBe('sylva.org/witness-only');
    expect(arbiter.spec.taints[0].effect).toBe('NoSchedule');
  });

  it('7. Calibre les prédictions T1 face aux observations kube-scheduler KWOK (T2) et détecte les dérives', () => {
    const t1Eval = evaluateSylvaTopologyProfile({ profileId: '3dc-active' });

    const alignedReport = calibrateT1WithKwokResults(t1Eval, {
      clusterName: 'sylva-twin-ci',
      baseline: {
        totalPods: 33,
        scheduledPods: 33,
        pendingPods: 0,
        unschedulablePodNames: [],
        podsByZone: { dc1: 11, dc2: 11, dc3: 11 }
      },
      dcLossPrimary: {
        drainedZone: 'dc1',
        totalPods: 33,
        scheduledPods: 33,
        pendingPods: 0,
        unschedulablePodNames: [],
        podsByZone: { dc2: 17, dc3: 16 }
      }
    });
    expect(alignedReport.calibrated).toBe(true);
    expect(alignedReport.fidelityReached).toBe(2);
    expect(alignedReport.discrepancies).toHaveLength(0);

    const driftedReport = calibrateT1WithKwokResults(t1Eval, {
      clusterName: 'sylva-twin-ci',
      baseline: {
        totalPods: 33,
        scheduledPods: 33,
        pendingPods: 0,
        unschedulablePodNames: [],
        podsByZone: { dc1: 11, dc2: 11, dc3: 11 }
      },
      dcLossPrimary: {
        drainedZone: 'dc1',
        totalPods: 33,
        scheduledPods: 31,
        pendingPods: 2,
        unschedulablePodNames: ['twin-upf-cnf-01', 'twin-upf-cnf-02'],
        podsByZone: { dc2: 16, dc3: 15 }
      }
    });
    expect(driftedReport.calibrated).toBe(false);
    expect(driftedReport.discrepancies).toHaveLength(1);
    expect(driftedReport.discrepancies[0]).toContain('dc_loss_primary mismatch');
  });

  it('8. Maintient la cohérence entre sushy-emulator.conf, compose.yml et le générateur du Jumeau', () => {
    const model3Dc = buildSylvaTwinModel({ profileId: '3dc-active' });
    const expectedConf = `${generateSushyEmulatorConfig(model3Dc).configText}\n`;
    const actualConf = fs.readFileSync(
      path.resolve('deploy/integrator-tools/sushy-emulator.conf'),
      'utf8'
    );
    expect(actualConf).toBe(expectedConf);

    const composeContent = fs.readFileSync(
      path.resolve('deploy/integrator-tools/compose.yml'),
      'utf8'
    );
    expect(composeContent).toContain('sushy-emulator:');
    expect(composeContent).toContain('quay.io/metal3-io/sushy-tools:latest');
    expect(composeContent).toContain('./sushy-emulator.conf:/etc/sushy/sushy-emulator.conf:ro');
  });
});
