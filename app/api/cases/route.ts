import { privateCases } from '@/lib/private-cases';
import { supabaseCaseStore } from '@/lib/supabase-server';
export const runtime = 'nodejs';
export async function GET(request: Request) { return privateCases(request, supabaseCaseStore); }
export async function POST(request: Request) { return privateCases(request, supabaseCaseStore); }
