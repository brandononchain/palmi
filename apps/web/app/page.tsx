import { WaitlistForm } from './components/WaitlistForm';
import { ScrollEffects } from './components/ScrollEffects';

const WAITLIST_COUNT = process.env.NEXT_PUBLIC_WAITLIST_COUNT ?? '2,847';

export default function LandingPage() {
  return (
    <>
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
            <a href="#waitlist" className="nav-cta">Request access</a>
          </div>
        </div>
      </nav>

      <main className="wrap">
        {/* HERO */}
        <section className="hero" style={{ paddingTop: 60 }}>
          <div>
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Rolling out to select campuses, fall 2026
            </span>
            <h1>
              a quiet place<br />
              for your <em>people</em>.
            </h1>
            <p className="lede">
              Small circles of 5 to 15 friends. One question a day you answer together. Nothing to scroll through, no
              one to impress. Chronological. Invite-only. Calm.
            </p>

            <WaitlistForm source="hero" />

            <div className="meta">
              <div className="meta-dots">
                <span className="meta-dot" />
                <span className="meta-dot" />
                <span className="meta-dot" />
                <span className="meta-dot" />
              </div>
              <span>{WAITLIST_COUNT} people waiting</span>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone">
              <div className="phone-notch" />
              <div className="phone-screen">
                <div className="phone-header">
                  <div className="phone-circle-name">dorm 4B</div>
                  <div className="phone-members">
                    <span className="phone-member" />
                    <span className="phone-member" />
                    <span className="phone-member" />
                  </div>
                </div>

                <div className="phone-qcard">
                  <div className="phone-qlabel">Today&rsquo;s question</div>
                  <div className="phone-qtext">What&rsquo;s on your desk right now?</div>
                  <div className="phone-qresponses">
                    <div className="phone-qavs">
                      <span className="phone-qav" />
                      <span className="phone-qav" />
                    </div>
                    <span>2 of 6 answered</span>
                  </div>
                </div>

                <div className="phone-post">
                  <div className="phone-post-head">
                    <div className="phone-post-av" style={{ background: '#E8C5A0' }} />
                    <div className="phone-post-name">maya</div>
                    <div className="phone-post-time">2h</div>
                  </div>
                  <div
                    className="phone-post-img"
                    style={{ background: 'linear-gradient(135deg, #D8C5A8, #C4A57E)' }}
                  />
                  <div className="phone-post-text">golden hour on the walk home</div>
                </div>

                <div className="phone-post">
                  <div className="phone-post-head">
                    <div className="phone-post-av" style={{ background: '#B8B0D8' }} />
                    <div className="phone-post-name">jordan</div>
                    <div className="phone-post-time">5h</div>
                  </div>
                  <div className="phone-post-text" style={{ color: 'var(--ink)' }}>
                    spent 40 minutes explaining a dream to my roommate and she said &ldquo;that&rsquo;s just
                    tuesday&rdquo;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MANIFESTO */}
        <section className="manifesto" id="manifesto">
          <div className="manifesto-grid reveal">
            <div>
              <div className="section-label">Manifesto</div>
              <h2>
                Everything social apps<br />added, we took out.
              </h2>
              <p className="section-lede">
                Most apps optimize for attention. palmi optimizes for the twelve people who would actually text you
                if something was wrong.
              </p>
            </div>
            <ul className="manifesto-list">
              <li>
                <span className="ml-no">01</span>
                <span>
                  <span className="ml-strike">Followers.</span> Only the people you&rsquo;d invite to dinner.
                </span>
              </li>
              <li>
                <span className="ml-no">02</span>
                <span>
                  <span className="ml-strike">Algorithm.</span> Chronological. Newest on top. Always.
                </span>
              </li>
              <li>
                <span className="ml-no">03</span>
                <span>
                  <span className="ml-strike">Streaks.</span> Miss a day. Miss a week. Come back anyway.
                </span>
              </li>
              <li>
                <span className="ml-no">04</span>
                <span>
                  <span className="ml-strike">Public profiles.</span> A name. A photo. That&rsquo;s it.
                </span>
              </li>
              <li>
                <span className="ml-no">05</span>
                <span>
                  <span className="ml-strike">AI slop.</span> Nothing here was written by a machine.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how">
          <div className="reveal">
            <div className="section-label">How it works</div>
            <h2>
              Three things.<br />Then we get out of the way.
            </h2>
          </div>

          <div className="how-grid reveal">
            <div className="how-card">
              <div>
                <div className="how-num">01</div>
                <div className="how-title">Start a circle</div>
                <div className="how-desc">
                  Up to fifteen friends. Invite them with a six-character code. Leave anytime.
                </div>
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
                <div className="how-title">Answer the question</div>
                <div className="how-desc">
                  One prompt a day, same for everyone in your circle. Photo, text, whichever feels right.
                </div>
              </div>
              <div className="how-viz">
                <svg width="160" height="70" viewBox="0 0 160 70" fill="none">
                  <rect x="0" y="20" width="160" height="32" rx="10" fill="#F4F1EB" stroke="#E8E4DE" strokeWidth="1" />
                  <circle cx="14" cy="36" r="4" fill="#D65745" />
                  <rect x="26" y="30" width="80" height="4" rx="2" fill="#1A1A1A" opacity="0.7" />
                  <rect x="26" y="38" width="50" height="3" rx="1.5" fill="#A5A099" />
                </svg>
              </div>
            </div>

            <div className="how-card">
              <div>
                <div className="how-num">03</div>
                <div className="how-title">Share, or don&rsquo;t</div>
                <div className="how-desc">
                  Post freely between questions. No numbers, no badges, no notifications unless you want them.
                </div>
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
            &ldquo;The internet used to feel like <em>passing notes</em>. Somewhere along the way it became a{' '}
            <em>billboard</em>.&rdquo;
          </blockquote>
          <div className="quote-cite">&mdash; the reason we built this</div>
        </section>

        {/* CTA */}
        <section id="waitlist" style={{ padding: 0 }}>
          <div className="cta reveal">
            <h2>
              Your people<br />are waiting.
            </h2>
            <p>
              palmi is rolling out to a handful of campuses this fall. Drop your email and we&rsquo;ll let you know
              when yours opens.
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
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="mailto:hi@palmi.app">Contact</a>
          </div>
          <div className="footer-copy">&copy; 2026 palmi</div>
        </div>
      </footer>
    </>
  );
}
