import { deepgramEnabled } from '@/lib/services/deepgram';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ streaming: deepgramEnabled() });
}
