import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy — palmi',
  description:
    'How palmi collects, uses, and protects your information. Written in plain English because you deserve to understand what happens to your data.',
};

const LAST_UPDATED = 'April 23, 2026';

export default function PrivacyPage() {
  return (
    <article className="legal-article">
      <header className="legal-header">
        <div className="legal-eyebrow">Privacy</div>
        <h1 className="legal-title">
          Your data, <em>your business</em>.
        </h1>
        <p className="legal-lede">
          Palmi is built for a few people you actually trust. We treat your data the same way — like
          it belongs to you, because it does. This page explains, in plain English, what we collect,
          why, and what we don&rsquo;t do with it.
        </p>
        <div className="legal-meta">Last updated: {LAST_UPDATED}</div>
      </header>

      <section className="legal-section">
        <h2>The short version</h2>
        <ul className="legal-list">
          <li>We collect the minimum we need to make palmi work.</li>
          <li>We do not sell your data. Ever.</li>
          <li>We do not serve third-party ads and we do not build advertising profiles.</li>
          <li>Only the people in your circle see what you post to that circle.</li>
          <li>You can export or delete your account at any time by emailing us.</li>
        </ul>
        <p>
          If something on this page is unclear, write to{' '}
          <a href="mailto:privacy@palmi.app">privacy@palmi.app</a> and we&rsquo;ll rewrite it.
        </p>
      </section>

      <section className="legal-section">
        <h2>Who we are</h2>
        <p>
          &ldquo;Palmi,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo; refers to
          the operator of the palmi application and <a href="https://palmi.app">palmi.app</a>. You
          can reach us at <a href="mailto:hi@palmi.app">hi@palmi.app</a> for general questions or{' '}
          <a href="mailto:privacy@palmi.app">privacy@palmi.app</a> for anything on this page.
        </p>
      </section>

      <section className="legal-section">
        <h2>What we collect</h2>

        <h3>Information you give us</h3>
        <ul className="legal-list">
          <li>
            <strong>Phone number.</strong> Used to sign you in and to verify you&rsquo;re a real
            person. We send a one-time code by SMS at sign-in.
          </li>
          <li>
            <strong>Profile.</strong> Your display name, optional bio, optional profile photo, and
            any optional fields you choose to add (job title, school, city, website, etc.).
          </li>
          <li>
            <strong>Content you post.</strong> Answers, replies, photos, and videos you share in
            your circles.
          </li>
          <li>
            <strong>Contact info.</strong> If you join our waitlist, your email address and whether
            you opted into waitlist emails.
          </li>
        </ul>

        <h3>Information we collect automatically</h3>
        <ul className="legal-list">
          <li>
            <strong>Device &amp; app basics.</strong> Device type, OS version, app version, crash
            reports, and coarse timestamps. Used to fix bugs and keep the app running.
          </li>
          <li>
            <strong>Push tokens.</strong> If you opt into notifications, we store the device token
            needed to send them.
          </li>
          <li>
            <strong>Security logs.</strong> IP address and limited request metadata, kept briefly
            for abuse prevention and account safety.
          </li>
        </ul>

        <h3>What we do not collect</h3>
        <ul className="legal-list">
          <li>Precise location. We never ask for GPS.</li>
          <li>
            Your contacts, camera roll, microphone, or calendar (unless you explicitly share a
            specific item).
          </li>
          <li>Cross-site tracking identifiers or third-party advertising IDs.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>How we use it</h2>
        <ul className="legal-list">
          <li>To run the app: sign you in, show your circle its posts, deliver notifications.</li>
          <li>To keep people safe: prevent spam, abuse, and impersonation.</li>
          <li>To improve the product: aggregate, de-identified usage patterns only.</li>
          <li>To email you about access and launch updates, if you explicitly asked us to.</li>
          <li>To contact you about your account or a serious product change.</li>
        </ul>
        <p>
          We do not use your content to train third-party advertising models or sell it in any form.
          If we ever use aggregate data to improve our own product, it is not tied back to you.
        </p>
      </section>

      <section className="legal-section">
        <h2>Who sees what you post</h2>
        <p>
          Palmi is built around small circles of 5&ndash;15 people. Content you post to a circle is
          visible only to members of that circle and to palmi staff acting in a narrow, documented
          role (abuse review, legal requests, or restoring a lost account at your request).
        </p>
        <p>
          Your profile photo and display name may be shown to other members of circles you join, and
          to people you invite.
        </p>
      </section>

      <section className="legal-section">
        <h2>Who we share data with</h2>
        <p>
          We share your data with a small set of vendors who help us run palmi. Each is bound by
          contract to use your data only to provide their service to us.
        </p>
        <ul className="legal-list">
          <li>
            <strong>Supabase</strong> &mdash; database, authentication, file storage.
          </li>
          <li>
            <strong>Twilio</strong> &mdash; SMS delivery for sign-in codes.
          </li>
          <li>
            <strong>Expo</strong> &mdash; push notification delivery.
          </li>
          <li>
            <strong>Model providers</strong> &mdash; we use large language models strictly for
            content moderation and for drafting daily questions. We do not send your name, phone
            number, or profile fields to these providers, and providers are prohibited from using
            our data for training.
          </li>
        </ul>
        <p>
          We do not sell your personal information. We do not share it with data brokers. We do not
          provide it to advertisers.
        </p>
      </section>

      <section className="legal-section">
        <h2>Retention</h2>
        <ul className="legal-list">
          <li>
            Your posts remain until you or your circle owner deletes them, or you delete your
            account.
          </li>
          <li>Security logs are retained for up to 90 days.</li>
          <li>
            Backups are rotated on a rolling basis and deleted data expires from them within 30
            days.
          </li>
          <li>
            If you delete your account, we remove your profile and content within 30 days, except
            where a narrow legal obligation requires us to keep specific records longer.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Your rights</h2>
        <p>Regardless of where you live, you can ask us to:</p>
        <ul className="legal-list">
          <li>Access a copy of your data.</li>
          <li>Correct anything that&rsquo;s wrong.</li>
          <li>Delete your account and associated content.</li>
          <li>Object to a specific use, or ask us to restrict it.</li>
        </ul>
        <p>
          To make any of these requests, email{' '}
          <a href="mailto:privacy@palmi.app">privacy@palmi.app</a> from the address tied to your
          account or verify with the phone number on file. We respond within 30 days.
        </p>
        <p>
          If you&rsquo;re in the EEA or UK, you have the right to complain to your local data
          protection authority. If you&rsquo;re in California, the CCPA/CPRA gives you the rights
          listed above; we do not &ldquo;sell&rdquo; or &ldquo;share&rdquo; personal information as
          those terms are defined by the CCPA.
        </p>
      </section>

      <section className="legal-section">
        <h2>Security</h2>
        <p>
          Your data is encrypted in transit and at rest. Access inside palmi is limited to the few
          people who need it to run the service. We enforce two-factor authentication on our admin
          tools. We&rsquo;re a small team, so we&rsquo;re not going to pretend we&rsquo;re
          impenetrable &mdash; but we take this seriously, and if something happens, we&rsquo;ll
          tell you directly.
        </p>
      </section>

      <section className="legal-section">
        <h2>Children</h2>
        <p>
          Palmi is not intended for anyone under 13. If you believe a child under 13 has created an
          account, email <a href="mailto:privacy@palmi.app">privacy@palmi.app</a> and we&rsquo;ll
          remove it.
        </p>
      </section>

      <section className="legal-section">
        <h2>International transfers</h2>
        <p>
          Palmi is operated from the United States. If you&rsquo;re accessing it from elsewhere,
          your data is transferred to and stored in the United States. We rely on Standard
          Contractual Clauses where required.
        </p>
      </section>

      <section className="legal-section">
        <h2>Changes to this policy</h2>
        <p>
          If we change this policy in a way that meaningfully affects you, we&rsquo;ll tell you in
          the app or by email before it takes effect. Older versions are available on request.
        </p>
      </section>

      <section className="legal-section">
        <h2>Contact</h2>
        <p>
          Privacy questions: <a href="mailto:privacy@palmi.app">privacy@palmi.app</a>
          <br />
          Everything else: <a href="mailto:hi@palmi.app">hi@palmi.app</a>
        </p>
      </section>

      <div className="legal-footer-nav">
        <Link href="/terms">Read the Terms &rarr;</Link>
      </div>
    </article>
  );
}
