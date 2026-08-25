'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card, MatchBadge } from '@/components/ui';
import { timeAgo } from '@/lib/i18n';

interface Applicant {
  applicationId: string;
  status: string;
  appliedAt: string;
  matchScore: number | null;
  matchExplanation: { reasons?: Array<{ factor: string; impact: string; explanation: string }>; gaps?: string[] } | null;
  coverNote: string | null;
  worker: {
    name: string;
    headline: string | null;
    location: string | null;
    readinessScore: number;
    verifiedSkillCount: number;
    rating: number | null;
    ratingCount: number;
    tasksCompleted: number;
  };
}

const NEXT_ACTIONS: Record<string, Array<{ status: string; label: string; style: string }>> = {
  SUBMITTED: [
    { status: 'SHORTLISTED', label: 'Shortlist', style: 'btn-primary' },
    { status: 'REJECTED', label: 'Not this time', style: 'btn-secondary' },
  ],
  VIEWED: [
    { status: 'SHORTLISTED', label: 'Shortlist', style: 'btn-primary' },
    { status: 'REJECTED', label: 'Not this time', style: 'btn-secondary' },
  ],
  SHORTLISTED: [
    { status: 'INTERVIEWING', label: 'Move to interview', style: 'btn-primary' },
    { status: 'REJECTED', label: 'Not this time', style: 'btn-secondary' },
  ],
  INTERVIEWING: [
    { status: 'OFFERED', label: 'Make an offer', style: 'btn-primary' },
    { status: 'REJECTED', label: 'Not this time', style: 'btn-secondary' },
  ],
  OFFERED: [
    { status: 'HIRED', label: 'Mark as hired', style: 'btn-primary' },
    { status: 'REJECTED', label: 'Offer declined', style: 'btn-secondary' },
  ],
};

export function ApplicantList({ applicants }: { applicants: Applicant[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function decide(applicationId: string, status: string) {
    setBusyId(applicationId);
    setError(null);
    try {
      await api.patch(`/api/employer/applications/${applicationId}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the application.');
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

      <ul className="space-y-3">
        {applicants.map((applicant) => {
          const actions = NEXT_ACTIONS[applicant.status] ?? [];
          const isOpen = expanded === applicant.applicationId;
          const reasons = applicant.matchExplanation?.reasons ?? [];
          const gaps = applicant.matchExplanation?.gaps ?? [];

          return (
            <li key={applicant.applicationId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{applicant.worker.name}</h3>
                      <Badge tone={applicant.status === 'SHORTLISTED' || applicant.status === 'HIRED' ? 'success' : applicant.status === 'REJECTED' ? 'danger' : 'neutral'}>
                        {applicant.status.toLowerCase()}
                      </Badge>
                    </div>
                    {applicant.worker.headline ? <p className="mt-0.5 text-sm text-secondary">{applicant.worker.headline}</p> : null}
                    <p className="mt-1 text-sm text-muted">
                      {applicant.worker.location ?? 'Kenya'} · readiness {applicant.worker.readinessScore}/100 ·{' '}
                      {applicant.worker.verifiedSkillCount} verified skill{applicant.worker.verifiedSkillCount === 1 ? '' : 's'}
                      {applicant.worker.rating !== null
                        ? ` · rated ${applicant.worker.rating.toFixed(1)}/5 (${applicant.worker.ratingCount})`
                        : applicant.worker.tasksCompleted > 0
                          ? ` · ${applicant.worker.tasksCompleted} tasks completed`
                          : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted">Applied {timeAgo(applicant.appliedAt)}</p>
                  </div>

                  {applicant.matchScore !== null ? <MatchBadge score={applicant.matchScore} /> : null}
                </div>

                <button
                  type="button"
                  className="btn btn-ghost mt-2 px-2 text-sm"
                  onClick={() => setExpanded(isOpen ? null : applicant.applicationId)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Hide details' : 'Why this score, and their note'}
                </button>

                {isOpen ? (
                  <div className="mt-2 rounded-lg surface-sunken p-3">
                    {reasons.length > 0 ? (
                      <>
                        <h4 className="text-sm font-semibold">How the score was reached</h4>
                        <ul className="mt-1 space-y-1 text-sm">
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
                      </>
                    ) : null}

                    {gaps.length > 0 ? (
                      <>
                        <h4 className="mt-3 text-sm font-semibold">Gaps</h4>
                        <ul className="mt-1 list-inside list-disc text-sm text-secondary">
                          {gaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    {applicant.coverNote ? (
                      <>
                        <h4 className="mt-3 text-sm font-semibold">Their note</h4>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{applicant.coverNote}</p>
                      </>
                    ) : null}

                    <p className="mt-3 text-xs text-muted">
                      This score ranks applicants for you. It is not a recommendation to reject anyone —
                      the decision is yours.
                    </p>
                  </div>
                ) : null}

                {actions.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        className={`btn ${action.style} px-4 text-sm`}
                        disabled={busyId === applicant.applicationId}
                        onClick={() => decide(applicant.applicationId, action.status)}
                      >
                        {busyId === applicant.applicationId ? 'Saving…' : action.label}
                      </button>
                    ))}
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
