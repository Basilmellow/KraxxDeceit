import { publicInvestigation } from '@/lib/public-investigation';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(request: Request) { return publicInvestigation(request, true); }
