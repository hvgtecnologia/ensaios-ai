import { NextRequest, NextResponse } from 'next/server';
import {
    getAllAdAccounts, getAccountInsights,
    flattenInsight, healthScore,
    presetToRange, previousRange, deltaPct,
    MetaDatePreset, MetaTimeRange,
} from '@/lib/facebook';

export const dynamic = 'force-dynamic';

const VALID_PRESETS: MetaDatePreset[] = [
    'today', 'yesterday',
    'last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d',
    'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year',
];

export async function GET(request: NextRequest) {
    try {
        const accessToken = process.env.META_ACCESS_TOKEN;
        if (!accessToken) {
            return NextResponse.json({ success: false, error: 'META_ACCESS_TOKEN não configurado' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const preset = (searchParams.get('period') || 'last_7d') as MetaDatePreset;
        const since = searchParams.get('since');
        const until = searchParams.get('until');
        const compare = searchParams.get('compare') !== 'false'; // default true

        // Range absoluto (custom > preset)
        let range: MetaTimeRange;
        if (since && until) {
            range = { since, until };
        } else {
            if (!VALID_PRESETS.includes(preset)) {
                return NextResponse.json({ success: false, error: 'Período inválido' }, { status: 400 });
            }
            range = presetToRange(preset);
        }
        const prev = compare ? previousRange(range) : null;

        const allAccounts = await getAllAdAccounts(accessToken);
        const activeAccounts = allAccounts.filter(
            a => a.account_status === 1 || (a.account_status === 3 && Number(a.amount_spent) > 0)
        );

        const batchSize = 8;
        const enriched: any[] = [];

        for (let i = 0; i < activeAccounts.length; i += batchSize) {
            const batch = activeAccounts.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(async account => {
                    const [curr, previous] = await Promise.all([
                        getAccountInsights(account.id, accessToken, undefined, range),
                        prev ? getAccountInsights(account.id, accessToken, undefined, prev) : Promise.resolve(null),
                    ]);
                    if (!curr && !previous) return null;
                    const flat = flattenInsight(curr || {}, account.currency);
                    const flatPrev = previous ? flattenInsight(previous, account.currency) : null;
                    const health = healthScore(flat);

                    const deltas = flatPrev ? {
                        spend: deltaPct(flat.spend, flatPrev.spend),
                        impressions: deltaPct(flat.impressions, flatPrev.impressions),
                        clicks: deltaPct(flat.clicks, flatPrev.clicks),
                        ctr: deltaPct(flat.ctr, flatPrev.ctr),
                        cpc: deltaPct(flat.cpc, flatPrev.cpc),
                        cpm: deltaPct(flat.cpm, flatPrev.cpm),
                        leads: deltaPct(flat.leads, flatPrev.leads),
                        cpl: deltaPct(flat.cpl, flatPrev.cpl),
                        purchases: deltaPct(flat.purchases, flatPrev.purchases),
                        roas: deltaPct(flat.roas, flatPrev.roas),
                        messaging_started: deltaPct(flat.messaging_started, flatPrev.messaging_started),
                    } : null;

                    return {
                        ...flat,
                        id: account.id,
                        account_id: account.account_id,
                        name: account.name,
                        business_name: account.business_name,
                        currency: account.currency,
                        timezone: account.timezone_name,
                        account_status: account.account_status,
                        total_spent_lifetime: Number(account.amount_spent) / 100,
                        previous: flatPrev,
                        deltas,
                        health: health.score,
                        health_reasons: health.reasons,
                    };
                })
            );

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) enriched.push(r.value);
            }
        }

        enriched.sort((a, b) => b.spend - a.spend);

        return NextResponse.json({
            success: true,
            data: enriched,
            period: { preset, range, previous: prev },
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao buscar contas' },
            { status: 500 }
        );
    }
}
