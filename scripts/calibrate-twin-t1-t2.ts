#!/usr/bin/env tsx
/**
 * Script CI de calibration T1 <-> T2 :
 * Confronte les prédictions analytiques T1 (t1-evaluation.json) aux placements
 * observés sur kube-scheduler via KWOK (kwok-observation.json).
 */

import * as fs from 'node:fs';
import {
  calibrateT1WithKwokResults,
  type KwokClusterPlacementObservation,
  type SylvaTwinProfileEvaluation
} from '../src/lib/domain/edp/sylvaTwin.js';

function parseArgs(argv: string[]) {
  let t1Path = '';
  let t2Path = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--t1' && argv[i + 1]) {
      t1Path = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--t2' && argv[i + 1]) {
      t2Path = argv[i + 1];
      i += 1;
    }
  }
  if (!t1Path || !t2Path) {
    console.error('Usage: tsx scripts/calibrate-twin-t1-t2.ts --t1 <t1-evaluation.json> --t2 <kwok-observation.json>');
    process.exit(2);
  }
  return { t1Path, t2Path };
}

function main() {
  const { t1Path, t2Path } = parseArgs(process.argv.slice(2));
  const t1Eval = JSON.parse(fs.readFileSync(t1Path, 'utf8')) as SylvaTwinProfileEvaluation;
  const observation = JSON.parse(fs.readFileSync(t2Path, 'utf8')) as KwokClusterPlacementObservation;

  const report = calibrateT1WithKwokResults(t1Eval, observation);
  console.log(JSON.stringify(report, null, 2));

  if (!report.calibrated) {
    console.error(`❌ ${report.summary}`);
    process.exit(1);
  }
  console.log(`✅ ${report.summary}`);
}

main();
