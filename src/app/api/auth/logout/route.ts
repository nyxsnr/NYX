import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { destroySession } from '@/lib/auth/session';

export const POST = route({ auth: 'optional' }, async () => {
  await destroySession();
  return ok({ signedOut: true });
});
