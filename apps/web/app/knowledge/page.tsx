import type { Metadata } from 'next';

import { KnowledgeHome } from '@/app/components/KnowledgeShell';
import { KNOWLEDGE_ARTICLES } from '@/lib/knowledge';

const featured = KNOWLEDGE_ARTICLES.find((article) => article.highlight) ?? KNOWLEDGE_ARTICLES[0];

export const metadata: Metadata = {
  title: 'Knowledge',
  description:
    'Understand what Palmi is, how circles work, and how the AI Circle Network helps people find the right room.',
  alternates: {
    canonical: '/knowledge',
  },
};

export default function KnowledgePage() {
  if (!featured) return null;
  return <KnowledgeHome featured={featured} />;
}
