import { z } from 'zod';

export const CreateProjectSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	shortName: z.string().min(1),
	type: z.enum(['generic_blueprint', 'project_rfp', 'audit_resilience', 'poc_migration']).default('project_rfp'),
	badge: z.string().min(1),
	description: z.string().default(''),
	strategy: z.record(z.string(), z.any()).optional().default({}),
	members: z
		.array(
			z.object({
				userId: z.string().min(1),
				role: z.string().min(1),
				domains: z.array(z.string()).default([])
			})
		)
		.optional()
});

export const UpdateProjectSchema = z.object({
	expectedVersion: z.number().int().positive(),
	title: z.string().min(1).optional(),
	shortName: z.string().min(1).optional(),
	type: z.string().optional(),
	badge: z.string().optional(),
	description: z.string().optional(),
	status: z.enum(['active', 'archived']).optional(),
	strategy: z.record(z.string(), z.any()).optional()
});

export const CreateSubjectSchema = z.object({
	id: z.string().min(1),
	sectionRef: z.string().min(1),
	name: z.string().min(1),
	domain: z.string().default('general'),
	problemStatement: z.string().default(''),
	maturityLevel: z
		.enum(['L0_named', 'L1_framed', 'L2_decomposed', 'L3_decided', 'L4_specified', 'L5_archived'])
		.default('L0_named'),
	deliberationStatus: z
		.enum(['open', 'debating', 'ready_for_arbitration', 'arbitrated'])
		.default('open'),
	waitingForRole: z.string().default('lead_architect'),
	relativeEffort: z.enum(['XS', 'S', 'M', 'L', 'XL']).default('M'),
	blockingCount: z.number().int().nonnegative().default(0),
	unlocksCount: z.number().int().nonnegative().default(0)
});

export const UpdateSubjectSchema = z.object({
	expectedVersion: z.number().int().positive(),
	sectionRef: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
	domain: z.string().optional(),
	problemStatement: z.string().optional(),
	maturityLevel: z
		.enum(['L0_named', 'L1_framed', 'L2_decomposed', 'L3_decided', 'L4_specified', 'L5_archived'])
		.optional(),
	deliberationStatus: z
		.enum(['open', 'debating', 'ready_for_arbitration', 'arbitrated'])
		.optional(),
	waitingForRole: z.string().optional(),
	relativeEffort: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
	blockingCount: z.number().int().nonnegative().optional(),
	unlocksCount: z.number().int().nonnegative().optional()
});

export const CreateStatementSchema = z.object({
	id: z.string().min(1),
	subjectId: z.string().optional().nullable(),
	section: z.string().min(1),
	subjectRef: z.string().min(1),
	predicate: z.string().min(1),
	value: z.string().min(1),
	unit: z.string().optional().nullable(),
	basedOn: z.array(z.string()).default([]),
	appliedRule: z.string().optional().nullable(),
	author: z.string().min(1),
	role: z.string().min(1),
	productionMode: z.enum(['human-authored', 'llm-proposed-human-approved', 'llm-derived']),
	confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']),
	subjectLevel: z
		.enum(['L0_named', 'L1_framed', 'L2_decomposed', 'L3_decided', 'L4_specified', 'L5_archived'])
		.default('L1_framed'),
	consequences: z.string().optional().nullable(),
	status: z.enum(['active', 'contested', 'retracted']).default('active'),
	antecedentIds: z.array(z.string()).optional().default([])
});

export const UpdateStatementSchema = z.object({
	expectedVersion: z.number().int().positive(),
	subjectId: z.string().optional().nullable(),
	section: z.string().min(1).optional(),
	subjectRef: z.string().min(1).optional(),
	predicate: z.string().min(1).optional(),
	value: z.string().min(1).optional(),
	unit: z.string().optional().nullable(),
	basedOn: z.array(z.string()).optional(),
	appliedRule: z.string().optional().nullable(),
	confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed']).optional(),
	subjectLevel: z
		.enum(['L0_named', 'L1_framed', 'L2_decomposed', 'L3_decided', 'L4_specified', 'L5_archived'])
		.optional(),
	consequences: z.string().optional().nullable(),
	status: z.enum(['active', 'contested', 'retracted']).optional(),
	antecedentIds: z.array(z.string()).optional()
});

export const RetractStatementSchema = z.object({
	expectedVersion: z.number().int().positive().optional(),
	reason: z.string().optional()
});

export const CreateQuestionSchema = z.object({
	id: z.string().min(1),
	subjectId: z.string().min(1),
	text: z.string().min(1),
	assignedRole: z.string().default('lead_architect'),
	blocking: z.boolean().default(false),
	status: z.enum(['open', 'answered', 'waived']).default('open')
});

export const UpdateQuestionSchema = z.object({
	expectedVersion: z.number().int().positive(),
	text: z.string().min(1).optional(),
	assignedRole: z.string().optional(),
	blocking: z.boolean().optional(),
	status: z.enum(['open', 'answered', 'waived']).optional()
});

export const ProjectMemberSchema = z.object({
	userId: z.string().min(1),
	role: z.string().min(1),
	domains: z.array(z.string()).default([])
});
