/**
 * Deterministic development provider.
 *
 * This is NOT a stub that returns canned strings. It is a rule-based engine
 * that computes each response from the actual input using keyword matching,
 * heuristics and the same rubrics the real evaluator uses. That matters for
 * three reasons:
 *
 *   * the demo environment behaves sensibly without an API key or spend,
 *   * tests can assert on real behaviour instead of fixtures, and
 *   * a broken prompt cannot hide behind plausible-looking canned output.
 *
 * It is registered only when AI_PROVIDER=mock. Production must set
 * AI_PROVIDER=anthropic; `getEnv()` warns loudly if it does not.
 */
import type { ZodTypeAny, z } from 'zod';
import type { AiProvider, StructuredRequest, StructuredResponse } from '../types';
import { EMBEDDING_DIMENSIONS, hashingEmbed, tokenize } from '../embeddings';
import { SKILL_KEYWORDS } from '../skill-keywords';

type Json = Record<string, unknown>;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/** Stable pseudo-random in [0,1) derived from a string — keeps output reproducible. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Find taxonomy skills genuinely mentioned in a body of text.
 *
 * Matching is on word boundaries after punctuation is flattened to spaces, so
 * "Customer support, Excel" matches both terms. Matching on raw spaces alone
 * would silently miss every skill that happens to be followed by a comma —
 * which is most of them, in a real CV's skills list.
 */
function detectSkills(text: string): Array<{ slug: string; name: string; hits: number; quote: string | null }> {
  // Keep alphanumerics plus the characters that appear inside real skill names
  // (C++, .NET, front-end); everything else becomes a separator.
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9+#.\-]+/g, ' ')} `;
  const found: Array<{ slug: string; name: string; hits: number; quote: string | null }> = [];

  for (const entry of SKILL_KEYWORDS) {
    let hits = 0;
    let quote: string | null = null;

    for (const keyword of entry.keywords) {
      const needle = ` ${keyword.toLowerCase().replace(/[^a-z0-9+#.\-]+/g, ' ')} `;
      let idx = normalized.indexOf(needle);
      while (idx !== -1) {
        hits += 1;
        if (!quote) {
          // Offsets are preserved because normalisation is length-preserving
          // for single characters and collapses only runs of separators.
          const start = Math.max(0, idx - 60);
          quote = text.slice(start, Math.min(text.length, idx + keyword.length + 80)).trim();
        }
        idx = normalized.indexOf(needle, idx + 1);
      }
    }

    if (hits > 0) found.push({ slug: entry.slug, name: entry.name, hits, quote });
  }

  return found.sort((a, b) => b.hits - a.hits);
}

function levelFromEvidence(hits: number, years: number): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' {
  const signal = hits + years * 1.5;
  if (signal >= 10) return 'EXPERT';
  if (signal >= 5) return 'ADVANCED';
  if (signal >= 2) return 'INTERMEDIATE';
  return 'BEGINNER';
}

// ---------------------------------------------------------------------------
// CV parsing heuristics
// ---------------------------------------------------------------------------
const SECTION_PATTERNS = {
  education: /(education|academic|qualifications?)\s*:?\s*$/i,
  experience: /(experience|employment|work history|professional background)\s*:?\s*$/i,
  skills: /(skills?|competenc(y|ies)|technical)\s*:?\s*$/i,
  certifications: /(certifications?|licences?|licenses?|training)\s*:?\s*$/i,
};

