import { NextRequest, NextResponse } from 'next/server';
import { getActiveAdsForAccount } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const accessToken = process.env.META_ACCESS_TOKEN;
        if (!accessToken) {
            return NextResponse.json({ success: false, error: 'META_ACCESS_TOKEN não configurado' }, { status: 400 });
        }
        const ads = await getActiveAdsForAccount(id, accessToken);
        return NextResponse.json({ success: true, data: ads, count: ads.length });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao buscar anúncios ativos' },
            { status: 500 }
        );
    }
}
