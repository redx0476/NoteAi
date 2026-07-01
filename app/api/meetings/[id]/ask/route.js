import { getUserFromRequest } from '@/lib/auth';
import { getMeeting } from '@/lib/meetings';
import { askMeeting } from '@/lib/services/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Ask a question about the meeting (chat).
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) || {};
  const answer = await askMeeting(meeting.segments, body.question || '', body.model);
  return Response.json({ answer });
}
