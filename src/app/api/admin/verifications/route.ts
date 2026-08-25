import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';

/** Employer verification queue. */
export const GET = route(
  { auth: 'required', roles: ['ADMIN'], permission: 'admin:verification:decide' },
  async () => {
    const rows = await sql<
      Array<{ id: string; kind: string; state: string; evidence: unknown; created_at: Date; user_name: string; user_email: string; company_name: string | null; company_id: string | null; registration_number: string | null; tax_pin: string | null }>
    >`
      SELECT v.id, v.kind::text, v.state::text, v.evidence, v.created_at,
             u.full_name AS user_name, u.email AS user_email,
             c.name AS company_name, c.id AS company_id,
             c.registration_number, c.tax_pin
      FROM verification_records v
      JOIN users u ON u.id = v.user_id
      LEFT JOIN employer_profiles ep ON ep.user_id = u.id
      LEFT JOIN companies c ON c.id = ep.company_id
      WHERE v.state = 'PENDING' AND v.kind IN ('BUSINESS_REGISTRATION', 'TAX_PIN', 'IDENTITY')
      ORDER BY v.created_at ASC
    `;
    return ok(rows);
  },
);
