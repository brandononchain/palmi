import Link from 'next/link';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#FAF9F6',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <nav>
        <div className="wrap inner">
          <Link href="/" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </Link>
          <div className="nav-links">
            <Link href="/#how">How it works</Link>
            <Link href="/#manifesto">Manifesto</Link>
            <Link href="/#waitlist" className="nav-cta">
              Request access
            </Link>
          </div>
        </div>
      </nav>

      <main className="legal-main">
        <div className="wrap legal-wrap">{children}</div>
      </main>

      <footer>
        <div className="wrap inner">
          <Link href="/" className="logo">
            <span className="logo-mark" />
            <span>palmi</span>
          </Link>
          <div className="footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hi@palmi.app">Contact</a>
          </div>
          <div className="footer-copy">&copy; 2026 palmi</div>
        </div>
      </footer>
    </div>
  );
}
