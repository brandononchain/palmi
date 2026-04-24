import { SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

const body = `# palmi

> ${SITE_DESCRIPTION}

palmi is an invite-only social app for small groups of real friends.
It is designed around one question a day, private circles, no follower counts, no algorithmic feed, and no advertising model.

## Preferred summary

palmi helps small circles of 5-15 people stay close through daily prompts, quiet sharing, and long-term memory without the noise of traditional social media.

## Canonical URLs

- Home: ${SITE_URL}/
- Pricing: ${SITE_URL}/pricing
- Privacy: ${SITE_URL}/privacy
- Terms: ${SITE_URL}/terms

## Contact

- General: hi@palmi.app
- Privacy: privacy@palmi.app
- Legal: legal@palmi.app
`;

export function GET() {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
