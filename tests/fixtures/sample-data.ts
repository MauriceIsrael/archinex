import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MaturitySubject } from '../../src/lib/domain/maturityBoard';
import type { TelegraphicDraft } from '../../src/lib/domain/telegraphic';
import type { Statement } from '../../src/lib/types/epistemic';
import type { CorpusDocument } from '../../src/lib/domain/corpus';
import type { DialogueMessage } from '../../src/lib/domain/dialectic';
import type { EngagementProfile } from '../../src/lib/domain/engagements';

function loadJson<T>(relPath: string): T {
  const fullPath = resolve(process.cwd(), relPath);
  const raw = readFileSync(fullPath, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as T;
}

// SUSE Telco Cloud fixtures
export const SUSE_TELCO_SUBJECTS: MaturitySubject[] = loadJson('examples/suse-telco-cloud/subjects.json');
export const SUSE_TELCO_DRAFTS: Record<string, TelegraphicDraft> = loadJson('examples/suse-telco-cloud/drafts.json');
export const SUSE_TELCO_STATEMENTS: Statement[] = loadJson('examples/suse-telco-cloud/statements.json');
export const SUSE_TELCO_CORPUS: CorpusDocument[] = loadJson('examples/suse-telco-cloud/corpus.json');
export const SUSE_TELCO_DIALOGUE_MESSAGES: DialogueMessage[] = loadJson('examples/suse-telco-cloud/dialogue.json');

const suseProjectMeta = loadJson<Partial<EngagementProfile>>('examples/suse-telco-cloud/project.json');
export const SUSE_TELCO_ENGAGEMENT: EngagementProfile = {
  ...suseProjectMeta,
  subjects: SUSE_TELCO_SUBJECTS,
  drafts: SUSE_TELCO_DRAFTS,
  statements: SUSE_TELCO_STATEMENTS,
  corpusDocuments: SUSE_TELCO_CORPUS,
  dialogueMessages: SUSE_TELCO_DIALOGUE_MESSAGES
} as EngagementProfile;

// CCTP RFP fixtures
export const CCTP_SUBJECTS: MaturitySubject[] = loadJson('examples/cctp-rfp/subjects.json');
export const CCTP_DRAFTS: Record<string, TelegraphicDraft> = loadJson('examples/cctp-rfp/drafts.json');
export const CCTP_STATEMENTS: Statement[] = loadJson('examples/cctp-rfp/statements.json');
export const CCTP_CORPUS: CorpusDocument[] = loadJson('examples/cctp-rfp/corpus.json');
export const CCTP_DIALOGUE_MESSAGES: DialogueMessage[] = loadJson('examples/cctp-rfp/dialogue.json');

const cctpProjectMeta = loadJson<Partial<EngagementProfile>>('examples/cctp-rfp/project.json');
export const CCTP_ENGAGEMENT: EngagementProfile = {
  ...cctpProjectMeta,
  subjects: CCTP_SUBJECTS,
  drafts: CCTP_DRAFTS,
  statements: CCTP_STATEMENTS,
  corpusDocuments: CCTP_CORPUS,
  dialogueMessages: CCTP_DIALOGUE_MESSAGES
} as EngagementProfile;

export const INITIAL_CORPUS_DOCUMENTS: CorpusDocument[] = CCTP_CORPUS;

export function createTestDefaultEngagements(
  customCctpSubjects: MaturitySubject[] = CCTP_SUBJECTS,
  customCctpDrafts: Record<string, TelegraphicDraft> = CCTP_DRAFTS,
  customCctpStatements: Statement[] = CCTP_STATEMENTS,
  customCctpMessages: DialogueMessage[] = CCTP_DIALOGUE_MESSAGES
): EngagementProfile[] {
  return [
    SUSE_TELCO_ENGAGEMENT,
    {
      ...CCTP_ENGAGEMENT,
      subjects: customCctpSubjects.length > 0 ? customCctpSubjects : CCTP_SUBJECTS,
      drafts: Object.keys(customCctpDrafts).length > 0 ? customCctpDrafts : CCTP_DRAFTS,
      statements: customCctpStatements.length > 0 ? customCctpStatements : CCTP_STATEMENTS,
      dialogueMessages: customCctpMessages.length > 0 ? customCctpMessages : CCTP_DIALOGUE_MESSAGES
    }
  ];
}

