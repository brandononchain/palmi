import { WaitlistForm } from './components/WaitlistForm';
import { LandingViewTracker, TrackedFunnelLink } from './components/FunnelTracking';
import { ScrollEffects } from './components/ScrollEffects';

const WAITLIST_COUNT = process.env.NEXT_PUBLIC_WAITLIST_COUNT ?? '2,847';

export default function LandingPage() {
  return (
    <>
      <LandingViewTracker />
      <ScrollEffects />

      <nav id="nav">
        <div className="inner">
          <a href="#" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#manifesto">Manifesto</a>
            <a href="/pricing">Pricing</a>
            <TrackedFunnelLink href="#waitlist" className="nav-cta" source="nav">
              Request access
            </TrackedFunnelLink>
          </div>
        </div>
      </nav>

      <main className="wrap">
        {/* HERO */}
        <section className="hero" style={{ paddingTop: 60 }}>
          <div>
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Invite-only &middot; rolling access
            </span>
            <h1>
              a quiet place
              <br />
              for your <em>people</em>.
            </h1>
            <p className="lede">
              Small circles of 5&ndash;15.
              <br />
              One question a day.
              <br />
              No public feed. No noise. Just real connection.
            </p>

            <WaitlistForm source="hero" />

            <div className="meta">
              <div className="meta-dots">
                <span className="meta-dot" />
                <span className="meta-dot" />
                <span className="meta-dot" />
                <span className="meta-dot" />
              </div>
              <span>{WAITLIST_COUNT} waiting for access</span>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone">
              <div className="phone-notch" />
              <div className="phone-screen">
                {/* Mirrors the real app/app/(tabs)/home.tsx UX: serif greeting,
                    "your circles" row with see-all, recent activity list,
                    bottom tab bar. */}
                <div className="phone-statusbar">
                  <span className="phone-sb-time">9:41</span>
                  <span className="phone-statusbar-icons">
                    <svg
                      className="phone-sb-icon"
                      viewBox="0 0 17 11"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="0" y="7" width="3" height="4" rx="0.6" />
                      <rect x="4.5" y="5" width="3" height="6" rx="0.6" />
                      <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" />
                      <rect x="13.5" y="0" width="3" height="11" rx="0.6" />
                    </svg>
                    <svg
                      className="phone-sb-icon"
                      viewBox="0 0 15 11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M1 3.8a10 10 0 0 1 13 0" />
                      <path d="M3 6.2a7 7 0 0 1 9 0" />
                      <path d="M5 8.6a4 4 0 0 1 5 0" />
                      <circle cx="7.5" cy="10.2" r="0.7" fill="currentColor" stroke="none" />
                    </svg>
                    <span className="phone-sb-batt" aria-hidden="true">
                      <span className="phone-sb-batt-fill" />
                    </span>
                  </span>
                </div>

                <div className="phone-body">
                  <div className="phone-wordmark">palmi</div>

                  <h3 className="phone-greeting">
                    good evening,
                    <br />
                    maya.
                  </h3>

                  <p className="phone-lede">
                    today&apos;s ritual is tagged in your circles. start anywhere that feels right.
                  </p>

                  <div className="phone-summary-card">
                    <div className="phone-summary-stat">
                      <span className="phone-summary-value">2</span>
                      <span className="phone-summary-label">waiting on you</span>
                    </div>
                    <div className="phone-summary-stat">
                      <span className="phone-summary-value">3</span>
                      <span className="phone-summary-label">rooms open</span>
                    </div>
                    <div className="phone-summary-stat">
                      <span className="phone-summary-value">3</span>
                      <span className="phone-summary-label">recent moments</span>
                    </div>
                  </div>

                  <div className="phone-focus-card">
                    <span className="phone-focus-label">today&apos;s ritual</span>
                    <h4 className="phone-focus-title">start here.</h4>
                    <div className="phone-focus-row">
                      <span className="phone-focus-circle">the group chat</span>
                      <span className="phone-focus-meta">waiting</span>
                    </div>
                    <p className="phone-focus-body">what felt unexpectedly generous this week?</p>
                    <p className="phone-focus-note">
                      2 rooms have a ritual open. this is the closest one to begin with.
                    </p>
                    <span className="phone-focus-helper">
                      the same ritual status is tagged in your circles list.
                    </span>
                    <span className="phone-focus-button">answer now</span>
                  </div>

                  <div className="phone-section-head">
                    <span className="phone-section-label">also waiting</span>
                  </div>

                  <div className="phone-row-viewport">
                    <div className="phone-row-track phone-row-track-secondary">
                      <div className="phone-secondary-card">
                        <span className="phone-secondary-circle">studio 3</span>
                        <span className="phone-secondary-body">
                          what part of your process feels steadier now?
                        </span>
                        <span className="phone-secondary-action">answer</span>
                      </div>
                      <div className="phone-secondary-card">
                        <span className="phone-secondary-circle">sunday runs</span>
                        <span className="phone-secondary-body">
                          what are you carrying into the weekend?
                        </span>
                        <span className="phone-secondary-action">open circle</span>
                      </div>
                    </div>
                  </div>

                  <div className="phone-section-head">
                    <span className="phone-section-label">your circles</span>
                    <span className="phone-section-link">see all</span>
                  </div>

                  <div className="phone-row-viewport">
                    <div className="phone-row-track phone-row-track-circles">
                      <div className="phone-circle-card">
                        <span className="phone-circle-card-name">the group chat</span>
                        <span className="phone-circle-card-status">question waiting</span>
                        <span className="phone-circle-card-meta">6 people</span>
                      </div>
                      <div className="phone-circle-card">
                        <span className="phone-circle-card-name">studio 3</span>
                        <span className="phone-circle-card-status">answered today</span>
                        <span className="phone-circle-card-meta">4 people</span>
                      </div>
                      <div className="phone-circle-card">
                        <span className="phone-circle-card-name">sunday runs</span>
                        <span className="phone-circle-card-status">one new moment</span>
                        <span className="phone-circle-card-meta">5 people</span>
                      </div>
                    </div>
                  </div>

                  <div className="phone-feed-head">
                    <span className="phone-feed-title">recently moved</span>
                    <span className="phone-feed-note">
                      after the question, this is what shifted.
                    </span>
                  </div>

                  <div className="phone-activity">
                    <div className="phone-activity-head">
                      <span className="phone-activity-circle">the group chat</span>
                      <span className="phone-activity-time">2h ago</span>
                    </div>
                    <div className="phone-activity-body">
                      a mug, three pens that don&rsquo;t work, and a very judgmental cat
                    </div>
                    <div className="phone-activity-author">jordan</div>
                  </div>

                  <div className="phone-activity">
                    <div className="phone-activity-head">
                      <span className="phone-activity-circle">studio 3</span>
                      <span className="phone-activity-time">yesterday</span>
                    </div>
                    <div className="phone-activity-body">
                      finished the chorus. finally sounds like the song in my head.
                    </div>
                    <div className="phone-activity-author">sam</div>
                  </div>

                  <div className="phone-activity">
                    <div className="phone-activity-head">
                      <span className="phone-activity-circle">sunday runs</span>
                      <span className="phone-activity-time">yesterday</span>
                    </div>
                    <div className="phone-activity-body phone-activity-body-italic">
                      shared a photo
                    </div>
                    <div className="phone-activity-author">ava</div>
                  </div>
                </div>

                <div className="phone-tabbar">
                  <div className="phone-tab phone-tab-active">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path
                        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>home</span>
                  </div>
                  <div className="phone-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                    <span>circles</span>
                  </div>
                  <div className="phone-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="9" cy="9" r="3" />
                      <circle cx="17" cy="10" r="2.3" />
                      <path d="M3 19c.5-3 3-4.5 6-4.5s5.5 1.5 6 4.5" />
                      <path d="M14 18c.4-2.2 2-3.2 3-3.2s2.6.8 3 3" />
                    </svg>
                    <span>friends</span>
                  </div>
                  <div className="phone-tab">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2l-.4-2.4h-4l-.4 2.4a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
                    </svg>
                    <span>settings</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF STRIP */}
        <section className="proof-strip reveal" aria-label="Who palmi is for">
          <span className="proof-label">built for people who care about</span>
          <span className="proof-sep" aria-hidden="true" />
          <span className="proof-items">
            <span>real connection</span>
            <span className="proof-dot" aria-hidden="true">
              ·
            </span>
            <span>small circles</span>
            <span className="proof-dot" aria-hidden="true">
              ·
            </span>
            <span>less noise</span>
          </span>
        </section>

        {/* MANIFESTO */}
        <section className="manifesto" id="manifesto">
          <div className="manifesto-grid reveal">
            <div>
              <div className="section-label">Manifesto</div>
              <h2>
                Everything social apps
                <br />
                added, we took out.
              </h2>
              <p className="section-lede">
                Most apps optimize for attention.
                <br />
                Palmi is built for the twelve people who would text you if something was wrong.
              </p>
            </div>
            <ul className="manifesto-list">
              <li>
                <span className="ml-no">01</span>
                <span>
                  <span className="ml-strike">Followers.</span> Only the people you&rsquo;d invite
                  to dinner.
                </span>
              </li>
              <li>
                <span className="ml-no">02</span>
                <span>
                  <span className="ml-strike">Algorithm.</span> Newest first. Always.
                </span>
              </li>
              <li>
                <span className="ml-no">03</span>
                <span>
                  <span className="ml-strike">Streaks.</span> Miss a day. Miss a week. Come back
                  anyway.
                </span>
              </li>
              <li>
                <span className="ml-no">04</span>
                <span>
                  <span className="ml-strike">Public profiles.</span> A name. A photo. That&rsquo;s
                  it.
                </span>
              </li>
              <li>
                <span className="ml-no">05</span>
                <span>
                  <span className="ml-strike">AI slop.</span> Written by people.
                </span>
              </li>
            </ul>
          </div>
          <div className="manifesto-closer reveal">Small circles. No public feed.</div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how">
          <div className="reveal">
            <div className="section-label">How it works</div>
            <h2>
              Three things.
              <br />
              Then we get out of the way.
            </h2>
          </div>

          <div className="how-grid reveal">
            <div className="how-card">
              <div>
                <div className="how-num">01</div>
                <div className="how-title">Create or join a circle</div>
                <div className="how-desc">5&ndash;15 people you actually care about.</div>
              </div>
              <div className="how-viz">
                <svg width="140" height="70" viewBox="0 0 140 70" fill="none">
                  <circle cx="30" cy="35" r="16" fill="#E8C5A0" />
                  <circle cx="62" cy="35" r="16" fill="#B8B0D8" />
                  <circle cx="94" cy="35" r="16" fill="#A8C8B0" />
                  <circle
                    cx="122"
                    cy="35"
                    r="10"
                    fill="none"
                    stroke="#A5A099"
                    strokeWidth="1.5"
                    strokeDasharray="2 3"
                  />
                </svg>
              </div>
            </div>

            <div className="how-card">
              <div>
                <div className="how-num">02</div>
                <div className="how-title">Get one question a day</div>
                <div className="how-desc">Simple, thoughtful, consistent.</div>
              </div>
              <div className="how-viz">
                <svg width="160" height="70" viewBox="0 0 160 70" fill="none">
                  <rect
                    x="0"
                    y="20"
                    width="160"
                    height="32"
                    rx="10"
                    fill="#F4F1EB"
                    stroke="#E8E4DE"
                    strokeWidth="1"
                  />
                  <circle cx="14" cy="36" r="4" fill="#D65745" />
                  <rect x="26" y="30" width="80" height="4" rx="2" fill="#1A1A1A" opacity="0.7" />
                  <rect x="26" y="38" width="50" height="3" rx="1.5" fill="#A5A099" />
                </svg>
              </div>
            </div>

            <div className="how-card">
              <div>
                <div className="how-num">03</div>
                <div className="how-title">Stay connected naturally</div>
                <div className="how-desc">No feeds, no pressure, no noise.</div>
              </div>
              <div className="how-viz">
                <svg width="160" height="70" viewBox="0 0 160 70" fill="none">
                  <rect x="10" y="10" width="60" height="50" rx="8" fill="#fff" stroke="#E8E4DE" />
                  <rect x="76" y="10" width="74" height="24" rx="8" fill="#fff" stroke="#E8E4DE" />
                  <rect x="76" y="38" width="74" height="22" rx="8" fill="#fff" stroke="#E8E4DE" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="quote reveal">
          <blockquote>
            &ldquo;The internet used to feel like <em>passing notes</em>. Somewhere along the way it
            became a <em>billboard</em>.&rdquo;
          </blockquote>
          <div className="quote-cite">&mdash; the reason we built this</div>
        </section>

        {/* PRICING TEASER */}
        <section className="pricing-teaser reveal" aria-label="Pricing">
          <p className="teaser-eyebrow">free to join</p>
          <h2>
            free forever.
            <br />
            <em>$4 a month</em> when
            <br />
            you want more.
          </h2>
          <p className="teaser-lede">
            Palmi is free to use. Unlock full recap history, memory archive, and quiet reflection
            when it feels useful. No ads, ever.
          </p>
          <a href="/pricing" className="nav-cta">
            see pricing
          </a>
        </section>

        {/* CTA */}
        <section id="waitlist" style={{ padding: 0 }}>
          <div className="cta reveal">
            <h2>
              Your people
              <br />
              are waiting.
            </h2>
            <p>
              palmi is invite-only and opening in waves. Drop your email and we&rsquo;ll reach out
              when there&rsquo;s a spot for you.
            </p>
            <WaitlistForm source="cta" />
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap inner">
          <a href="#" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </a>
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:hi@palmi.app">Contact</a>
          </div>
          <div className="footer-copy">&copy; 2026 palmi</div>
        </div>
      </footer>
    </>
  );
}
