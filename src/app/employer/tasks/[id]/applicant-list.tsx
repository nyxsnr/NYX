'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card, MatchBadge } from '@/components/ui';
import { formatKes, timeAgo } from '@/lib/i18n';

interface Applicant {
  applicationId: string;
  status: string;
  appliedAt: string;
  matchScore: number | null;
  matchExplanation: { reasons?: Array<{ factor: string; impact: string; explanation: string }>; gaps?: string[] } | null;
  proposal: string | null;
  proposalAiAssisted: boolean;
  bidAmount: number | null;
  estimatedDays: number | null;
  worker: {
    name: string;
    headline: string | null;
    readinessScore: number;
    verifiedSkillCount: number;
    rating: number | null;
    ratingCount: number;
    tasksCompleted: number;
    completionRate: number | null;
  };
}

export function TaskApplicantList({
  applicants,
  openSlots,
  budget,
}: {
  applicants: Applicant[];
  openSlots: number;
  budget: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function accept(applicationId: string, agreedAmount: number) {
    setBusyId(applicationId);
    setError(null);
    try {
      await api.post(`/api/employer/task-applications/${applicationId}/accept`, { agreedAmount });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign this worker.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      {openSlots <= 0 ? (
        <div className="mb-3">
          <Alert tone="info">This task is fully assigned. No further workers can be accepted.</Alert>
        </div>
      ) : null}

      <ul className="space-y-3">
        {applicants.map((applicant) => {
          const isOpen = expanded === applicant.applicationId;
          const agreed = applicant.bidAmount ?? budget;
          const reasons = applicant.matchExplanation?.reasons ?? [];

          return (
            <li key={applicant.applicationId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{applicant.worker.name}</h3>
                      {applicant.status !== 'SUBMITTED' ? (
                        <Badge tone={applicant.status === 'ACCEPTED' ? 'success' : 'neutral'}>{applicant.status.toLowerCase()}</Badge>
                      ) : null}
                    </div>
                    {applicant.worker.headline ? <p className="mt-0.5 text-sm text-secondary">{applicant.worker.headline}</p> : null}
                    <p className="mt-1 text-sm text-muted">
                      readiness {applicant.worker.readinessScore}/100 · {applicant.worker.verifiedSkillCount} verified skill
                      {applicant.worker.verifiedSkillCount === 1 ? '' : 's'} · {applicant.worker.tasksCompleted} task
                      {applicant.worker.tasksCompleted === 1 ? '' : 's'} completed
                      {applicant.worker.completionRate !== null ? ` · ${applicant.worker.completionRate}% completion` : ''}
                      {applicant.worker.rating !== null ? ` · ${applicant.worker.rating.toFixed(1)}/5` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">Proposed {timeAgo(applicant.appliedAt)}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {applicant.matchScore !== null ? <MatchBadge score={applicant.matchScore} /> : null}
                    <span className="font-semibold tabular-nums">{formatKes(agreed)}</span>
                    {applicant.estimatedDays ? <span className="text-xs text-muted">{applicant.estimatedDays} days</span> : null}
                  </div>
                </div>

                {applicant.proposal ? (
                  <div className="mt-3 rounded-lg surface-sunken p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">Their proposal</h4>
                      {applicant.proposalAiAssisted ? (
                        <span className="text-xs text-muted">Drafted with AI assistance from their profile evidence</span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{applicant.proposal}</p>
                  </div>
                ) : null}

                {reasons.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost mt-2 px-2 text-sm"
                      onClick={() => setExpanded(isOpen ? null : applicant.applicationId)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? 'Hide match reasoning' : 'Why this match score'}
                    </button>
                    {isOpen ? (
                      <ul className="mt-2 space-y-1 rounded-lg surface-sunken p-3 text-sm">
                        {reasons.map((reason) => (
                          <li key={reason.factor} className="flex gap-2">
                            <span
                              aria-hidden="true"
                              className={reason.impact === 'POSITIVE' ? 'text-jade-600 dark:text-jade-300' : reason.impact === 'NEGATIVE' ? 'text-red-600' : 'text-muted'}
                            >
                              {reason.impact === 'POSITIVE' ? '+' : reason.impact === 'NEGATIVE' ? '−' : '·'}
                            </span>
                            <span className="text-secondary">{reason.explanation}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}

                {applicant.status === 'SUBMITTED' && openSlots > 0 ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="btn btn-primary px-4 text-sm"
                      disabled={busyId === applicant.applicationId}
                      onClick={() => accept(applicant.applicationId, agreed)}
                    >
                      {busyId === applicant.applicationId ? 'Assigning…' : `Assign and fund ${formatKes(agreed)}`}
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      This locks {formatKes(agreed)} in escrow immediately. It is released when you
                      approve their work.
                    </p>
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
