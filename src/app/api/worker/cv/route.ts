import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { json, sql, withTransaction } from '@/lib/db/client';
import { AppError } from '@/lib/http/errors';
import { sanitizeFileName, storeFile } from '@/lib/storage';
import {
  listWorkerSkills, recomputeReadiness, refreshWorkerEmbedding,
  requireWorkerProfile, serializeSkill, upsertWorkerSkill,
} from '@/lib/domain/workers';
import { AIService, recordAssessment } from '@/lib/ai/service';
import { track } from '@/lib/analytics';
import { SKILL_KEYWORDS } from '@/lib/ai/skill-keywords';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const rows = await sql<
    Array<{ id: string; parse_state: string; parsed: unknown; created_at: Date; file_name: string | null; parse_error: string | null }>
  >`
    SELECT c.id, c.parse_state, c.parsed, c.created_at, c.parse_error, f.file_name
    FROM cv_documents c
    LEFT JOIN files f ON f.id = c.file_id
    WHERE c.worker_profile_id = ${profile.id}
    ORDER BY c.created_at DESC
    LIMIT 5
  `;
  return ok(rows);
});

/**
 * Upload and analyse a CV.
 *
 * Multipart rather than JSON, because the file is the payload. Extracted
 * skills enter the ledger as AI_INFERRED and are shown to the worker with the
 * exact line they came from, so nothing is added to their profile that they
 * cannot see the basis for.
 */
export const POST = route(
  {
    auth: 'required',
    roles: ['WORKER'],
    permission: 'worker:profile:write',
    rateLimit: { name: 'upload', by: 'user' },
    // The body is multipart, so the JSON body reader is bypassed here.
    csrf: true,
  },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    const form = await ctx.request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      throw new AppError('BAD_REQUEST', 'Attach a CV file to upload.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = sanitizeFileName(file.name || 'cv');
    const stored = await storeFile({
      buffer,
      contentType: file.type || 'application/pdf',
      fileName,
      purpose: 'cv',
      ownerId: ctx.auth.user.id,
    });

    // PDF and Word text extraction needs a parser dependency; plain text is
    // read directly. Anything else is stored and flagged so the worker knows
    // extraction did not run, rather than being told it worked.
    const isPlainText = stored.contentType === 'text/plain';
    const rawText = isPlainText ? buffer.toString('utf8').slice(0, 60_000) : null;

    const documentId = await withTransaction(async (tx) => {
      const files = await tx<{ id: string }[]>`
        INSERT INTO files (owner_id, storage_key, provider, file_name, content_type, size_bytes, checksum, purpose)
        VALUES (
          ${ctx.auth.user.id}, ${stored.storageKey}, ${stored.provider}, ${fileName},
          ${stored.contentType}, ${stored.size}, ${stored.checksum}, 'cv'
        )
        RETURNING id
      `;

      await tx`UPDATE cv_documents SET is_primary = false WHERE worker_profile_id = ${profile.id}`;

      const documents = await tx<{ id: string }[]>`
        INSERT INTO cv_documents (worker_profile_id, file_id, raw_text, parse_state, parse_error, is_primary)
        VALUES (
          ${profile.id}, ${files[0]?.id ?? null}, ${rawText},
          ${rawText ? 'PARSING' : 'FAILED'},
          ${rawText ? null : 'Automatic text extraction supports plain text (.txt) in this build. Your file is saved and employers can still download it — paste your CV text below to have it analysed.'},
          true
        )
        RETURNING id
      `;
      return documents[0]?.id ?? '';
    });

    await track({ event: 'cv_uploaded', userId: ctx.auth.user.id, role: 'WORKER', properties: { contentType: stored.contentType } });

    if (!rawText) {
      return ok({
        documentId,
        parseState: 'FAILED',
        message:
          'Your CV is saved and employers can download it. Automatic extraction currently reads plain-text files — paste your CV text to have your skills extracted.',
        analysis: null,
      });
    }

    const analysis = await analyseAndApply(profile.id, ctx.auth.user.id, documentId, rawText);
    return ok(analysis);
  },
);

/**
 * Run extraction over CV text and write the results to the profile.
 *
 * Extracted skills are AI_INFERRED. `upsertWorkerSkill` will not downgrade a
 * skill that already carries stronger evidence.
 */
export async function analyseAndApply(
  profileId: string,
  userId: string,
  documentId: string,
  rawText: string,
) {
  const knownSkillSlugs = SKILL_KEYWORDS.map((s) => s.slug);
  const result = await AIService.analyzeCV({ cvText: rawText, knownSkillSlugs }, { userId });

  const assessmentId = await recordAssessment({
    kind: 'CV_ANALYSIS',
    subjectUserId: userId,
    workerProfileId: profileId,
    entityType: 'cv_document',
    entityId: documentId,
    result: result.data,
    confidence: result.data.extractionConfidence,
    meta: result.meta,
  });

  await sql`
    UPDATE cv_documents
    SET parsed = ${json(result.data)}, parse_state = 'PARSED', parse_error = NULL
    WHERE id = ${documentId}
  `;

  let applied = 0;
  for (const skill of result.data.skills) {
    if (!skill.skillSlug) continue;
    const added = await upsertWorkerSkill(profileId, {
      skillSlug: skill.skillSlug,
      assessedLevel: skill.level,
      evidenceLevel: 'AI_INFERRED',
      confidence: skill.confidence,
      evidence: [
        {
          type: 'cv',
          documentId,
          assessmentId,
          quote: skill.sourceQuote,
          at: new Date().toISOString(),
        },
      ],
      source: 'CV',
    });
    if (added) applied += 1;
  }

  // Only fill years of experience when the CV actually evidenced it, and never
  // overwrite a figure the worker entered themselves.
  if (result.data.totalYearsExperience !== null) {
    await sql`
      UPDATE worker_profiles
      SET years_experience = GREATEST(years_experience, ${Math.round(result.data.totalYearsExperience)})
      WHERE id = ${profileId}
    `;
  }

  await refreshWorkerEmbedding(profileId);
  const readiness = await recomputeReadiness(profileId);
  const skills = await listWorkerSkills(profileId);

  await track({
    event: 'cv_parsed',
    userId,
    role: 'WORKER',
    properties: { skillsFound: result.data.skills.length, skillsApplied: applied, confidence: result.data.extractionConfidence },
  });

  return {
    documentId,
    parseState: 'PARSED' as const,
    analysis: result.data,
    skillsApplied: applied,
    readiness,
    skills: skills.map(serializeSkill),
    disclosure:
      'These skills were extracted from your CV by AI and are marked as AI-inferred, not verified. ' +
      'Complete a work simulation to turn the strongest of them into proven evidence.',
  };
}
