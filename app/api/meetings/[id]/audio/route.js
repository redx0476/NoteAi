import fs from 'fs';
import { Readable } from 'stream';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';
import { ensureWav, importFile } from '@/lib/audio';

export const dynamic = 'force-dynamic';

// Audio playback. Authenticates via Bearer header OR ?token= (an <audio>
// element can't send headers). Supports HTTP Range requests for seeking.
export async function GET(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  let filePath;
  let mime;
  const wav = ensureWav(params.id);
  if (wav) {
    filePath = wav;
    mime = 'audio/wav';
  } else {
    const imp = importFile(params.id);
    if (!imp) return Response.json({ error: 'No recording' }, { status: 404 });
    filePath = imp.path;
    mime = imp.mime;
  }

  const stat = fs.statSync(filePath);
  const range = request.headers.get('range');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match && match[1] ? parseInt(match[1], 10) : 0;
    let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}
