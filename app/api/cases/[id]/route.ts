import { privateCases } from '@/lib/private-cases';
import { supabaseCaseStore } from '@/lib/supabase-server';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return privateCases(request, supabaseCaseStore, (await context.params).id); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return privateCases(request, supabaseCaseStore, (await context.params).id); }
