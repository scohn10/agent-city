import { authEnabled, getUser } from '../../../lib/server/auth';
import { storeEnabled } from '../../../lib/server/store';

export const runtime = 'nodejs';

// GET -> { auth, sync, signedIn, id }
export async function GET(req) {
  const user = await getUser(req);
  return new Response(JSON.stringify({
    auth: authEnabled(),
    sync: storeEnabled(),
    signedIn: !!user,
    id: user?.id || null,
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
