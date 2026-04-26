import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { KnowledgeArticleLayout } from '@/app/components/KnowledgeShell';
import { getKnowledgeArticle, KNOWLEDGE_ARTICLES } from '@/lib/knowledge';

export function generateStaticParams() {
  return KNOWLEDGE_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getKnowledgeArticle(slug);

  if (!article) {
    return { title: 'Knowledge' };
  }

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: `/knowledge/${article.slug}`,
    },
  };
}

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getKnowledgeArticle(slug);

  if (!article) {
    notFound();
  }

  return <KnowledgeArticleLayout article={article} />;
}
