import { json, error, type RequestHandler } from '@sveltejs/kit';
import { PDFParse } from 'pdf-parse';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const { url } = body;

	if (!url || typeof url !== 'string') {
		throw error(400, 'Paramètre url requis');
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			throw new Error('Protocole non supporté');
		}
	} catch {
		throw error(400, 'Format d\'URL invalide (doit débuter par http:// ou https://)');
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);

		const res = await fetch(parsedUrl.toString(), {
			headers: {
				'User-Agent': 'Archinex-RFP-Fetcher/1.0 (Sovereign Architecture Platform)',
				Accept: 'text/plain, text/markdown, text/html, application/json, application/pdf'
			},
			signal: controller.signal
		});

		clearTimeout(timeout);

		if (!res.ok) {
			throw error(res.status, `Échec de la récupération de la ressource distante (HTTP ${res.status})`);
		}

		const contentType = res.headers.get('content-type') || '';
		let text = '';
		let pagesCount = 1;

		if (contentType.includes('application/pdf') || parsedUrl.pathname.toLowerCase().endsWith('.pdf')) {
			const arrayBuffer = await res.arrayBuffer();
			try {
				const parser = new PDFParse({ data: Buffer.from(arrayBuffer) });
				const pdfResult = await parser.getText();
				text = (pdfResult.text || '').trim();
				pagesCount = pdfResult.total || 1;
				await parser.destroy();
			} catch (pdfErr) {
				const errMsg = pdfErr instanceof Error ? pdfErr.message : 'Erreur de lecture PDF';
				throw error(422, `Impossible d'extraire le texte du PDF distant : ${errMsg}`);
			}
		} else {
			text = await res.text();

			// Nettoyage basique si c'est du HTML pour en extraire le corps textuel lisible
			if (contentType.includes('text/html')) {
				text = text
					.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
					.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
					.replace(/<[^>]+>/g, ' ')
					.replace(/\s{2,}/g, ' ')
					.trim();
			}
		}

		const titleMatch = text.match(/(?:titre|cctp|rfp|cahier des charges)[^\n.]{5,60}/i);
		const inferredTitle = titleMatch ? titleMatch[0].trim() : parsedUrl.pathname.split('/').pop() || 'Document RFP Récupéré';

		return json({
			status: 'ok',
			text,
			title: inferredTitle,
			sourceUrl: url,
			length: text.length
		});
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const msg = err instanceof Error ? err.message : 'Erreur réseau';
		throw error(502, `Impossible de récupérer le document à l'adresse indiquée : ${msg}`);
	}
};
