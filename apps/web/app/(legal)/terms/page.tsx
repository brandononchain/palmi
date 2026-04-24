import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms — palmi',
  description:
    'The rules for using palmi. Short, readable, and designed to be fair to the people using the app.',
};

const LAST_UPDATED = 'April 23, 2026';

export default function TermsPage() {
  return (
    <article className="legal-article">
      <header className="legal-header">
        <div className="legal-eyebrow">Terms</div>
        <h1 className="legal-title">
          The <em>short version</em>.
        </h1>
        <p className="legal-lede">
          These are the rules for using palmi. We kept them short on purpose. If anything here is
          confusing, email <a href="mailto:hi@palmi.app">hi@palmi.app</a> and we&rsquo;ll explain.
        </p>
        <div className="legal-meta">Last updated: {LAST_UPDATED}</div>
      </header>

      <section className="legal-section">
        <h2>1. What palmi is</h2>
        <p>
          Palmi is a private social app for small circles of 5&ndash;15 people. You answer one
          question a day, share posts inside your circles, and stay connected with people you
          actually know. There is no public feed, no algorithm, and no follower count.
        </p>
        <p>
          These Terms are a binding agreement between you and palmi. By creating an account or using
          the app, you agree to them and to our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Who can use it</h2>
        <ul className="legal-list">
          <li>You must be at least 13 years old (16 in the EEA and UK).</li>
          <li>You must provide a real phone number that belongs to you.</li>
          <li>You must not be barred from using the service under applicable law.</li>
          <li>One account per person. Don&rsquo;t impersonate anyone.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. Your account</h2>
        <p>
          You are responsible for keeping your device and phone number secure. If someone gets
          access to your phone, they can get access to your palmi account. Tell us quickly at{' '}
          <a href="mailto:hi@palmi.app">hi@palmi.app</a> if you think your account has been
          compromised.
        </p>
        <p>
          You can close your account anytime. We may suspend or close accounts that violate these
          Terms.
        </p>
      </section>

      <section className="legal-section">
        <h2>4. What you post</h2>
        <p>
          You own the things you post. You grant palmi a narrow, worldwide, royalty-free license to
          store, transmit, display, and back up your content so we can operate the service for you
          and your circle. This license ends when you delete the content or your account, except for
          copies that remain in routine backups for up to 30 days.
        </p>
        <p>You will not post content that:</p>
        <ul className="legal-list">
          <li>Is illegal, threatens real-world harm, or incites violence.</li>
          <li>Sexually exploits or endangers a minor.</li>
          <li>Harasses, stalks, doxxes, or targets anyone.</li>
          <li>Contains spam, scams, malware, or paid promotion without disclosure.</li>
          <li>Infringes someone else&rsquo;s copyright, trademark, or other rights.</li>
          <li>
            Shares non-consensual intimate imagery, or anyone&rsquo;s private data without
            permission.
          </li>
        </ul>
        <p>
          We may remove content that breaks these rules and, in serious or repeated cases, close the
          account.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Circles</h2>
        <p>
          Circles are small by design. Circle owners set membership. What you post to a circle is
          visible to its members. Don&rsquo;t screenshot or repost other people&rsquo;s content
          outside the circle without permission &mdash; it&rsquo;s the whole point.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. AI features</h2>
        <p>
          Palmi uses AI in two narrow places: drafting the daily question and flagging content that
          may violate these Terms. We do not use AI to generate posts or replies on your behalf.
          Your content is not used to train third-party AI models.
        </p>
      </section>

      <section className="legal-section">
        <h2>7. Invite-only access</h2>
        <p>
          Palmi is invite-only during our early phase. If you join the waitlist, we&rsquo;ll reach
          out when there&rsquo;s a spot. We may grow, pause, or limit access at our discretion while
          we keep the community small on purpose.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. Feedback</h2>
        <p>
          If you send us ideas, bug reports, or suggestions, we can use them to improve palmi
          without owing you anything. You keep your rights to your own ideas outside of palmi.
        </p>
      </section>

      <section className="legal-section">
        <h2>9. Changes to the service</h2>
        <p>
          We may add, change, or remove features. If we make a change that meaningfully reduces the
          service or your rights, we&rsquo;ll tell you in advance in the app or by email.
        </p>
      </section>

      <section className="legal-section">
        <h2>10. Termination</h2>
        <p>
          You can stop using palmi anytime and delete your account from{' '}
          <strong>Settings &rarr; Edit profile</strong> or by emailing{' '}
          <a href="mailto:hi@palmi.app">hi@palmi.app</a>. We may suspend or terminate your access if
          you violate these Terms, to protect others, or to comply with law. On termination,
          sections that by their nature should survive (ownership, disclaimers, limits of liability,
          disputes) will survive.
        </p>
      </section>

      <section className="legal-section">
        <h2>11. Disclaimers</h2>
        <p>
          Palmi is provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis. To the
          fullest extent permitted by law, we disclaim all implied warranties, including
          merchantability, fitness for a particular purpose, and non-infringement. We don&rsquo;t
          promise that palmi will always be available, error-free, or that it will meet every
          expectation &mdash; though we try hard to make it worth your time.
        </p>
      </section>

      <section className="legal-section">
        <h2>12. Limit of liability</h2>
        <p>
          To the fullest extent permitted by law, palmi will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for any loss of profits,
          revenue, data, or goodwill. Our total liability for any claim arising out of or relating
          to palmi is limited to the greater of (a) the amount you paid us in the 12 months before
          the claim, or (b) US$50.
        </p>
      </section>

      <section className="legal-section">
        <h2>13. Indemnity</h2>
        <p>
          You&rsquo;ll indemnify palmi against claims brought by third parties arising from your
          content or your violation of these Terms, except to the extent those claims are caused by
          us.
        </p>
      </section>

      <section className="legal-section">
        <h2>14. Governing law &amp; disputes</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, without regard to its
          conflict-of-laws rules. Before filing a formal claim, you agree to first email{' '}
          <a href="mailto:legal@palmi.app">legal@palmi.app</a> so we can try to work it out in 30
          days. Unresolved disputes will be handled in the state or federal courts located in
          Delaware, and you and palmi consent to personal jurisdiction there. Where required by law,
          you keep the right to bring small-claims actions in your home jurisdiction.
        </p>
      </section>

      <section className="legal-section">
        <h2>15. Changes to these Terms</h2>
        <p>
          If we change these Terms in a way that meaningfully affects you, we&rsquo;ll tell you in
          the app or by email before the change takes effect. If you keep using palmi after that,
          the updated Terms apply.
        </p>
      </section>

      <section className="legal-section">
        <h2>16. Contact</h2>
        <p>
          Legal: <a href="mailto:legal@palmi.app">legal@palmi.app</a>
          <br />
          Everything else: <a href="mailto:hi@palmi.app">hi@palmi.app</a>
        </p>
      </section>

      <div className="legal-footer-nav">
        <Link href="/privacy">Read the Privacy Policy &rarr;</Link>
      </div>
    </article>
  );
}