function splitSections(cvText: string): Record<string, string[]> {
  const lines = cvText.split(/\r?\n/).map((l) => l.trim());
  const sections: Record<string, string[]> = { header: [], education: [], experience: [], skills: [], certifications: [], other: [] };
  let current = 'header';

  for (const line of lines) {
    if (!line) continue;
    let matched = false;
    for (const [name, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (line.length < 60 && pattern.test(line)) {
        current = name;
        matched = true;
        break;
      }
    }
    if (!matched) (sections[current] ??= []).push(line);
  }
  return sections;
}

const YEAR_RANGE = /(19|20)\d{2}\s*(?:-|–|—|to)\s*((19|20)\d{2}|present|current|date)/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(\+?254|0)\s*[71]\d{2}\s*\d{3}\s*\d{3}/;

function parseCv(cvText: string): Json {
  const sections = splitSections(cvText);
  const detected = detectSkills(cvText);

  const experience = (sections.experience ?? [])
    .filter((line) => YEAR_RANGE.test(line) || /\b(at|,)\s+[A-Z]/.test(line))
    .slice(0, 12)
    .map((line) => {
      const years = YEAR_RANGE.exec(line);
      const isCurrent = /present|current|to date/i.test(line);
      const [rolePart, employerPart] = line.split(/\s+(?:at|,|-|–|\|)\s+/);
      return {
        employer: (employerPart ?? 'Not stated').replace(YEAR_RANGE, '').trim().slice(0, 200) || 'Not stated',
        role: (rolePart ?? line).replace(YEAR_RANGE, '').trim().slice(0, 200) || 'Not stated',
        startDate: years ? years[0].split(/-|–|—|to/i)[0]?.trim() ?? null : null,
        endDate: years && !isCurrent ? (years[2] ?? null) : null,
        isCurrent,
        responsibilities: [],
        sourceQuote: line.slice(0, 600),
      };
    });

  const education = (sections.education ?? [])
    .filter((line) => line.length > 8)
    .slice(0, 10)
    .map((line) => {
      const years = YEAR_RANGE.exec(line);
      const [qualification, institution] = line.split(/\s+(?:at|,|-|–|\|| from )\s+/);
      return {
        institution: (institution ?? 'Not stated').replace(YEAR_RANGE, '').trim().slice(0, 200) || 'Not stated',
        qualification: (qualification ?? line).replace(YEAR_RANGE, '').trim().slice(0, 200),
        fieldOfStudy: null,
        startYear: years ? Number(years[0].slice(0, 4)) : null,
        endYear: years && /^(19|20)\d{2}$/.test(years[2] ?? '') ? Number(years[2]) : null,
        grade: /\b(first class|second class|distinction|credit|pass|[A-E][+-]?)\b/i.exec(line)?.[0] ?? null,
      };
    });

  // Earliest start year gives a defensible floor for total experience.
  const startYears = experience
    .map((e) => Number(e.startDate?.slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 1950);
  const totalYears = startYears.length
    ? Math.min(60, Math.max(0, new Date().getFullYear() - Math.min(...startYears)))
    : null;

  return {
    fullName: (sections.header ?? [])[0]?.slice(0, 200) ?? null,
    email: EMAIL_RE.exec(cvText)?.[0] ?? null,
    phone: PHONE_RE.exec(cvText)?.[0] ?? null,
    location: /\b(nairobi|mombasa|kisumu|nakuru|eldoret|thika|nyeri|machakos|kiambu|kakamega)\b/i.exec(cvText)?.[0] ?? null,
    summary:
      `This CV lists ${experience.length} role(s) and ${education.length} education entr(y/ies), ` +
      `with ${detected.length} recognisable skill(s): ${detected.slice(0, 8).map((d) => d.name).join(', ') || 'none clearly stated'}.`,
    totalYearsExperience: totalYears,
    education,
    experience,
    skills: detected.slice(0, 40).map((d) => ({
      name: d.name,
      skillSlug: d.slug,
      level: levelFromEvidence(d.hits, totalYears ?? 0),
      confidence: Math.min(0.9, 0.35 + d.hits * 0.12),
      sourceQuote: d.quote,
    })),
    certifications: (sections.certifications ?? []).slice(0, 20).map((l) => l.slice(0, 200)),
    achievements: (sections.other ?? [])
      .filter((l) => /\b(increased|reduced|led|achieved|awarded|grew|saved|delivered)\b/i.test(l))
      .slice(0, 15)
      .map((l) => l.slice(0, 400)),
    industries: [...new Set((sections.experience ?? []).flatMap((l) =>
      /\b(retail|banking|logistics|agriculture|health|education|technology|hospitality|manufacturing|ngo|telecom)\b/gi.exec(l) ?? [],
    ))].slice(0, 10),
    languages: ['English', 'Kiswahili'].filter((l) => new RegExp(l, 'i').test(cvText)),
    observations: [
      ...(EMAIL_RE.test(cvText) ? [] : ['No email address found in the CV.']),
      ...(PHONE_RE.test(cvText) ? [] : ['No Kenyan phone number found in the CV.']),
      ...(experience.length === 0 ? ['No dated work history could be identified. Add roles with start and end years.'] : []),
      ...(detected.length < 3 ? ['Few recognisable skills were found. List your tools and abilities explicitly.'] : []),
    ].slice(0, 10),
    extractionConfidence: cvText.length < 200 ? 0.25 : Math.min(0.8, 0.4 + detected.length * 0.03),
  };
}

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------
function assessCapabilities(input: Json): Json {
  const statedSkills = strArr(input.statedSkills);
  const cvText = str(input.cvText);
  const interests = strArr(input.interests);
  const yearsExperience = typeof input.yearsExperience === 'number' ? input.yearsExperience : 0;
  const education = str(input.educationLevel, 'NONE');
  const detected = detectSkills([cvText, statedSkills.join(' '), interests.join(' ')].join('\n'));

  const capabilities = detected.slice(0, 25).map((d) => ({
    skillSlug: d.slug,
    displayName: d.name,
    level: levelFromEvidence(d.hits, yearsExperience),
    confidence: Math.min(0.85, 0.3 + d.hits * 0.1),
    rationale: d.quote
      ? `Mentioned in your submitted material: "${d.quote.slice(0, 200)}".`
      : `Derived from the skills you listed.`,
    basis: statedSkills.some((s) => s.toLowerCase().includes(d.name.toLowerCase()))
      ? ('STATED' as const)
      : ('INFERRED_FROM_EXPERIENCE' as const),
  }));

  // Career paths are proposed from the categories the detected skills cluster in.
  const categoryHits = new Map<string, number>();
  for (const d of detected) {
    const entry = SKILL_KEYWORDS.find((s) => s.slug === d.slug);
    if (entry) categoryHits.set(entry.category, (categoryHits.get(entry.category) ?? 0) + d.hits);
  }
  const rankedCategories = [...categoryHits.entries()].sort((a, b) => b[1] - a[1]);

  const PATHS: Record<string, { title: string; route: string; min: number; max: number; needs: string[] }> = {
    'Customer Support': { title: 'Customer Support Agent', route: 'Complete the difficult-customer and ticket-classification simulations, then apply to BPO and e-commerce support roles.', min: 25_000, max: 60_000, needs: ['ticket-triage', 'complaint-handling'] },
    'Virtual Assistance': { title: 'Virtual Assistant', route: 'Prove inbox and scheduling ability through simulations, then take small remote tasks to build a track record.', min: 20_000, max: 70_000, needs: ['calendar-management', 'email-management'] },
    Data: { title: 'Data Assistant', route: 'Demonstrate spreadsheet cleaning and classification accuracy, then take data tasks on the marketplace.', min: 20_000, max: 65_000, needs: ['excel', 'data-entry-cleaning'] },
    Sales: { title: 'Sales / Business Development Representative', route: 'Prove outreach and objection handling, then apply to SME sales roles.', min: 25_000, max: 90_000, needs: ['lead-generation', 'objection-handling'] },
    Marketing: { title: 'Social Media Manager', route: 'Build a portfolio of campaign plans and captions, then take retainer work from small businesses.', min: 25_000, max: 80_000, needs: ['content-calendar', 'social-analytics'] },
    Finance: { title: 'Bookkeeping Assistant', route: 'Demonstrate transaction classification and reconciliation, then support small businesses part-time.', min: 25_000, max: 70_000, needs: ['accounts-reconciliation', 'quickbooks'] },
    'AI & Data Work': { title: 'Data Annotation Specialist', route: 'Prove annotation consistency and quality control, then join annotation projects.', min: 18_000, max: 55_000, needs: ['quality-assurance'] },
    Design: { title: 'Graphic Designer', route: 'Respond to design briefs and publish the results to your portfolio.', min: 25_000, max: 85_000, needs: ['brand-identity'] },
    Software: { title: 'Junior Web Developer', route: 'Ship small landing-page tasks and publish the code, then apply to junior roles.', min: 40_000, max: 120_000, needs: ['javascript'] },
  };

  const heldSlugs = new Set(detected.map((d) => d.slug));
  const recommendedCareerPaths = (rankedCategories.length ? rankedCategories : [['Virtual Assistance', 1] as const])
    .slice(0, 4)
    .map(([category, hits]) => {
      const path = PATHS[category] ?? PATHS['Virtual Assistance'];
      const p = path as NonNullable<typeof path>;
      const educationBoost = ['BACHELORS', 'MASTERS', 'DOCTORATE'].includes(education) ? 8 : 0;
      return {
        title: p.title,
        fitScore: clamp(35 + hits * 6 + yearsExperience * 3 + educationBoost),
        rationale: `Your strongest evidence sits in ${category} (${hits} supporting mention(s) across your material).`,
        typicalEntryRoute: p.route,
        missingSkills: p.needs.filter((n) => !heldSlugs.has(n)),
        indicativeMonthlyIncomeKes: { min: p.min, max: p.max },
      };
    });

  const communication = clamp(40 + Math.min(30, cvText.length / 120) + (detected.some((d) => d.slug === 'written-communication') ? 15 : 0));

  return {
    summary:
      detected.length === 0
        ? 'There is not enough information yet to assess your capabilities. Add your skills or upload a CV, and complete one work simulation so we have something concrete to work from.'
        : `Based on what you have provided, your clearest strengths are in ${rankedCategories.slice(0, 2).map(([c]) => c).join(' and ') || 'general support work'}. These are AI-inferred from your own material and are not yet verified — completing a simulation converts the strongest of them into proven evidence.`,
    capabilities,
    transferableSkills: detected.slice(0, 5).map((d) => ({
      skill: d.name,
      fromContext: d.quote?.slice(0, 200) ?? 'your stated background',
      appliesTo: rankedCategories.slice(0, 3).map(([c]) => c),
    })),
    missingSkills: recommendedCareerPaths
      .flatMap((p) => p.missingSkills.map((s) => ({
        skill: s,
        whyItMatters: `Employers hiring for ${p.title} usually expect this.`,
        howToGet: 'Complete the matching work simulation on KaziOS, then add the result to your profile.',
      })))
      .slice(0, 10),
    recommendedCareerPaths,
    recommendedWorkCategories: rankedCategories.slice(0, 5).map(([c]) => c),
    recommendedSimulations: rankedCategories.slice(0, 3).flatMap(([c]) =>
      SKILL_KEYWORDS.filter((s) => s.category === c).slice(0, 1).map((s) => s.slug),
    ),
    readinessSignals: {
      skillEvidence: clamp(detected.length * 7),
      communication,
      experienceDepth: clamp(yearsExperience * 12 + (education === 'NONE' ? 0 : 15)),
      notes: 'These are provisional signals from self-reported material. Simulation results carry far more weight.',
    },
    overallConfidence: detected.length === 0 ? 0.2 : Math.min(0.75, 0.3 + detected.length * 0.03),
  };
}

function generateSimulation(input: Json): Json {
  const template = obj(input.template);
  const scenario = obj(template.scenario_template ?? template.scenarioTemplate);
  const title = str(template.title, 'Work Simulation');
  const category = str(template.category, 'General');
  const rubric = arr(template.rubric);
  const seed = str(input.seed, title);

  // Materials are built from the template's own scaffold so the exercise is
  // genuinely shaped by the human-authored brief.
  const materials: Json = {
    scenario: str(scenario.context, `A realistic ${category.toLowerCase()} scenario.`),
    persona: str(scenario.persona, 'A professional in this role'),
    items: buildMaterialItems(str(template.slug), seed),
  };

  return {
    title,
    brief:
      `${str(template.description, '')}\n\n` +
      `Scenario: ${materials.scenario}\n` +
      `You are: ${materials.persona}\n\n` +
      'Work through the material below and submit your response. You will be scored against: ' +
      rubric.map((r) => str(obj(r).label)).filter(Boolean).join(', ') + '.',
    materials,
    successCriteria: rubric.map((r) => str(obj(r).description)).filter(Boolean).slice(0, 10),
    estimatedMinutes: typeof template.time_limit_minutes === 'number' ? template.time_limit_minutes : 30,
  };
}

/** Concrete exercise content per template family. Deterministic per seed. */
function buildMaterialItems(slug: string, seed: string): unknown[] {
  const pick = <T,>(options: T[], salt: string): T =>
    options[Math.floor(seeded(seed + salt) * options.length)] as T;

  if (slug.startsWith('va-inbox')) {
    const senders = ['Achieng Otieno', 'Brian Kimani', 'Fatuma Hassan', 'Peter Mwangi', 'Grace Wanjiru'];
    const subjects = [
      { subject: 'URGENT: Client site is down', body: 'Our storefront has been offline since 6am. We are losing sales.', urgent: true },
      { subject: 'Invoice #4471 overdue', body: 'This invoice was due two weeks ago. Please advise on payment.', urgent: true },
      { subject: 'Weekly newsletter — 10 tips', body: 'Marketing newsletter, no action required.', urgent: false },
      { subject: 'Lunch on Friday?', body: 'Are you free for lunch on Friday?', urgent: false },
      { subject: 'Board pack needed by 4pm', body: 'The board meets at 5pm today. We need the pack circulated by 4pm.', urgent: true },
      { subject: 'Staff birthday collection', body: 'Contributing KES 500 for Njeri’s birthday cake.', urgent: false },
      { subject: 'Supplier quotation request', body: 'Please send a quotation for 200 units by end of week.', urgent: false },
      { subject: 'Interview reschedule request', body: 'The candidate asked to move tomorrow’s 9am interview.', urgent: true },
    ];
    return subjects.map((s, i) => ({
      id: i + 1,
      from: pick(senders, `sender${i}`),
      receivedAt: `0${(i % 8) + 1}:${(i * 7) % 60 < 10 ? '0' : ''}${(i * 7) % 60}`,
      ...s,
    }));
  }

  if (slug.startsWith('cs-ticket') || slug.startsWith('data-classification')) {
    const samples = [
      'My package has not arrived and it has been 9 days.',
      'I was charged twice for the same order.',
      'How do I change my delivery address?',
      'Your agent was rude on the phone yesterday.',
      'The app crashes when I open the payments page.',
      'Do you deliver to Kisumu?',
      'I want a refund, the item is damaged.',
      'Please cancel my subscription immediately.',
      'Is the blue version back in stock?',
      'My M-Pesa payment went through but the order shows unpaid.',
      'Can I get an invoice with my KRA PIN on it?',
      'The size chart on your website is wrong.',
    ];
    return samples.map((text, i) => ({ id: i + 1, text }));
  }

  if (slug.startsWith('data-spreadsheet') || slug.startsWith('book-')) {
    const rows = [
      { id: 1, name: 'Jane Wanjiku', phone: '0712345678', date: '2025-01-14', amount: '4500' },
      { id: 2, name: 'jane wanjiku', phone: '+254712345678', date: '14/01/2025', amount: '4,500' },
      { id: 3, name: 'Ali Mohamed', phone: '254733112233', date: '2025-02-30', amount: '3200' },
      { id: 4, name: '', phone: '0722999888', date: '2025-02-11', amount: '-150' },
      { id: 5, name: 'Grace Njeri', phone: '07229', date: '2025-03-01', amount: '7800' },
      { id: 6, name: 'Peter  Otieno', phone: '0733445566', date: '01-03-25', amount: '12000' },
      { id: 7, name: 'Mercy Akinyi', phone: '0700111222', date: '2025-03-15', amount: 'N/A' },
      { id: 8, name: 'Mercy Akinyi', phone: '0700111222', date: '2025-03-15', amount: '5600' },
    ];
    return rows;
  }

  if (slug.startsWith('cs-difficult') || slug.startsWith('va-client')) {
    return [
      {
        from: pick(['Wanjiru K.', 'Omar S.', 'Dennis M.'], 'customer'),
        message: pick(
          [
            'This is the second time my order has failed. I paid via M-Pesa on Monday and nobody has responded. I want my money back today.',
            'I have been waiting three days for the report you promised. This is unprofessional and it is holding up my whole team.',
          ],
          'msg',
        ),
        context: 'Policy: refunds are approved within 5 working days after verification. You cannot promise same-day refunds.',
      },
    ];
  }

  return [{ note: 'Complete the exercise described in the brief.' }];
}

function evaluateSimulation(input: Json): Json {
  const response = str(input.response);
  const rubric = arr(obj(input.simulation).rubric ?? input.rubric);
  const words = tokenize(response);
  const wordCount = response.trim() ? response.trim().split(/\s+/).length : 0;

  // An empty or trivially short response is invalid, not badly scored.
  if (wordCount < 15) {
    return {
      overallScore: 0,
      criterionScores: rubric.slice(0, 1).map((r) => ({
        key: str(obj(r).key, 'overall'),
        label: str(obj(r).label, 'Overall'),
        score: 0,
        evidence: 'The response was empty or too short to assess.',
      })),
      strengths: [],
      weaknesses: ['No substantive response was submitted.'],
      feedback:
        'We could not assess this attempt because no real response was submitted. Re-take the simulation and work through the material properly — there is no penalty for a second attempt.',
      demonstratedSkills: [],
      invalidAttempt: true,
    };
  }

  // Heuristics that genuinely correlate with quality on these exercises.
  const materials = JSON.stringify(obj(input.simulation).materials ?? {});
  const materialTokens = new Set(tokenize(materials));
  const coverage = words.filter((w) => materialTokens.has(w)).length / Math.max(1, materialTokens.size);
  const structure = /(\n\s*[-*\d]|\n\n)/.test(response) ? 1 : 0;
  const reasoning = /(because|therefore|so that|in order to|the reason|priorit|first|then|finally)/i.test(response) ? 1 : 0;
  const hedging = /(i (think|guess)|maybe|not sure|probably)/i.test(response) ? 1 : 0;
  const questions = /\?/.test(response) ? 1 : 0;
  const politeness = /(thank you|apolog|sorry|appreciate|understand)/i.test(response) ? 1 : 0;

  const base =
    38 +
    Math.min(24, coverage * 130) +
    Math.min(14, wordCount / 18) +
    structure * 8 +
    reasoning * 9 +
    questions * 4 +
    politeness * 3 -
    hedging * 6;

  const criterionScores = rubric.slice(0, 10).map((r, i) => {
    const key = str(obj(r).key, `criterion_${i}`);
    const jitter = (seeded(`${key}:${response.slice(0, 64)}`) - 0.5) * 12;
    return {
      key,
      label: str(obj(r).label, key),
      score: clamp(base + jitter),
      evidence:
        `Assessed against "${str(obj(r).description, key)}". ` +
        `Your response covered ${Math.round(coverage * 100)}% of the supplied material, ` +
        `${structure ? 'used a clear structure' : 'was written as unbroken prose'}, and ` +
        `${reasoning ? 'explained its reasoning' : 'did not explain its reasoning'}.`,
    };
  });

  const weightSum = rubric.reduce<number>((acc, r) => acc + (Number(obj(r).weight) || 0), 0) || 1;
  const overall = clamp(
    rubric.reduce<number>(
      (acc, r, i) => acc + (criterionScores[i]?.score ?? 0) * ((Number(obj(r).weight) || 0) / weightSum),
      0,
    ),
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (structure) strengths.push('Your answer is clearly structured and easy to follow.');
  else weaknesses.push('Break your answer into clear sections or numbered points.');
  if (reasoning) strengths.push('You explained the reasoning behind your decisions, not just the decisions.');
  else weaknesses.push('Say why you made each choice — employers assess judgement, not just output.');
  if (coverage > 0.25) strengths.push('You engaged with most of the material you were given.');
  else weaknesses.push('Several items in the brief were not addressed. Work through all of them.');
  if (hedging) weaknesses.push('Avoid hedging language such as "I think" or "maybe" — state your position.');
  if (politeness) strengths.push('Your tone is professional and appropriate for a client-facing role.');

  const skillSlugs = strArr(input.skillSlugs);

  return {
    overallScore: overall,
    criterionScores,
    strengths: strengths.slice(0, 8),
    weaknesses: weaknesses.slice(0, 8),
    feedback:
      `You scored ${overall}/100 on this simulation. ` +
      (overall >= 70
        ? 'That is a solid, employable standard for this kind of work. This result now counts as simulation-verified evidence on your profile.'
        : overall >= 50
          ? 'That is a reasonable attempt with clear room to improve. Work through the weaknesses below and re-take it — your best score is the one that counts.'
          : 'This attempt did not meet the standard employers expect. Read the feedback below carefully, then try again. Re-taking is free and only your best score is shown.'),
    demonstratedSkills:
      overall >= 60
        ? skillSlugs.slice(0, 6).map((slug) => ({
            skillSlug: slug,
            level: overall >= 85 ? 'ADVANCED' : overall >= 70 ? 'INTERMEDIATE' : 'BEGINNER',
            confidence: Math.min(0.95, overall / 100),
          }))
        : [],
    invalidAttempt: false,
  };
}

function decomposeTask(input: Json): Json {
  const brief = str(input.brief);
  const budget = typeof input.budgetKes === 'number' ? input.budgetKes : 0;
  const detected = detectSkills(brief);

  // Recognise the common project shapes an SME actually asks for.
  const SHAPES: Array<{ match: RegExp; tasks: Array<{ title: string; description: string; output: string; category: string; skills: string[]; hours: number; workers: number }> }> = [
    {
      match: /social media|instagram|facebook|tiktok|content/i,
      tasks: [
        { title: 'Build a 4-week content calendar', description: 'Plan themes, formats and posting cadence for each platform, tied to the business objective.', output: 'A spreadsheet or document with a dated post plan for four weeks.', category: 'Marketing', skills: ['content-calendar', 'social-media-management'], hours: 8, workers: 1 },
        { title: 'Create 30 social media posts', description: 'Produce graphics and captions matching the approved calendar and brand voice.', output: '30 post-ready images with captions, organised by publish date.', category: 'Marketing', skills: ['graphic-design', 'caption-writing'], hours: 30, workers: 2 },
        { title: 'Produce 8 short-form videos', description: 'Shoot or edit vertical videos suitable for Reels and TikTok.', output: '8 exported vertical videos under 60 seconds each.', category: 'Marketing', skills: ['video-editing'], hours: 16, workers: 1 },
        { title: 'Schedule and publish posts', description: 'Load the approved content into the scheduling tool and publish on plan.', output: 'All posts scheduled, with a confirmation report.', category: 'Marketing', skills: ['social-media-management'], hours: 6, workers: 1 },
        { title: 'Monitor and respond to engagement', description: 'Reply to comments and messages daily within the agreed tone and escalation rules.', output: 'A daily engagement log for four weeks.', category: 'Customer Support', skills: ['customer-support', 'social-media-management'], hours: 20, workers: 1 },
        { title: 'Report on performance', description: 'Compile reach, engagement and conversion data with recommendations.', output: 'A one-page performance report with three recommendations.', category: 'Marketing', skills: ['social-analytics', 'data-analysis'], hours: 5, workers: 1 },
      ],
    },
    {
      match: /data|spreadsheet|clean|records|database|excel/i,
      tasks: [
        { title: 'Audit the dataset and define rules', description: 'Review a sample, list every error type found and agree the cleaning rules with the client.', output: 'A written cleaning specification approved by the client.', category: 'Data', skills: ['data-analysis', 'attention-to-detail'], hours: 4, workers: 1 },
        { title: 'Clean and standardise records', description: 'Apply the agreed rules across the full dataset, logging every change.', output: 'A cleaned dataset plus a change log.', category: 'Data', skills: ['data-entry-cleaning', 'excel'], hours: 20, workers: 3 },
        { title: 'Quality-check the cleaned data', description: 'Independently sample the output and verify against the specification.', output: 'A QC report with an error rate and any records returned for rework.', category: 'AI & Data Work', skills: ['quality-assurance'], hours: 6, workers: 1 },
      ],
    },
    {
      match: /website|landing page|web|shopify|wordpress/i,
      tasks: [
        { title: 'Agree structure and copy', description: 'Define the page sections, messaging and calls to action.', output: 'An approved wireframe and final copy.', category: 'Marketing', skills: ['content-writing', 'ui-ux-design'], hours: 6, workers: 1 },
        { title: 'Build the page', description: 'Implement the approved design, responsive and fast on low-end Android devices.', output: 'A deployed page with a shareable URL.', category: 'Software', skills: ['web-development', 'html-css'], hours: 16, workers: 1 },
        { title: 'Test and hand over', description: 'Check on real devices and slow connections, fix defects, hand over access.', output: 'A test report and transferred credentials.', category: 'Software', skills: ['quality-assurance'], hours: 4, workers: 1 },
      ],
    },
    {
      match: /research|prospect|leads|customers|market/i,
      tasks: [
        { title: 'Define qualification criteria', description: 'Agree exactly what makes a prospect worth contacting.', output: 'A written criteria document.', category: 'Sales', skills: ['lead-generation'], hours: 3, workers: 1 },
        { title: 'Research and compile the list', description: 'Find matching organisations and verified contact details, citing sources.', output: 'A structured spreadsheet with sources for each entry.', category: 'Data', skills: ['research', 'data-entry'], hours: 18, workers: 2 },
        { title: 'Verify and de-duplicate', description: 'Confirm contactability and remove duplicates and dead entries.', output: 'A verified, de-duplicated list with a verification note per row.', category: 'Data', skills: ['quality-assurance', 'attention-to-detail'], hours: 6, workers: 1 },
      ],
    },
    {
      match: /support|customer service|helpdesk|calls/i,
      tasks: [
        { title: 'Document response templates', description: 'Write approved replies for the most common enquiry types.', output: 'A template library covering the top 10 enquiry types.', category: 'Customer Support', skills: ['written-communication', 'customer-support'], hours: 8, workers: 1 },
        { title: 'Handle the support queue', description: 'Respond to inbound enquiries within the agreed service level.', output: 'A daily handled-volume log with response times.', category: 'Customer Support', skills: ['customer-support', 'ticket-triage'], hours: 40, workers: 2 },
        { title: 'Report recurring issues', description: 'Identify the root causes generating the most contacts.', output: 'A weekly issues report with recommendations.', category: 'Data', skills: ['data-analysis'], hours: 4, workers: 1 },
      ],
    },
  ];

  const shape = SHAPES.find((s) => s.match.test(brief)) ?? {
    tasks: [
      { title: 'Clarify scope and success criteria', description: `Turn the brief into an agreed, specific definition of done: "${brief.slice(0, 200)}"`, output: 'A written scope document approved by you.', category: 'Operations', skills: ['project-coordination', 'written-communication'], hours: 4, workers: 1 },
      { title: 'Deliver the core work', description: 'Execute the agreed scope to the documented standard.', output: 'The agreed deliverable.', category: 'Operations', skills: detected.slice(0, 3).map((d) => d.slug), hours: 16, workers: 1 },
      { title: 'Review and hand over', description: 'Quality-check the output against the scope document and hand over.', output: 'A completed checklist and handover note.', category: 'AI & Data Work', skills: ['quality-assurance'], hours: 4, workers: 1 },
    ],
  };

  const totalHours = shape.tasks.reduce((acc, t) => acc + t.hours, 0);
  // Indicative Kenyan freelance rate; the employer always sets the final budget.
  const HOURLY_KES = 400;
  const tasks = shape.tasks.map((t, i) => ({
    title: t.title,
    description: t.description,
    expectedOutput: t.output,
    category: t.category,
    requiredSkills: t.skills.filter(Boolean).slice(0, 10),
    estimatedHours: t.hours,
    suggestedBudgetKes: budget > 0
      ? Math.round((budget * t.hours) / totalHours)
      : Math.round(t.hours * HOURLY_KES),
    workersNeeded: t.workers,
    qualityRequirements: `Delivered in the stated format, checked before submission, with any assumptions written down.`,
    dependsOn: i === 0 ? [] : [i - 1],
  }));

  return {
    projectTitle: str(input.title) || `${brief.slice(0, 60).trim()}${brief.length > 60 ? '…' : ''}`,
    interpretation: `This brief has been read as a ${tasks.length}-part project totalling roughly ${totalHours} hours of work. Review each part before publishing — nothing is posted until you approve it.`,
    tasks,
    totalEstimatedHours: totalHours,
    totalSuggestedBudgetKes: tasks.reduce((acc, t) => acc + t.suggestedBudgetKes, 0),
    suggestedWorkerProfiles: [...new Set(tasks.flatMap((t) => t.requiredSkills))].slice(0, 8).map((s) => `Worker with proven ${s.replace(/-/g, ' ')}`),
    assumptions: [
      budget > 0 ? `Your stated budget of KES ${budget.toLocaleString()} has been split across tasks by effort.` : 'No budget was given, so figures are indicative at KES 400/hour.',
      'Estimates assume the worker is given the access and materials each task needs.',
    ],
    clarifyingQuestions: [
      'What does success look like at the end of this project?',
      'Which tools or accounts will the worker be given access to?',
      'Is there a hard deadline any part of this must meet?',
    ],
  };
}

function generateJobDescription(input: Json): Json {
  const title = str(input.title, 'Team Member');
  const notes = str(input.notes);
  const company = str(input.companyName, 'the company');
  const arrangement = str(input.workArrangement, 'ONSITE').toLowerCase();
  const type = str(input.employmentType, 'FULL_TIME').replace(/_/g, ' ').toLowerCase();

  // Wording that would discriminate on a protected characteristic is removed
  // from the text that reaches the draft, not merely warned about. A warning
  // the employer skims past would still publish an unlawful advert.
  const DISCRIMINATORY = [
    /\b(fe)?males?\s+only\b/gi,
    /\b(ladies|gentlemen)\s+only\b/gi,
    /\bpreferably\s+(fe)?male\b/gi,
    /\baged?\s+(below|under|over|between)\s+\d+(\s*(and|-)\s*\d+)?\b/gi,
    /\bmust\s+be\s+(under|over)\s+\d+\b/gi,
    /\byoung\s+(candidates?|applicants?|people)\s+only\b/gi,
    /\b(single|married)\s+(only|preferred)\b/gi,
    /\bno\s+children\b/gi,
  ];

  const warnings: string[] = [];
  let cleanedNotes = notes;
  for (const pattern of DISCRIMINATORY) {
    if (pattern.test(cleanedNotes)) {
      cleanedNotes = cleanedNotes.replace(pattern, '');
      pattern.lastIndex = 0;
    }
  }
  cleanedNotes = cleanedNotes.replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();

  if (cleanedNotes !== notes) {
    warnings.push(
      'Your notes contained wording that would discriminate on age, gender or marital status. ' +
        'It has been removed from this draft — such requirements are unlawful under the Employment Act 2007.',
    );
  }
  if (!/\d/.test(str(input.salaryHint))) {
    warnings.push('No salary range was given. Postings with a stated range receive materially more qualified applicants.');
  }

  const detected = detectSkills(`${title} ${cleanedNotes}`);

  return {
    title,
    summary: `${company} is hiring a ${title} on a ${type} basis, working ${arrangement}. ${cleanedNotes ? `${cleanedNotes.slice(0, 600)}` : `This role supports the team's day-to-day delivery and reports to the relevant manager.`}`,
    responsibilities: [
      `Deliver the core day-to-day work of the ${title} role to an agreed standard.`,
      'Keep accurate records of work completed and issues raised.',
      'Communicate progress and blockers to your manager promptly.',
      'Work with colleagues across the business to resolve problems.',
      'Follow company processes and applicable Kenyan regulations.',
    ],
    requirements: [
      ...(detected.slice(0, 4).map((d) => `Demonstrable ${d.name.toLowerCase()} ability.`)),
      'Clear written and spoken communication in English.',
      'Reliable attendance and the ability to meet deadlines.',
    ].slice(0, 12),
    niceToHave: [
      'Previous experience in a similar role.',
      'Kiswahili in addition to English.',
      ...detected.slice(4, 7).map((d) => `Exposure to ${d.name.toLowerCase()}.`),
    ].slice(0, 8),
    suggestedSkills: detected.slice(0, 10).map((d) => d.slug),
    suggestedApplicationQuestions: [
      'Describe a time you handled a difficult situation in a similar role. What did you do?',
      'What is your availability to start?',
      'Which part of this role are you strongest in, and which would you need support with?',
    ],
    warnings,
  };
}

function matchCandidate(input: Json): Json {
  // The deterministic provider defers to the platform's own feature-based
  // scorer, which has already run: it only phrases the explanation.
  const computed = obj(input.computedMatch);
  const score = typeof computed.score === 'number' ? clamp(computed.score) : 50;
  const reasons = arr(computed.reasons);
  const gaps = strArr(computed.gaps);

  return {
    score,
    reasons: reasons.length
      ? reasons.slice(0, 12).map((r) => ({
          factor: str(obj(r).factor, 'Factor'),
          impact: (['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(str(obj(r).impact)) ? str(obj(r).impact) : 'NEUTRAL') as 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL',
          weight: typeof obj(r).weight === 'number' ? Math.max(0, Math.min(1, obj(r).weight as number)) : 0.5,
          explanation: str(obj(r).explanation, 'Contributed to the match score.'),
        }))
      : [{ factor: 'Overall profile', impact: 'NEUTRAL' as const, weight: 1, explanation: 'Scored on the available profile information.' }],
    gaps,
    recommendation: score >= 75 ? 'STRONG_FIT' : score >= 50 ? 'WORTH_REVIEWING' : 'WEAK_FIT',
    summary:
      `This candidate scores ${score}/100 against the requirements. ` +
      (gaps.length ? `The main gaps are: ${gaps.slice(0, 3).join('; ')}. ` : 'No significant gaps were identified against the stated requirements. ') +
      'This score is advisory — review the evidence yourself before deciding.',
  };
}

function generateCareerPlan(input: Json): Json {
  const target = str(input.targetRole, 'a role that matches your strengths');
  const readiness = typeof input.readinessScore === 'number' ? input.readinessScore : 40;
  const missing = strArr(input.missingSkills);
  const hasPortfolio = Boolean(input.hasPortfolio);
  const simulationsDone = typeof input.simulationsCompleted === 'number' ? input.simulationsCompleted : 0;

  const steps: Json[] = [];
  let order = 1;

  if (simulationsDone === 0) {
    steps.push({ order: order++, title: 'Complete your first work simulation', description: 'Simulations are the fastest way to turn a claim into evidence an employer will trust. Pick the one closest to the work you want.', actionType: 'SIMULATION', actionRef: null, estimatedDays: 2, expectedImpact: 'Typically the single largest increase to your proof-of-work score.' });
  }
  if (readiness < 60) {
    steps.push({ order: order++, title: 'Complete your profile', description: 'Fill in your location, availability, tools you have access to, and desired income. Employers filter on these fields, so gaps remove you from searches silently.', actionType: 'PROFILE', actionRef: null, estimatedDays: 1, expectedImpact: 'Makes you visible in employer searches you are currently excluded from.' });
  }
  if (!hasPortfolio) {
    steps.push({ order: order++, title: 'Add two portfolio items', description: 'Add real work you have done, even unpaid or from training. Describe what you did and what changed as a result.', actionType: 'PORTFOLIO', actionRef: null, estimatedDays: 3, expectedImpact: 'Gives employers something concrete to look at beyond your claims.' });
  }
  for (const skill of missing.slice(0, 3)) {
    steps.push({ order: order++, title: `Build evidence in ${skill.replace(/-/g, ' ')}`, description: `This is the most common requirement you currently cannot evidence for ${target}. Complete the matching simulation, then take a small paid task using it.`, actionType: 'SIMULATION', actionRef: skill, estimatedDays: 5, expectedImpact: 'Removes a specific, repeated blocker from your applications.' });
  }
  steps.push({ order: order++, title: 'Practise a role-specific interview', description: `Run an interview simulation for ${target} and act on the feedback before your next real interview.`, actionType: 'INTERVIEW_PRACTICE', actionRef: null, estimatedDays: 2, expectedImpact: 'Improves conversion from interview to offer.' });
  steps.push({ order: order++, title: 'Apply to five well-matched opportunities', description: 'Apply only where your match score is 60 or above and you can evidence the core requirement. Five targeted applications beat fifty generic ones.', actionType: 'APPLY', actionRef: null, estimatedDays: 7, expectedImpact: 'Converts your evidence into real conversations.' });

  return {
    currentPosition: `Your work readiness is currently ${readiness}/100, with ${simulationsDone} completed simulation(s)${hasPortfolio ? ' and portfolio work published' : ' and no portfolio items yet'}.`,
    targetRole: target,
    fitAssessment:
      readiness >= 70
        ? `Your evidence is already at a level where applications to ${target} are worth making now. The plan below sharpens rather than rebuilds.`
        : `There is a real gap between your current evidence and what employers hiring for ${target} ask for. The steps below close it in the order that matters most.`,
    steps: steps.slice(0, 12),
    timelineWeeks: Math.max(2, Math.ceil(steps.reduce((acc, s) => acc + Number(s.estimatedDays), 0) / 5)),
    caveats: [
      'This is a plan, not a promise. KaziOS cannot guarantee employment or income.',
      'Income figures shown anywhere on the platform are indicative ranges, not offers.',
      'Hiring depends on employer demand, which varies by month and by county.',
    ],
  };
}

function simulateInterview(input: Json): Json {
  const role = str(input.roleTitle, 'the role');
  const kind = str(input.interviewKind, 'MIXED');
  const asked = arr(input.previousQuestions).length;
  const lastAnswer = str(input.lastAnswer);
  const maxQuestions = typeof input.maxQuestions === 'number' ? input.maxQuestions : 6;

  const BANK: Record<string, string[]> = {
    SCREENING: [
      `Tell me briefly why you applied for ${role}.`,
      'What is your current availability, and when could you start?',
      'What are your income expectations for this role?',
    ],
    BEHAVIOURAL: [
      'Describe a time you had to deliver under a tight deadline. What did you do?',
      'Tell me about a time you made a mistake at work. How did you handle it?',
      'Describe a disagreement with a colleague or client and how it was resolved.',
      'Give an example of when you had to learn something quickly to get work done.',
    ],
    TECHNICAL: [
      `Walk me through how you would approach a typical day's work in ${role}.`,
      'What tools do you use for this kind of work, and how comfortable are you with each?',
      'How do you check your own work before submitting it?',
    ],
    SITUATIONAL: [
      'A client is unhappy with work you delivered and is threatening not to pay. What do you do?',
      'You are given two urgent tasks with the same deadline and cannot do both. How do you decide?',
    ],
    CLOSING: ['What questions do you have for us?'],
  };

  const order: Array<keyof typeof BANK> =
    kind === 'BEHAVIOURAL'
      ? ['SCREENING', 'BEHAVIOURAL', 'BEHAVIOURAL', 'BEHAVIOURAL', 'SITUATIONAL', 'CLOSING']
      : kind === 'TECHNICAL'
        ? ['SCREENING', 'TECHNICAL', 'TECHNICAL', 'SITUATIONAL', 'TECHNICAL', 'CLOSING']
        : ['SCREENING', 'BEHAVIOURAL', 'TECHNICAL', 'SITUATIONAL', 'BEHAVIOURAL', 'CLOSING'];

  const isFinal = asked >= maxQuestions - 1;
  const slot = order[Math.min(asked, order.length - 1)] as keyof typeof BANK;
  const category = isFinal ? 'CLOSING' : slot;
  const pool = BANK[category] as string[];

  // A thin answer earns a follow-up rather than a new topic — as in a real interview.
  const thinAnswer = lastAnswer.trim().split(/\s+/).length < 25 && lastAnswer.length > 0;
  if (thinAnswer && !isFinal) {
    return {
      question: 'That was quite brief. Can you walk me through a specific example — what the situation was, what you personally did, and what the result was?',
      kind: 'BEHAVIOURAL',
      isFollowUp: true,
      lookingFor: 'A concrete situation with the candidate\'s own actions and a measurable or observable outcome.',
      isFinal: false,
    };
  }

  return {
    question: pool[Math.floor(seeded(`${role}:${asked}`) * pool.length)] as string,
    kind: category === 'SCREENING' ? 'SCREENING' : category === 'CLOSING' ? 'CLOSING' : category === 'TECHNICAL' ? 'TECHNICAL' : category === 'SITUATIONAL' ? 'SITUATIONAL' : 'BEHAVIOURAL',
    isFollowUp: false,
    lookingFor: 'A specific, structured answer grounded in the candidate\'s real experience.',
    isFinal,
  };
}

function evaluateInterview(input: Json): Json {
  const transcript = arr(input.transcript);
  const answers = transcript
    .filter((t) => str(obj(t).role) === 'candidate')
    .map((t) => str(obj(t).content));
  const joined = answers.join('\n');
  const avgWords = answers.length ? joined.split(/\s+/).length / answers.length : 0;

  const specificity = /\b(\d+%|\d+ (customers|clients|orders|days|weeks|months|people)|KES ?[\d,]+)\b/i.test(joined) ? 1 : 0;
  const structure = /\b(situation|task|action|result|first|then|finally|as a result)\b/i.test(joined) ? 1 : 0;
  const ownership = /\bi (did|led|built|handled|resolved|decided|organised|organized)\b/i.test(joined) ? 1 : 0;
  const vagueness = /\b(i think|kind of|sort of|stuff|things|whatever)\b/i.test(joined) ? 1 : 0;

  const base = clamp(35 + Math.min(20, avgWords / 4) + specificity * 15 + structure * 14 + ownership * 12 - vagueness * 8);

  return {
    overallScore: base,
    dimensions: [
      { name: 'Structure', score: clamp(base + (structure ? 8 : -12)), comment: structure ? 'Your answers followed a recognisable structure.' : 'Use situation → action → result so an interviewer can follow you.' },
      { name: 'Specificity', score: clamp(base + (specificity ? 10 : -14)), comment: specificity ? 'You gave concrete numbers and detail.' : 'Add specifics: how many, how long, what changed.' },
      { name: 'Ownership', score: clamp(base + (ownership ? 6 : -10)), comment: ownership ? 'You made clear what you personally did.' : 'Say "I" rather than "we" when describing your own contribution.' },
      { name: 'Depth', score: clamp(30 + avgWords * 1.6), comment: avgWords < 30 ? 'Your answers were short. Aim for 60-120 words per answer.' : 'Your answers had reasonable depth.' },
    ],
    strengths: [
      ...(structure ? ['Clear, followable answer structure.'] : []),
      ...(specificity ? ['Concrete detail that makes your claims credible.'] : []),
      ...(ownership ? ['Clear ownership of your own contribution.'] : []),
    ].slice(0, 8),
    improvements: [
      ...(structure ? [] : ['Structure each answer: the situation, what you did, and what resulted.']),
      ...(specificity ? [] : ['Quantify your examples — numbers make an answer memorable and checkable.']),
      ...(vagueness ? ['Replace vague filler ("stuff", "kind of") with specific nouns.'] : []),
      ...(avgWords < 30 ? ['Give fuller answers — a one-line answer reads as unprepared.'] : []),
    ].slice(0, 8),
    feedback:
      `You scored ${base}/100 across ${answers.length} answer(s). ` +
      (base >= 70
        ? 'This is a competent interview performance. Keep the structure and detail you used here.'
        : 'The main lever for you is specificity: interviewers believe examples with numbers, dates and outcomes far more than general claims. Re-run this simulation after rewriting two of your answers.'),
    exampleAnswer:
      base < 70
        ? 'Model answer shape: "In my last role at [employer], we had [specific problem]. I [specific actions you took]. As a result, [measurable outcome]." Fill this only with things you have actually done.'
        : null,
  };
}

function analyzeApplication(input: Json): Json {
  const requirements = strArr(input.requirements);
  const coverNote = str(input.coverNote);
  const workerSkills = strArr(input.workerSkills);
  const verifiedSkills = strArr(input.verifiedSkills);
  const haystack = `${coverNote} ${workerSkills.join(' ')}`.toLowerCase();

  const alignment = requirements.slice(0, 15).map((requirement) => {
    const words = tokenize(requirement).filter((w) => w.length > 3);
    const hits = words.filter((w) => haystack.includes(w)).length;
    const ratio = words.length ? hits / words.length : 0;
    const verified = verifiedSkills.some((s) => requirement.toLowerCase().includes(s.replace(/-/g, ' ')));
    return {
      requirement,
      met: verified ? ('YES' as const) : ratio >= 0.5 ? ('PARTIAL' as const) : ratio > 0 ? ('PARTIAL' as const) : ('UNKNOWN' as const),
      evidence: verified
        ? 'Backed by simulation-verified evidence on the candidate profile.'
        : ratio > 0
          ? `Partially supported by the candidate's stated skills and cover note.`
          : 'Nothing in the application addresses this requirement.',
    };
  });

  const met = alignment.filter((a) => a.met === 'YES').length;
  const concerns: string[] = [];
  if (coverNote.trim().length < 60) concerns.push('The cover note is very short, so there is little to assess beyond the profile.');
  if (verifiedSkills.length === 0) concerns.push('No skills on this profile are simulation- or employer-verified yet.');
  if (alignment.some((a) => a.met === 'UNKNOWN')) concerns.push('Several stated requirements are not addressed at all in this application.');

  return {
    summary:
      `This candidate clearly evidences ${met} of ${alignment.length} stated requirement(s). ` +
      (verifiedSkills.length ? `Verified capabilities: ${verifiedSkills.slice(0, 5).join(', ')}. ` : '') +
      'This summary is an aid to your review, not a decision.',
    alignment,
    concerns: concerns.slice(0, 8),
    suggestedQuestions: [
      alignment.find((a) => a.met !== 'YES')
        ? `Ask about: ${alignment.find((a) => a.met !== 'YES')?.requirement}`
        : 'Ask for a concrete example of their most relevant recent work.',
      'What would your first two weeks in this role look like?',
      'Which part of this role would you need the most support with?',
    ].slice(0, 6),
    reviewPriority: met >= alignment.length * 0.6 ? 'HIGH' : met > 0 ? 'MEDIUM' : 'LOW',
  };
}

function detectPotentialFraud(input: Json): Json {
  const signals: Json[] = [];
  const text = str(input.content);
  const kind = str(input.entityType, 'unknown');

  const CHECKS: Array<{ rule: string; pattern: RegExp; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; explanation: string }> = [
    { rule: 'advance_fee', pattern: /\b(registration fee|pay .{0,20}(to apply|before)|deposit .{0,15}required|processing fee)\b/i, severity: 'CRITICAL', explanation: 'Asks the worker for money to access work — the defining pattern of employment scams.' },
    { rule: 'offplatform_contact', pattern: /\b(whatsapp me|telegram|dm me on|contact me on \+?\d|email me directly at)\b/i, severity: 'HIGH', explanation: 'Pushes the conversation off-platform before any agreement, which removes payment protection.' },
    { rule: 'unrealistic_pay', pattern: /\b(earn (up to )?(KES ?)?[5-9]\d{2},?\d{3}|\d+k? per day|quick money|easy money)\b/i, severity: 'HIGH', explanation: 'Advertises implausible earnings.' },
    { rule: 'credential_request', pattern: /\b(send .{0,20}(id|passport|kra pin)|mpesa pin|your password|bank (details|pin))\b/i, severity: 'CRITICAL', explanation: 'Requests credentials or identity documents through an unverified channel.' },
    { rule: 'urgency_pressure', pattern: /\b(urgent|immediately|today only|limited slots|act now|first come)\b/i, severity: 'LOW', explanation: 'Uses artificial urgency, a common pressure tactic.' },
    { rule: 'suspicious_link', pattern: /(bit\.ly|tinyurl|t\.co|\.xyz\/|\.top\/|shorturl)/i, severity: 'MEDIUM', explanation: 'Contains a shortened or low-reputation link that hides its destination.' },
    { rule: 'no_company_detail', pattern: /^(?![\s\S]*\b(company|ltd|limited|enterprises|organisation|organization)\b)[\s\S]*$/i, severity: 'LOW', explanation: 'No identifiable organisation is named.' },
  ];

  for (const check of CHECKS) {
    const match = check.pattern.exec(text);
    if (match) {
      signals.push({
        rule: check.rule,
        severity: check.severity,
        explanation: check.explanation,
        evidence: (match[0] ?? '').slice(0, 300) || 'Pattern matched across the whole document.',
      });
    }
  }

  const WEIGHT = { LOW: 8, MEDIUM: 20, HIGH: 35, CRITICAL: 55 } as const;
  const riskScore = clamp(signals.reduce((acc, s) => acc + WEIGHT[str(s.severity, 'LOW') as keyof typeof WEIGHT], 0));

  return {
    riskScore,
    signals: signals.slice(0, 12),
    recommendation: riskScore >= 70 ? 'URGENT_REVIEW' : riskScore >= 40 ? 'REVIEW' : riskScore >= 15 ? 'MONITOR' : 'NO_ACTION',
    summary: signals.length
      ? `${signals.length} risk signal(s) detected on this ${kind}. This is an advisory flag for human review — no account has been restricted.`
      : `No fraud signals detected on this ${kind}.`,
  };
}

function improveCv(input: Json): Json {
  const sections = obj(input.sections);
  const suggestions: Json[] = [];

  for (const [section, value] of Object.entries(sections)) {
    const original = str(value);
    if (!original.trim()) continue;

    let improved = original
      .replace(/\bi was responsible for\b/gi, 'I')
      .replace(/\bhelped (with|to)\b/gi, 'delivered')
      .replace(/\bdid\b/gi, 'handled')
      .replace(/\bworked on\b/gi, 'delivered')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (improved && !/[.!?]$/.test(improved)) improved += '.';

    const reasons: string[] = [];
    if (/responsible for|helped with|worked on/i.test(original)) reasons.push('replaced passive phrasing with active verbs');
    if (!/\d/.test(original)) reasons.push('add a number here — how many, how much, how often — as we cannot invent one for you');
    if (original.length > 400) reasons.push('shortened for scannability');

    if (improved !== original || reasons.length) {
      suggestions.push({
        section: section.slice(0, 120),
        original: original.slice(0, 1000),
        improved: improved.slice(0, 1000),
        reason: reasons.length ? `Suggested because we ${reasons.join(', ')}.` : 'Minor wording and punctuation clean-up.',
      });
    }
  }

  const present = new Set(Object.keys(sections).map((k) => k.toLowerCase()));
  const missingSections = ['summary', 'experience', 'education', 'skills', 'contact']
    .filter((s) => ![...present].some((p) => p.includes(s)))
    .map((s) => `Add a clear ${s} section.`);

  return {
    suggestions: suggestions.slice(0, 15),
    missingSections,
    generalAdvice: [
      'Keep your CV to two pages. Kenyan recruiters skim, and page three is rarely read.',
      'Lead each bullet with what you achieved, not what you were assigned.',
      'Every suggestion here rewrites what you already wrote. Nothing has been added on your behalf — if a bullet needs a number, only you can supply the real one.',
    ],
  };
}

function draftProposal(input: Json): Json {
  const taskTitle = str(input.taskTitle, 'this task');
  const requirements = strArr(input.requirements);
  const verifiedSkills = strArr(input.verifiedSkills);
  const statedSkills = strArr(input.statedSkills);
  const completedTasks = typeof input.completedTasks === 'number' ? input.completedTasks : 0;
  const simulationScores = arr(input.simulationEvidence);

  const claimsUsed: Json[] = [];
  const lines: string[] = [];

  lines.push(`I would like to take on "${taskTitle}".`);

  if (verifiedSkills.length) {
    lines.push(
      `My profile carries simulation-verified evidence in ${verifiedSkills.slice(0, 4).join(', ')}, which you can check directly on my KaziOS profile.`,
    );
    claimsUsed.push({ claim: `Verified in ${verifiedSkills.slice(0, 4).join(', ')}`, backedBy: 'Simulation-verified skills on the worker profile' });
  }

  for (const evidence of simulationScores.slice(0, 2)) {
    const e = obj(evidence);
    lines.push(`I scored ${str(e.score, '?')}/100 on the "${str(e.title, 'relevant')}" work simulation.`);
    claimsUsed.push({ claim: `Simulation score ${str(e.score)}`, backedBy: `Simulation attempt: ${str(e.title)}` });
  }

  if (completedTasks > 0) {
    lines.push(`I have completed ${completedTasks} paid task(s) on KaziOS with work approved by the employer.`);
    claimsUsed.push({ claim: `${completedTasks} completed tasks`, backedBy: 'Approved task assignments on the platform' });
  }

  const unevidenced = requirements.filter(
    (r) => ![...verifiedSkills, ...statedSkills].some((s) => r.toLowerCase().includes(s.replace(/-/g, ' '))),
  );

  lines.push('My plan: confirm exactly what "done" looks like with you, deliver in the format you asked for, and flag anything unclear early rather than guessing.');
  lines.push('Happy to answer questions before you decide.');

  return {
    proposal: lines.join('\n\n').slice(0, 3000),
    claimsUsed: claimsUsed.slice(0, 10),
    gapsToAddress: unevidenced.slice(0, 6).map(
      (r) => `You have no evidence on file for: "${r}". If you genuinely have this experience, add it to your proposal yourself — we will not claim it for you.`,
    ),
  };
}

function agentReply(input: Json): Json {
  const message = str(input.message).toLowerCase();
  const readiness = typeof input.readinessScore === 'number' ? input.readinessScore : 0;
  const name = str(input.workerName, 'there').split(' ')[0] ?? 'there';

  const actions: Json[] = [];
  let reply: string;

  if (/what can i do|don'?t know|no skills|unsure|lost|where.*start/.test(message)) {
    reply =
      `${name}, that is a normal place to start, and it is answerable.\n\n` +
      'Most people already have transferable ability from school, informal work, running a household budget, or helping in a family business — it just has not been written down in the language employers use.\n\n' +
      'The fastest route is to complete one work simulation. It takes about 20 minutes, it is scored against a rubric employers recognise, and it turns "I think I could do this" into evidence on your profile. Start with customer support or data entry — those have the most open work right now.';
    actions.push(
      { label: 'Start a work simulation', actionType: 'SIMULATION', href: '/worker/simulations' },
      { label: 'Complete my profile', actionType: 'PROFILE', href: '/worker/profile' },
    );
  } else if (/cv|resume/.test(message)) {
    reply =
      'Upload your CV and I will extract your education, experience and skills, and show you exactly what I read from each line.\n\n' +
      'I will suggest stronger wording for what you have written, but I will not add employers, dates or achievements you did not state. If a bullet needs a number, only you can supply the real one.';
    actions.push({ label: 'Upload or improve my CV', actionType: 'CV', href: '/worker/cv' });
  } else if (/interview/.test(message)) {
    reply =
      'Interview practice is worth more than another application. Run a role-specific interview simulation: you will get scored on structure, specificity and ownership, with a worked example of a stronger answer.\n\n' +
      'The most common failure is answering in generalities. Interviewers believe examples with numbers and outcomes.';
    actions.push({ label: 'Practise an interview', actionType: 'INTERVIEW_PRACTICE', href: '/worker/interview' });
  } else if (/pay|salary|money|earn|income/.test(message)) {
    reply =
      'Earnings on KaziOS depend on what you can evidence, not what you claim. Task work typically starts small and grows as your completion record builds.\n\n' +
      'Any income figure shown on the platform is an indicative range for that kind of work in Kenya, not an offer and not a promise. The reliable way to raise it is to complete simulations in a category with real employer demand, then take small tasks and deliver them on time.';
    actions.push({ label: 'Browse tasks', actionType: 'BROWSE_TASKS', href: '/worker/tasks' });
  } else if (/reject|no reply|not hearing|no response/.test(message)) {
    reply =
      'Rejection usually comes from one of three things: applying where your evidence does not match the core requirement, an incomplete profile that filters you out silently, or a generic application.\n\n' +
      `Your readiness score is ${readiness}/100. Look at which component is lowest — that is where the return is highest. Then apply only where your match score is 60 or above, and say in one line which requirement you can prove.`;
    actions.push({ label: 'See what to improve', actionType: 'PROFILE', href: '/worker' });
  } else {
    reply =
      `I can help you work out what you are able to do, prove it, and find work that matches it.\n\n` +
      `Your readiness score is ${readiness}/100. The highest-value next step for most people is completing a work simulation — it is the only thing on the platform that converts a claim into verified evidence.\n\n` +
      'What would you like to work on: finding your strengths, improving your CV, practising interviews, or finding work now?';
    actions.push(
      { label: 'Find work', actionType: 'BROWSE_JOBS', href: '/worker/jobs' },
      { label: 'Improve my readiness', actionType: 'SIMULATION', href: '/worker/simulations' },
    );
  }

  return { reply, suggestedActions: actions.slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const HANDLERS: Record<string, (input: Json) => Json> = {
  analyzeCV: (input) => parseCv(str(input.cvText)),
  assessCapabilities,
  generateSimulation,
  evaluateSimulation,
  matchCandidate,
  decomposeTask,
  generateJobDescription,
  generateCareerPlan,
  simulateInterview,
  evaluateInterview,
  analyzeApplication,
  detectPotentialFraud,
  improveCv,
  draftProposal,
  agentReply,
};

export class DeterministicProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'kazios-deterministic-v1';

  async complete<T extends ZodTypeAny>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResponse<z.infer<T>>> {
    const started = Date.now();
    const handler = HANDLERS[request.operation];
    if (!handler) {
      throw new Error(
        `No deterministic handler for AI operation "${request.operation}". ` +
          'Add one in src/lib/ai/providers/mock.ts or run with AI_PROVIDER=anthropic.',
      );
    }

    const raw = handler(request.input ?? {});
    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      // A schema failure here is a bug in this file, not a model problem —
      // fail loudly so it is fixed rather than papered over.
      throw new Error(
        `Deterministic provider produced schema-invalid output for "${request.operation}": ` +
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }

    const serialized = JSON.stringify(raw);
    return {
      data: parsed.data as z.infer<T>,
      meta: {
        provider: this.name,
        model: this.model,
        latencyMs: Date.now() - started,
        inputTokens: Math.ceil(JSON.stringify(request.input ?? {}).length / 4),
        outputTokens: Math.ceil(serialized.length / 4),
        attempts: 1,
      },
    };
  }

  async completeText(
    request: Omit<StructuredRequest<ZodTypeAny>, 'schema' | 'schemaName'>,
  ): Promise<StructuredResponse<string>> {
    const last = request.messages[request.messages.length - 1]?.content ?? '';
    const result = agentReply({ message: last, ...(request.input ?? {}) });
    return {
      data: str(result.reply),
      meta: {
        provider: this.name,
        model: this.model,
        latencyMs: 1,
        inputTokens: Math.ceil(last.length / 4),
        outputTokens: Math.ceil(str(result.reply).length / 4),
        attempts: 1,
      },
    };
  }

  async embed(texts: string[]) {
    return {
      embeddings: texts.map((t) => hashingEmbed(t)),
      model: 'kazios-hashing-v1',
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  async healthy() {
    return true;
  }
}
