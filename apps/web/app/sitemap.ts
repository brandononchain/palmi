import type { MetadataRoute } from 'next';

import { PUBLIC_ROUTES, SITE_URL } from '@/lib/site';

const LAST_MODIFIED = new Date('2026-04-23T00:00:00Z');

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path, index) => ({
    url: `${SITE_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : 0.7,
  }));
}
