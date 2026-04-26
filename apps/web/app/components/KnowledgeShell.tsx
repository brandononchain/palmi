import Link from 'next/link';

import { KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES, type KnowledgeArticle } from '@/lib/knowledge';

function getAdjacentArticles(currentSlug: string) {
  const currentIndex = KNOWLEDGE_ARTICLES.findIndex((article) => article.slug === currentSlug);

  if (currentIndex === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: KNOWLEDGE_ARTICLES[currentIndex - 1] ?? null,
    next: KNOWLEDGE_ARTICLES[currentIndex + 1] ?? null,
  };
}

function getRelatedArticles(article: KnowledgeArticle) {
  return KNOWLEDGE_ARTICLES.filter(
    (candidate) => candidate.slug !== article.slug && candidate.category === article.category
  ).slice(0, 3);
}

function ArticleList({ currentSlug, mode }: { currentSlug?: string; mode: 'nav' | 'cards' }) {
  return (
    <div className={mode === 'nav' ? 'knowledge-nav-groups' : 'knowledge-card-groups'}>
      {KNOWLEDGE_CATEGORIES.map((category) => {
        const articles = KNOWLEDGE_ARTICLES.filter((article) => article.category === category);
        return (
          <section key={category} className="knowledge-group">
            <div className="knowledge-group-label">{category}</div>
            <div className={mode === 'nav' ? 'knowledge-nav-list' : 'knowledge-card-grid'}>
              {articles.map((article) => {
                const isActive = currentSlug === article.slug;
                return mode === 'nav' ? (
                  <Link
                    key={article.slug}
                    href={`/knowledge/${article.slug}`}
                    className={`knowledge-nav-link${isActive ? ' knowledge-nav-link-active' : ''}`}
                  >
                    <span>{article.title}</span>
                    {article.highlight ? <span className="knowledge-nav-badge">AI</span> : null}
                  </Link>
                ) : (
                  <Link
                    key={article.slug}
                    href={`/knowledge/${article.slug}`}
                    className="knowledge-card"
                  >
                    <div className="knowledge-card-topline">
                      <span className="knowledge-card-eyebrow">{article.eyebrow}</span>
                      <span className="knowledge-card-meta">{article.readTime}</span>
                    </div>
                    <h3>{article.title}</h3>
                    <p>{article.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function KnowledgeHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`knowledge-site-nav${compact ? ' knowledge-site-nav-compact' : ''}`}>
      <div className="knowledge-site-inner">
        <Link href="/" className="knowledge-logo">
          <span className="logo-mark" />
          <span>palmi</span>
        </Link>
        <nav className="knowledge-site-links">
          <Link href="/knowledge">Knowledge</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/">Home</Link>
        </nav>
      </div>
    </header>
  );
}

export function KnowledgeHome({ featured }: { featured: KnowledgeArticle }) {
  return (
    <>
      <KnowledgeHeader />
      <main className="knowledge-wrap">
        <section className="knowledge-hero">
          <div className="knowledge-hero-copy">
            <span className="knowledge-eyebrow">Knowledge archive</span>
            <h1>Everything worth understanding about Palmi, in one quiet place.</h1>
            <p>
              Start here if you want to understand what Palmi is, how circles work, why the daily
              ritual matters, and how the AI Circle Network helps people find the right room.
            </p>
          </div>

          <Link href={`/knowledge/${featured.slug}`} className="knowledge-feature-card">
            <div className="knowledge-feature-topline">
              <span className="knowledge-feature-label">Featured guide</span>
              <span className="knowledge-feature-badge">AI Circle Network</span>
            </div>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <div className="knowledge-feature-points">
              <span>active discovery</span>
              <span>social fit</span>
              <span>quiet introductions</span>
            </div>
          </Link>
        </section>

        <section className="knowledge-intro-band">
          <div>
            <span className="knowledge-band-label">What you will find here</span>
            <p>
              A small set of strong guides, not an endless documentation maze. Enough to understand
              the product, the trust model, and the discovery system without extra technical
              overhead.
            </p>
          </div>
        </section>

        <section className="knowledge-index">
          <ArticleList mode="cards" />
        </section>
      </main>
    </>
  );
}

export function KnowledgeArticleLayout({ article }: { article: KnowledgeArticle }) {
  const { previous, next } = getAdjacentArticles(article.slug);
  const related = getRelatedArticles(article);

  return (
    <>
      <KnowledgeHeader compact />
      <main className="knowledge-wrap knowledge-wrap-article">
        <div className="knowledge-article-grid">
          <aside className="knowledge-sidebar">
            <div className="knowledge-sidebar-card">
              <span className="knowledge-sidebar-label">Browse the archive</span>
              <ArticleList currentSlug={article.slug} mode="nav" />
            </div>
          </aside>

          <article className="knowledge-article">
            <header className="knowledge-article-header">
              <span className="knowledge-eyebrow">{article.eyebrow}</span>
              <h1>{article.title}</h1>
              <p>{article.description}</p>
              <div className="knowledge-article-meta">
                <span>{article.category}</span>
                <span>{article.readTime}</span>
              </div>
            </header>

            <div className="knowledge-article-body">
              {article.sections.map((section) => (
                <section key={section.title} className="knowledge-section">
                  <h2>{section.title}</h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets ? (
                    <ul>
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.callout ? (
                    <div className="knowledge-callout">{section.callout}</div>
                  ) : null}
                </section>
              ))}
            </div>

            <div className="knowledge-article-footer">
              {(previous || next) && (
                <div className="knowledge-adjacent-grid">
                  {previous ? (
                    <Link href={`/knowledge/${previous.slug}`} className="knowledge-adjacent-card">
                      <span className="knowledge-adjacent-label">Previous guide</span>
                      <strong>{previous.title}</strong>
                      <span>{previous.description}</span>
                    </Link>
                  ) : (
                    <div className="knowledge-adjacent-spacer" />
                  )}

                  {next ? (
                    <Link href={`/knowledge/${next.slug}`} className="knowledge-adjacent-card">
                      <span className="knowledge-adjacent-label">Next guide</span>
                      <strong>{next.title}</strong>
                      <span>{next.description}</span>
                    </Link>
                  ) : (
                    <div className="knowledge-adjacent-spacer" />
                  )}
                </div>
              )}

              {related.length > 0 && (
                <section className="knowledge-related-block">
                  <div className="knowledge-sidebar-label">Related guides</div>
                  <div className="knowledge-related-grid">
                    {related.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/knowledge/${item.slug}`}
                        className="knowledge-related-card"
                      >
                        <span className="knowledge-card-eyebrow">{item.eyebrow}</span>
                        <strong>{item.title}</strong>
                        <span>{item.readTime}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <Link href="/knowledge" className="knowledge-back-link">
                Back to knowledge archive
              </Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
