import { withTransaction } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting, ownsMeeting } from '@/lib/meetings';
import { deleteRecording } from '@/lib/audio';

export const dynamic = 'force-dynamic';

// Full meeting with transcript.
export async function GET(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(meeting);
}

export async function DELETE(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  let objectKey = null;
  await withTransaction(async (client) => {
    await client.query('DELETE FROM highlights WHERE meeting_id = $1', [params.id]);
    await client.query('DELETE FROM segments WHERE meeting_id = $1', [params.id]);
    await client.query('UPDATE bot_jobs SET meeting_id = NULL WHERE meeting_id = $1', [params.id]);
    const { rows } = await client.query(
      'DELETE FROM meetings WHERE id = $1 RETURNING audio_object_key',
      [params.id]
    );
    objectKey = rows[0]?.audio_object_key || null;
  });
  deleteRecording(params.id, objectKey);
  return Response.json({ ok: true });
}
