import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { paginated } from '@/lib/http/response';
import { offsetFor, pagination } from '@/lib/validation/common';
import { listAuditLog } from '@/lib/audit';

const query = pagination.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(80).optional(),
});

export const GET = route(
  { query, auth: 'required', roles: ['ADMIN'], permission: 'admin:analytics:read' },
  async (ctx) => {
    const { items, total } = await listAuditLog({
      entityType: ctx.query.entityType,
      entityId: ctx.query.entityId,
      action: ctx.query.action,
      limit: ctx.query.pageSize,
      offset: offsetFor(ctx.query),
    });
    return paginated(items, ctx.query.page, ctx.query.pageSize, total);
  },
);
