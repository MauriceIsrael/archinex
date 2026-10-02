export * from '$lib/domain/factorization';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatOptions {
	model?: string;
	messages: ChatMessage[];
	format?: 'json';
	temperature?: number;
	maxTokens?: number;
	numCtx?: number;
	timeoutMs?: number;
}
