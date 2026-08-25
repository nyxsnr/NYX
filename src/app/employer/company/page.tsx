import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getCompany, requireEmployer } from '@/lib/domain/employers';
import { sql } from '@/lib/db/client';
import { Alert, Card, PageHeader, VerificationBadge } from '@/components/ui';
import { CompanyForm } from './company-form';

export const metadata: Metadata = { title: 'Company profile' };
export const dynamic = 'force-dynamic';

export default async function CompanyPage() {
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);
  const [company, regions, profile] = await Promise.all([
    getCompany(employer.companyId),
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
    sql<{ job_title: string | null }[]>`SELECT job_title FROM employer_profiles WHERE user_id = ${auth.user.id}`,
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Company profile"
        description="What workers see when they consider applying."
        action={<VerificationBadge tier={employer.verificationTier} />}
      />

      {employer.verificationTier === 'UNVERIFIED' ? (
        <div className="mb-6">
          <Alert tone="info" title="Get verified">
            Verified employers get noticeably more and better applicants, because workers on this
            platform are told to be careful with unverified accounts. Verification is reviewed by a
            person, and your registration details are never shown publicly.
          </Alert>
        </div>
      ) : null}

      <CompanyForm
        regions={regions}
        initial={{
          name: company?.name ?? '',
          description: company?.description ?? '',
          industry: company?.industry ?? '',
          sizeBracket: company?.size_bracket ?? '',
          website: company?.website ?? '',
          regionId: company?.region_id ?? '',
          town: company?.town ?? '',
          jobTitle: profile[0]?.job_title ?? '',
        }}
        redirectTo="/employer/company"
        submitLabel="Save company profile"
      />

      {company ? (
        <Card className="mt-6">
          <h2 className="font-semibold">Your record</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Jobs posted</dt>
              <dd className="font-semibold">{company.jobs_posted}</dd>
            </div>
            <div>
              <dt className="text-muted">Tasks posted</dt>
              <dd className="font-semibold">{company.tasks_posted}</dd>
            </div>
            <div>
              <dt className="text-muted">Hires made</dt>
              <dd className="font-semibold">{company.hires_made}</dd>
            </div>
            <div>
              <dt className="text-muted">Worker rating</dt>
              <dd className="font-semibold">
                {company.rating_count >= 3 && company.avg_rating
                  ? `${Number(company.avg_rating).toFixed(1)} / 5`
                  : 'Not enough reviews yet'}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
