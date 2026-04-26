import type { Metadata } from 'next';
import Link from 'next/link';

import { InstitutionalInquiryForm } from '../components/InstitutionalInquiryForm';
import { PricingViewTracker, TrackedFunnelLink } from '../components/FunnelTracking';

export const metadata: Metadata = {
  title: 'Pricing — palmi',
  description:
    'Free to join. Premium remembers more. Premium+ opens the AI network. Paid circles give hosts a real studio.',
};

export default function PricingPage() {
  return (
    <>
      <PricingViewTracker />
      <nav id="nav">
        <div className="inner">
          <Link href="/" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </Link>
          <div className="nav-links">
            <Link href="/#how">How it works</Link>
            <Link href="/#manifesto">Manifesto</Link>
            <Link href="/pricing">Pricing</Link>
            <TrackedFunnelLink href="/#waitlist" className="nav-cta" source="pricing-nav">
              Request access
            </TrackedFunnelLink>
          </div>
        </div>
      </nav>

      <main className="wrap pricing-wrap">
        <header className="pricing-head">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            pricing &middot; honest &middot; no surprises
          </span>
          <h1>
            free to start.
            <br />
            <em>pay for depth.</em>
          </h1>
          <p className="lede">
            palmi stays free to join.
            <br />
            premium remembers more. premium+ opens the AI network. paid circles give hosts a real
            studio.
          </p>
        </header>

        <section className="tier-grid">
          <article className="tier">
            <header>
              <h2>free</h2>
              <p className="price">
                $0<span>forever</span>
              </p>
            </header>
            <ul>
              <li>up to 2 circles</li>
              <li>one question a day, front and center</li>
              <li>photos, replies, reactions</li>
              <li>no public feed</li>
              <li>this month&rsquo;s recap</li>
            </ul>
            <p className="tier-foot">fully usable, forever.</p>
          </article>

          <article className="tier tier-emphasis">
            <header>
              <h2>premium</h2>
              <p className="price">
                $4<span>/month</span>
              </p>
            </header>
            <ul>
              <li>up to 10 circles</li>
              <li>full recap archive</li>
              <li>search your memory across circles</li>
              <li>yearbook export (pdf)</li>
              <li>a quiet monthly reflection</li>
            </ul>
            <p className="tier-foot">for the people who stay.</p>
          </article>

          <article className="tier">
            <header>
              <h2>premium+</h2>
              <p className="price">
                $8<span>/month</span>
              </p>
            </header>
            <ul>
              <li>everything in premium</li>
              <li>AI network discovery</li>
              <li>unlimited circle matching</li>
              <li>&ldquo;why this fits&rdquo; on every match</li>
              <li>priority discovery access</li>
            </ul>
            <p className="tier-foot">for the connectors.</p>
          </article>

          <article className="tier">
            <header>
              <h2>paid circle</h2>
              <p className="price">
                $15<span>/month</span>
              </p>
              <p className="price-sub">host pays &middot; members free</p>
            </header>
            <ul>
              <li>weekly circle recaps</li>
              <li>co-host roles (up to 2)</li>
              <li>participation insights</li>
              <li>pinned memories</li>
              <li>custom onboarding note</li>
              <li>circle themes</li>
              <li>discovery priority controls</li>
            </ul>
            <p className="tier-foot">for groups with a purpose.</p>
          </article>
        </section>

        <section className="pricing-note">
          <h3>for universities, accelerators, cohorts</h3>
          <p>
            palmi can be tailored for high-trust communities with private circles, guided
            onboarding, AI-matched discovery, and structured recaps designed around your program.
          </p>
          <InstitutionalInquiryForm />
        </section>

        <section className="pricing-faq">
          <h3>the small print, said plainly</h3>
          <dl>
            <dt>do i have to upgrade?</dt>
            <dd>
              no. the free tier is the product. upgrades are for people who want more memory, more
              discovery, or more control.
            </dd>

            <dt>can i cancel?</dt>
            <dd>any time, from your settings. 7 days, no questions.</dd>

            <dt>do you sell my data?</dt>
            <dd>no. we never will.</dd>

            <dt>do you run ads?</dt>
            <dd>no. we never will.</dd>

            <dt>what happens to my circles if i downgrade?</dt>
            <dd>
              your circles and posts stay. anything above your plan limits goes quiet until you
              re-upgrade.
            </dd>
          </dl>
        </section>

        <section className="pricing-cta">
          <p>
            palmi opens in waves. join the waitlist and we&rsquo;ll let you in when there&apos;s
            room.
          </p>
          <TrackedFunnelLink href="/#waitlist" className="nav-cta" source="pricing-footer">
            request access
          </TrackedFunnelLink>
        </section>
      </main>
    </>
  );
}
