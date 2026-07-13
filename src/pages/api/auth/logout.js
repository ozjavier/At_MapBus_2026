import { deleteSession } from '../../../lib/auth.js';
import { SESSION_COOKIE_NAME } from '../../../lib/session.js';

export async function POST({ cookies, redirect }) {
  const sessionId = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });

  return redirect('/login');
}
