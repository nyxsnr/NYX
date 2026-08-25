import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { EmptyState, PageHeader } from '@/components/ui';
import { VerificationQueue } from './queue';

export const metadata: Metadata = { title: 'Verifications' };
export const dynamic = 'force-dynamic';

export default async function AdminVerificationsPage() {
  await requireAuth(['ADMIN']);

  const records = await sql<
    Array<{
      id: string; kind: string; created_at: Date; user_name: string; user_email: string;
      company_name: string | null; registration_number: string | null; tax_pin: string | null;
    }>
  >`
    SELECT v.id, v.kind::text, v.created_at, u.full_name AS user_name, u.email AS user_email,
           c.name AS company_name, c.registration_number, c.tax_pin
    FROM verification_records v
    JOIN users u ON u.id = v.user_id
    LEFT JOIN employer_profiles ep ON ep.user_id = u.id
    LEFT JOIN companies c ON c.id = ep.company_id
    WHERE v.state = 'PENDING' AND v.kind IN ('BUSINESS_REGISTRATION', 'TAX_PIN', 'IDENTITY')
    ORDER BY v.created_at ASC
  `;

  return (
    <>
      <PageHeader
        title="Verification requests"
        description="Registration details are shown here for review only. They are never displayed publicly or to workers."
      />

      {records.length === 0 ? (
        <EmptyState icon="badge-check" title="Nothing pending." description="No verification requests are waiting." />
      ) : (
        <VerificationQueue
          records={records.map((record) => ({
            id: record.id,
            kind: record.kind,
            createdAt: record.created_at.toISOString(),
            userName: record.user_name,
            userEmail: record.user_email,
            companyName: record.company_name,
            registrationNumber: record.registration_number,
            taxPin: record.tax_pin,
          }))}
        />
      )}
    </>
  );
}
