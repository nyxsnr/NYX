'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError, queryString } from '@/lib/api-client';
import { Alert, Card, EmptyState, EvidenceBadge, MatchBadge, Skeleton } from '@/components/ui';

interface Candidate {
  profileId: string;
  name: string;
  headline: string | null;
  location: string | null;
  readinessScore: number;
  yearsExperience: number;
  verifiedSkillCount: number;
  skills: Array<{ slug: string; level: string | null; evidence: 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED' }>;
  isAvailable: boolean;
  tasksCompleted: number;
  rating: number | null;
  ratingCount: number;
  match: { score: number; band: string; reasons: Array<{ factor: string; explanation: string; impact: string }> } | null;
}

export function TalentSearch({
  skills,
  regions,
}: {
  skills: Array<{ slug: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
}) {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [regionId, setRegionId] = useState('');
  const [minReadiness, setMinReadiness] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = skillFilter
    ? skills.filter((s) => s.name.toLowerCase().includes(skillFilter.toLowerCase())).slice(0, 40)
    : skills.slice(0, 40);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.get<{ items: Candidate[]; total: number }>(
        `/api/employer/talent${queryString({
          skills: selectedSkills,
          regionId,
          minReadiness,
          verifiedOnly: verifiedOnly ? 'true' : '',
          pageSize: 25,
        })}`,
      );
      setResults(response.items);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={search} className="space-y-4">
          <fieldset>
            <legend className="label">Capabilities you need</legend>
            <input className="input mb-2" placeholder="Search skills" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} aria-label="Search skills" />
            <div className="max-h-40 overflow-y-auto rounded-xl border p-2">
              <div className="flex flex-wrap gap-1.5">
                {filtered.map((skill) => (
                  <button
                    key={skill.slug}
                    type="button"
                    aria-pressed={selectedSkills.includes(skill.slug)}
                    onClick={() =>
                      setSelectedSkills((prev) => (prev.includes(skill.slug) ? prev.filter((s) => s !== skill.slug) : [...prev, skill.slug]))
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      selectedSkills.includes(skill.slug) ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                    }`}
                  >
                    {skill.name}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="region">
                County
              </label>
              <select id="region" className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">Anywhere in Kenya</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="readiness">
                Minimum readiness: {minReadiness}
              </label>
              <input
                id="readiness"
                type="range"
                min={0}
                max={100}
                step={5}
                className="w-full"
                value={minReadiness}
                onChange={(e) => setMinReadiness(Number(e.target.value))}
              />
            </div>

            <label className="flex items-center gap-3 self-end rounded-xl border p-3">
              <input type="checkbox" className="h-4 w-4" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
              <span className="text-sm">Verified evidence only</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Searching…' : 'Search talent'}
          </button>
        </form>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {busy ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : null}

      {results && !busy ? (
        results.length === 0 ? (
          <EmptyState
            icon="search"
            title="No workers match that search."
            description="Try fewer capabilities, a lower readiness threshold, or turn off 'verified evidence only'. You can also post the role and let matching bring people to you."
            actionLabel="Post a job"
            actionHref="/employer/jobs/new"
          />
        ) : (
          <>
            <p className="text-sm text-muted">{total} worker{total === 1 ? '' : 's'} found</p>
            <ul className="space-y-3">
              {results.map((candidate) => (
                <li key={candidate.profileId}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{candidate.name}</h3>
                        {candidate.headline ? <p className="mt-0.5 text-sm text-secondary">{candidate.headline}</p> : null}
                        <p className="mt-1 text-sm text-muted">
                          {candidate.location ?? 'Kenya'} · readiness {candidate.readinessScore}/100 ·{' '}
                          {candidate.yearsExperience} year{candidate.yearsExperience === 1 ? '' : 's'} experience
                          {candidate.rating !== null ? ` · ${candidate.rating.toFixed(1)}/5 (${candidate.ratingCount})` : ''}
                        </p>
                      </div>
                      {candidate.match ? <MatchBadge score={candidate.match.score} band={candidate.match.band} /> : null}
                    </div>

                    {candidate.skills.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {candidate.skills.slice(0, 8).map((skill) => (
                          <li key={skill.slug} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                            <span>{skill.slug.replace(/-/g, ' ')}</span>
                            <EvidenceBadge level={skill.evidence} />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {candidate.match && candidate.match.reasons.length > 0 ? (
                      <p className="mt-3 text-sm text-secondary">
                        <span className="font-medium">Why: </span>
                        {candidate.match.reasons[0]?.explanation}
                      </p>
                    ) : null}

                    <p className="mt-3 text-xs text-muted">
                      {candidate.isAvailable ? 'Available for work' : 'Not currently available'} ·{' '}
                      {candidate.tasksCompleted} task{candidate.tasksCompleted === 1 ? '' : 's'} completed on KaziOS
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}
