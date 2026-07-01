import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Append transcript segments (called by the transcribe pipeline / bot).
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) || {};
  const segments = Array.isArray(body.segments) ? body.segments : [body];
  for (const r of segments) {
    if (r && r.text) {
      await pool.query(
        'INSERT INTO segments (meeting_id, speaker, text, t_offset) VALUES ($1, $2, $3, $4)',
        [params.id, r.speaker || 'Speaker', r.text, r.tOffset || 0]
      );
    }
  }
  return Response.json({ ok: true });
}
