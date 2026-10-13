import { json } from '@sveltejs/kit';
import { llmopsClient } from '$lib/server/llmops/client';
import {
  lookupDefaultFrameworkVersion,
  isGenericFrameworkVersion
} from '$lib/domain/regulatoryFrameworks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;
  const status = url.searchParams.get('status') || undefined;

  const result = await llmopsClient.listFrameworkIngestions(actorEmail, status);

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error') {
    return json({ status: 'error', error: result.error }, { status: 400 });
  }

  return json({
    status: 'ok',
    data: result.data || []
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const actorEmail =
    locals.session?.user?.email || undefined;

  const contentType = request.headers.get('content-type') || '';

  let framework_id = '';
  let framework_name = '';
  let version = '';
  let domain = 'security';
  let file_name = '';
  let file_format = 'txt';
  let file_size_bytes = 0;
  let raw_text = '';
  let requirements: any[] | undefined = undefined;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    framework_id = (formData.get('framework_id') as string) || '';
    framework_name = (formData.get('framework_name') as string) || '';
    version = (formData.get('version') as string) || '';
    domain = (formData.get('domain') as string) || 'security';

    if (file) {
      file_name = file.name;
      file_size_bytes = file.size;

      // 20 Mo max = 20 * 1024 * 1024 = 20971520 octets
      if (file_size_bytes > 20 * 1024 * 1024) {
        return json(
          { status: 'error', error: 'Fichier trop volumineux (taille maximale autorisée : 20 Mo)' },
          { status: 413 }
        );
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const allowed = ['pdf', 'html', 'htm', 'txt', 'md', 'docx'];
      if (!allowed.includes(ext)) {
        return json(
          {
            status: 'error',
            error: `Format .${ext} non supporté. Formats autorisés : .pdf, .html, .txt, .md, .docx`
          },
          { status: 400 }
        );
      }
      file_format = ext === 'htm' ? 'html' : ext;

      try {
        raw_text = await file.text();
      } catch {
        raw_text = `Contenu binaire du fichier ${file.name}`;
      }
    }
  } else {
    // JSON Payload
    try {
      const body = await request.json();
      framework_id = body.framework_id || '';
      framework_name = body.framework_name || '';
      version = body.version || '';
      domain = body.domain || 'security';
      file_name = body.file_name || '';
      file_format = body.file_format || 'txt';
      file_size_bytes = body.file_size_bytes || 1024;
      raw_text = body.raw_text || '';
      requirements = body.requirements;

      if (file_size_bytes > 20 * 1024 * 1024) {
        return json(
          { status: 'error', error: 'Fichier trop volumineux (taille maximale autorisée : 20 Mo)' },
          { status: 413 }
        );
      }
    } catch {
      return json({ status: 'error', error: 'Format JSON invalide' }, { status: 400 });
    }
  }

  if (!framework_id && file_name) {
    framework_id = file_name.replace(/\.[^/.]+$/, '').toUpperCase();
  }

  if (!framework_id) {
    return json(
      { status: 'error', error: 'L’identifiant du référentiel (framework_id) ou un fichier est requis' },
      { status: 400 }
    );
  }

  // Refuser les versions manifestement génériques (#93)
  if (version && isGenericFrameworkVersion(version)) {
    return json(
      {
        status: 'error',
        error: `La version « ${version} » est générique. Renseignez la version officielle du référentiel (ex: 2022/2555 pour NIS2, 2024/2847 pour CRA).`
      },
      { status: 400 }
    );
  }

  // Pré-remplir la version selon le catalogue si non spécifiée
  if (!version) {
    const autoVer = lookupDefaultFrameworkVersion(framework_id) || lookupDefaultFrameworkVersion(framework_name);
    if (autoVer && !isGenericFrameworkVersion(autoVer)) {
      version = autoVer;
    } else {
      return json(
        {
          status: 'error',
          error: 'La version du référentiel est requise. Renseignez la version officielle (ex: 2022/2555 pour NIS2, 2024/2847 pour CRA).'
        },
        { status: 400 }
      );
    }
  }

  const result = await llmopsClient.ingestFramework(
    {
      framework_id,
      framework_name: framework_name || framework_id,
      version,
      domain,
      file_name: file_name || `${framework_id.toLowerCase()}.${file_format}`,
      file_format,
      file_size_bytes,
      raw_text,
      requirements
    },
    actorEmail
  );

  if (result.status === 'too_large') {
    return json({ status: 'error', error: result.error }, { status: 413 });
  }

  if (result.status === 'unavailable') {
    return json({ status: 'unavailable', error: result.error }, { status: 503 });
  }

  if (result.status === 'error' || !result.data) {
    return json({ status: 'error', error: result.error || 'Erreur lors de l’ingestion' }, { status: 400 });
  }

  return json(
    {
      status: 'ok',
      data: result.data
    },
    { status: 201 }
  );
};
