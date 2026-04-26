'use client';

import { useEffect } from 'react';

type FunnelEventName =
  | 'landing_view'
  | 'hero_cta_clicked'
  | 'waitlist_form_started'
  | 'waitlist_submitted'
  | 'pricing_view'
  | 'institutional_lead_submitted';

function getSessionBucket() {
  const key = 'palmi-funnel-bucket';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const bucket = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  window.sessionStorage.setItem(key, bucket);
  return bucket;
}

export async function trackLandingEvent(
  eventName: FunnelEventName,
  source: string,
  metadata?: Record<string, unknown>
) {
  const payload = {
    eventName,
    pagePath: window.location.pathname,
    source,
    sessionBucket: getSessionBucket(),
    referrerHost: document.referrer ? new URL(document.referrer).host : null,
    utmSource: new URLSearchParams(window.location.search).get('utm_source'),
    utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
    utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
    utmContent: new URLSearchParams(window.location.search).get('utm_content'),
    metadata: metadata ?? {},
  };

  await fetch('/api/funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function LandingViewTracker() {
  useEffect(() => {
    void trackLandingEvent('landing_view', 'page');
  }, []);

  return null;
}

export function PricingViewTracker() {
  useEffect(() => {
    void trackLandingEvent('pricing_view', 'pricing');
  }, []);

  return null;
}

export function TrackedFunnelLink({
  href,
  className,
  source,
  children,
}: {
  href: string;
  className?: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        void trackLandingEvent('hero_cta_clicked', source);
      }}
    >
      {children}
    </a>
  );
}
