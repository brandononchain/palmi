import { NextResponse } from 'next/server';

import { anonClient } from '@/lib/supabase';

const VALID_EVENTS = new Set([
  'landing_view',
  'hero_cta_clicked',
  'waitlist_form_started',
  'waitlist_submitted',
  'pricing_view',
  'institutional_lead_submitted',
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!VALID_EVENTS.has(body.eventName)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const sb = anonClient();
    const { error } = await sb.from('marketing_funnel_events').insert({
      event_name: body.eventName,
      page_path: String(body.pagePath ?? '/').slice(0, 120),
      source: String(body.source ?? 'unknown').slice(0, 60),
      session_bucket: String(body.sessionBucket ?? 'unknown').slice(0, 80),
      referrer_host:
        typeof body.referrerHost === 'string' && body.referrerHost.length > 0
          ? body.referrerHost.slice(0, 120)
          : null,
      utm_source: typeof body.utmSource === 'string' ? body.utmSource.slice(0, 120) : null,
      utm_medium: typeof body.utmMedium === 'string' ? body.utmMedium.slice(0, 120) : null,
      utm_campaign: typeof body.utmCampaign === 'string' ? body.utmCampaign.slice(0, 120) : null,
      utm_content: typeof body.utmContent === 'string' ? body.utmContent.slice(0, 120) : null,
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
    });

    if (error) {
      console.error('funnel track error', error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('funnel route error', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
