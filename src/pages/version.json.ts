// /version.json: what the newest build contains. Pages poll it to offer a reload.
import { VERSION } from '../lib/version';

export function GET() {
  return new Response(JSON.stringify(VERSION), { headers: { 'Content-Type': 'application/json' } });
}
