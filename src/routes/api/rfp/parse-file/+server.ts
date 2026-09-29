import { json, error, type RequestHandler } from '@sveltejs/kit';
import { PDFParse } from 'pdf-parse';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type') || '';
		let buffer: Buffer;
		let fileName = 'document.pdf';

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const file = formData.get('file');

			if (!file || typeof file === 'string') {
				throw error(400, 'Aucun fichier transmis dans le champ "file"');
			}

			fileName = file.name || 'document.pdf';
			const arrayBuffer = await file.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
		} else {
			// Upload brut en binaire (ex: application/pdf ou octet-stream)
			const arrayBuffer = await request.arrayBuffer();
			buffer = Buffer.from(arrayBuffer);
			const headerFileName = request.headers.get('x-file-name');
			if (headerFileName) {
				fileName = decodeURIComponent(headerFileName);
			}
		}

		if (buffer.length === 0) {
			throw error(400, 'Le fichier transmis est vide');
		}

		const isPdf = fileName.toLowerCase().endsWith('.pdf') || contentType.includes('application/pdf') || buffer.slice(0, 5).toString('ascii').startsWith('%PDF-');

		let extractedText = '';
		let pagesCount = 1;
		let docTitle = fileName.replace(/\.[^/.]+$/, '');
		let warning: string | null = null;

		if (isPdf) {
			try {
				const parser = new PDFParse({ data: buffer });
				const pdfResult = await parser.getText();
				pagesCount = pdfResult.total || (pdfResult.pages ? pdfResult.pages.length : 1);
				extractedText = (pdfResult.text || '').trim();

				// Tenter d'extraire des métadonnées du document si disponibles
				try {
					const info = await parser.getInfo();
					if (info && info.info && typeof info.info.Title === 'string' && info.info.Title.trim().length > 3) {
						docTitle = info.info.Title.trim();
					}
				} catch {
					// Métadonnées optionnelles
				}

				await parser.destroy();
			} catch (pdfErr: unknown) {
				const errMsg = pdfErr instanceof Error ? pdfErr.message : 'Format PDF corrompu ou non supporté';
				throw error(422, `Impossible de lire la structure du fichier PDF : ${errMsg}`);
			}

			// Vérification si le PDF extrait contient du texte ou s'il s'agit d'un document scanné/image
			if (!extractedText || extractedText.length < 15) {
				warning = "Ce document PDF ne contient aucun calque de texte sélectionnable (document scanné ou image raster sans couche OCR). Archinex n'a pas pu en extraire les articles. Veuillez copier/coller directement le texte ou utiliser une version avec texte numérique.";
			}
		} else {
			// Fichier texte brut, markdown ou json
			extractedText = buffer.toString('utf-8').trim();
		}

		// Si un titre plus pertinent est détecté dans le premier paragraphe du texte
		const titleMatch = extractedText.match(/^(?:#\s*|cctp\s*[-:]|rfp\s*[-:]|cahier des charges\s*[-:])([^\n]{5,80})/i);
		if (titleMatch && titleMatch[1]) {
			docTitle = titleMatch[1].trim();
		}

		return json({
			status: 'ok',
			fileName,
			title: docTitle,
			pagesCount,
			length: extractedText.length,
			hasText: extractedText.length >= 15,
			text: extractedText,
			warning
		});
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const msg = err instanceof Error ? err.message : 'Erreur interne de traitement';
		throw error(500, `Erreur lors de l'extraction du document : ${msg}`);
	}
};
