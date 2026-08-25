import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import {
  listWorkerSkills, recomputeReadiness, requireWorkerProfile,
  serializeSkill, upsertWorkerSkill,
} from '@/lib/domain/workers';
import { AIService, recordAssessment } from '@/lib/ai/service';
import { AI_DISCLOSURE } from '@/lib/ai/safety';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const rows = await sql<Array<{ id: string; result: unknown; confidence: string | null; created_at: Date }>>`
    SELECT id, result, confidence, created_at FROM ai_assessments
    WHERE worker_profile_id = ${profile.id} AND kind = 'CAPABILITY_ASSESSMENT'
    ORDER BY created_at DESC LIMIT 1
  `;
  return ok(rows[0] ? { ...rows[0], disclosure: AI_DISCLOSURE } : null);
});

/**
 * Run the capability assessment.
 *
 * Answers "what can this person do?" from their CV, stated skills, interests
 * and any simulation results. Everything it produces is AI_INFERRED and is
 * labelled as such wherever it is displayed.
 */
export const POST = route(
  { auth: 'required', roles: ['WORKER'], permission: 'ai:use', rateLimit: { name: 'aiHeavy', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    await track({ event: 'assessment_started', userId: ctx.auth.user.id, role: 'WORKER' });

    const [cvRows, skills, simulationRows] = await Promise.all([
      sql<{ raw_text: string | null }[]>`
        SELECT raw_text FROM cv_documents
        WHERE worker_profile_id = ${profile.id} AND raw_text IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `,
      listWorkerSkills(profile.id),
      sql<Array<{ title: string; score: number; slugs: string[] | null }>>`
        SELECT t.title, sa.score,
               (SELECT array_agg(s.slug) FROM simulation_template_skills sts
                  JOIN skills s ON s.id = sts.skill_id WHERE sts.template_id = t.id) AS slugs
        FROM simulation_attempts sa
        JOIN simulation_templates t ON t.id = sa.template_id
        WHERE sa.worker_profile_id = ${profile.id} AND sa.state = 'EVALUATED' AND sa.score IS NOT NULL
        ORDER BY sa.score DESC LIMIT 10
      `,
    ]);

    const assessment = await AIService.assessCapabilities(
      {
        cvText: cvRows[0]?.raw_text ?? undefined,
        statedSkills: skills.map((s) => s.name),
        interests: profile.interests,
        educationLevel: profile.education_level,
        yearsExperience: profile.years_experience,
        employmentStatus: profile.employment_status,
        openToDiscovery: profile.open_to_discovery,
        simulationResults: simulationRows.map((r) => ({
          title: r.title,
          score: r.score,
          skills: r.slugs ?? [],
        })),
      },
      { userId: ctx.auth.user.id },
    );

    const assessmentId = await recordAssessment({
      kind: 'CAPABILITY_ASSESSMENT',
      subjectUserId: ctx.auth.user.id,
      workerProfileId: profile.id,
      result: assessment.data,
      confidence: assessment.data.overallConfidence,
      meta: assessment.meta,
    });

    // Inferred capabilities join the ledger at AI_INFERRED — below anything
    // proven, above nothing at all.
    for (const capability of assessment.data.capabilities) {
      await upsertWorkerSkill(profile.id, {
        skillSlug: capability.skillSlug,
        assessedLevel: capability.level,
        evidenceLevel: 'AI_INFERRED',
        confidence: capability.confidence,
        evidence: [{ type: 'assessment', assessmentId, rationale: capability.rationale, basis: capability.basis, at: new Date().toISOString() }],
        source: 'ASSESSMENT',
      });
    }

    // Persist career-path suggestions so the dashboard can show them without
    // paying for another model call.
    await sql`DELETE FROM ai_recommendations WHERE worker_profile_id = ${profile.id} AND kind = 'CAREER_PATH'`;
    for (const path of assessment.data.recommendedCareerPaths) {
      await sql`
        INSERT INTO ai_recommendations (worker_profile_id, kind, score, reasons, gaps, payload)
        VALUES (
          ${profile.id}, 'CAREER_PATH', ${path.fitScore},
          ${json([path.rationale])},
          ${json(path.missingSkills)},
          ${json(path)}
        )
      `;
    }

    const readiness = await recomputeReadiness(profile.id);
    const updatedSkills = await listWorkerSkills(profile.id);

    await track({
      event: 'assessment_completed',
      userId: ctx.auth.user.id,
      role: 'WORKER',
      properties: {
        capabilities: assessment.data.capabilities.length,
        careerPaths: assessment.data.recommendedCareerPaths.length,
        confidence: assessment.data.overallConfidence,
      },
    });

    return ok({
      assessment: assessment.data,
      readiness,
      skills: updatedSkills.map(serializeSkill),
      disclosure: AI_DISCLOSURE,
    });
  },
);
