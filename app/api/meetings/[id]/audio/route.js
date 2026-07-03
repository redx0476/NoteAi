import fs from 'fs';
import { Readable } from 'stream';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';
import { ensureWav, importFile } from '@/lib/audio';
import { s3Enabled, presignGet, getObjectStream } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Audio playback. Authenticates via Bearer header OR ?token= (an <audio>
// element can't send headers). Supports HTTP Range requests for seeking.
//
// When the recording lives in S3 we redirect to a presigned URL (S3 handles
// Range natively). Set S3_PROXY=1 to stream through the server instead — for
// setups where the S3 endpoint (e.g. private MinIO) isn't browser-reachable.
export async function GET(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (s3Enabled()) {
    const { rows } = await pool.query('SELECT audio_object_key FROM meetings WHERE id = $1', [
      params.id,
    ]);
    const key = rows[0]?.audio_object_key;
    if (key) {
      if (process.env.S3_PROXY === '1') {
        const range = request.headers.get('range') || undefined;
        const obj = await getObjectStream(key, range);
        const headers = {
          'Content-Type': obj.contentType || 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        };
        if (obj.contentLength != null) headers['Content-Length'] = String(obj.contentLength);
        if (obj.contentRange) headers['Content-Range'] = obj.contentRange;
        return new Response(Readable.toWeb(obj.body), { status: range ? 206 : 200, headers });
      }
      return Response.redirect(await presignGet(key), 302);
    }
    // No uploaded object yet (e.g. meeting still live) → fall through to disk.
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
