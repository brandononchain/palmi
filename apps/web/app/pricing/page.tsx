import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — palmi',
  description:
    'Four tiers. No ads, no pay-to-reach, no gamification. Just the quiet place for your people.',
};

export default function PricingPage() {
  return (
    <>
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
            <Link href="/#waitlist" className="nav-cta">
              Request access
            </Link>
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
            four tiers.
            <br />
            <em>no noise.</em>
          </h1>
          <p className="lede">
            palmi stays free to join. a few quiet things unlock when you&rsquo;re ready.
            <br />
            no ads. no pay-to-reach. no streaks. no games.
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
              <li>one question a day</li>
              <li>photos, replies, reactions</li>
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
              <li>monthly recaps, saved forever</li>
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
              <li>circle discovery</li>
              <li>unlimited circle matching</li>
              <li>ai &ldquo;why this fits&rdquo;</li>
              <li>priority access to new circles</li>
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
              <li>custom onboarding</li>
              <li>circle themes</li>
            </ul>
            <p className="tier-foot">for groups with a purpose.</p>
          </article>
        </section>

        <section className="pricing-note">
          <h3>for universities, accelerators, cohorts</h3>
          <p>
            palmi can be tailored for high-trust communities with private circles, guided
            onboarding, and structured recaps designed around your program.
          </p>
          <Link href="/#waitlist" className="nav-cta">
            start a conversation
          </Link>
        </section>

        <section className="pricing-faq">
          <h3>the small print, said plainly</h3>
          <dl>
            <dt>do i have to upgrade?</dt>
            <dd>
              no. the free tier is the product. premium is for people who want to remember more.
            </dd>

            <dt>can i cancel?</dt>
            <dd>any time, from your settings. 7 days, no questions.</dd>

            <dt>do you sell my data?</dt>
            <dd>no. we never will.</dd>

            <dt>do you run ads?</dt>
            <dd>no. we never will.</dd>

            <dt>what happens to my circles if i downgrade?</dt>
            <dd>
              your circles and posts stay. circles above the free cap go read-only until you rejoin.
            </dd>
          </dl>
        </section>

        <section className="pricing-cta">
          <p>palmi opens in waves. join the waitlist and we&rsquo;ll let you in soon.</p>
          <Link href="/#waitlist" className="nav-cta">
            request access
          </Link>
        </section>
      </main>
    </>
  );
}
