import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Welcome to palmi premium',
  description: 'Subscription confirmed. Open palmi to continue.',
};

// Deep-link helper. When opened from the mobile app's external browser, this
// page tries to bounce back into the app. If the deep-link scheme isn't
// registered (web-only upgrade), the meta-refresh is a no-op and the page
// just stays visible with a friendly message.
export default function SubscribedPage() {
  return (
    <>
      <nav id="nav">
        <div className="inner">
          <Link href="/" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </Link>
        </div>
      </nav>

      <main className="wrap pricing-wrap">
        <section className="pricing-head">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            you&rsquo;re in
          </span>
          <h1>
            thank you.
            <br />
            <em>welcome back.</em>
          </h1>
          <p className="lede">
            your membership is live.
            <br />
            open palmi &mdash; the rest of it is already yours.
          </p>

          <div style={{ marginTop: 32 }}>
            <a href="palmi://subscribed" className="nav-cta">
              open palmi
            </a>
          </div>

          <p
            style={{
              marginTop: 40,
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              color: 'var(--ink-faint)',
              fontSize: 15,
            }}
          >
            a receipt is on its way. you can manage or cancel any time from settings.
          </p>
        </section>
      </main>

      {/* Try to bounce into the native app automatically. Silently no-ops on web. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = 'palmi://subscribed'; }, 300);`,
        }}
      />
    </>
  );
}
