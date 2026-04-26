export type KnowledgeSection = {
  title: string;
  body: string[];
  bullets?: string[];
  callout?: string;
};

export type KnowledgeArticle = {
  slug: string;
  title: string;
  description: string;
  category: 'Essentials' | 'Using Palmi' | 'Trust';
  eyebrow: string;
  readTime: string;
  highlight?: boolean;
  sections: KnowledgeSection[];
};

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    slug: 'what-is-palmi',
    title: 'What Palmi Is',
    description:
      'Palmi is a quiet social layer for small circles of people who actually know each other.',
    category: 'Essentials',
    eyebrow: 'Start here',
    readTime: '3 min read',
    sections: [
      {
        title: 'A social app built for real relationships',
        body: [
          'Palmi is designed for the people you would actually invite into your life, not for a public audience. It keeps groups intentionally small, removes the algorithm, and trades posting pressure for a steadier rhythm.',
          'The point is not to perform online more elegantly. The point is to keep a few meaningful relationships active in a way that feels calm enough to return to.',
        ],
      },
      {
        title: 'What makes it different',
        body: [
          'Palmi reduces the usual social scaffolding so the important part can stay visible: the people themselves.',
        ],
        bullets: [
          'Small circles instead of follower graphs',
          'One daily question instead of an endless feed',
          'Chronological movement instead of algorithmic ranking',
          'Private rooms instead of public profiles',
          'A calm home screen that shows what matters without asking for constant attention',
        ],
      },
      {
        title: 'What Palmi is for',
        body: [
          'Use Palmi when you want a private room for a friend group, family, creative cohort, study group, running crew, or any other circle that benefits from a simple shared rhythm.',
          'It works best when the group already has some trust and just needs a better place to stay in motion together.',
        ],
      },
    ],
  },
  {
    slug: 'circles',
    title: 'Circles',
    description: 'Circles are Palmi’s core unit: small, private rooms for 2 to 15 people.',
    category: 'Essentials',
    eyebrow: 'The room itself',
    readTime: '4 min read',
    sections: [
      {
        title: 'How circles work',
        body: [
          'A circle is a shared room with its own members, daily ritual, and activity stream. Each one stays intentionally small so it can feel personal rather than ambient.',
          'Because circles are small, the interface can stay simple. You do not need follower mechanics, trending posts, or ranking systems to understand what is happening.',
        ],
      },
      {
        title: 'What you see inside a circle',
        body: ['Every circle includes a few stable surfaces that keep context clear.'],
        bullets: [
          'The current ritual prompt when one is open',
          'Recent moments from people in the room',
          'A room snapshot showing who is there and how the space is held',
          'Circle info for membership, invite path, and settings',
        ],
      },
      {
        title: 'Who circles are good for',
        body: [
          'Circles work well for close friend groups, distributed families, support circles, creative cohorts, learning groups, and lightweight accountability groups.',
          'The best circles are small enough that every person still feels legible.',
        ],
        callout:
          'Palmi is not trying to help you broadcast to everyone. It is trying to help you stay close to a few people on purpose.',
      },
    ],
  },
  {
    slug: 'daily-ritual',
    title: 'The Daily Ritual',
    description:
      'Every day, a circle gets one prompt. That shared question becomes the rhythm of the room.',
    category: 'Essentials',
    eyebrow: 'The rhythm',
    readTime: '3 min read',
    sections: [
      {
        title: 'One question, not infinite prompts',
        body: [
          'Palmi gives each circle one question a day. That constraint matters. A single prompt is enough to keep the room moving without making the app feel demanding.',
          'When a ritual is open, Home and Circles both make that visible. You do not have to hunt for what is waiting.',
        ],
      },
      {
        title: 'Why the ritual matters',
        body: [
          'The ritual is what keeps circles from going dormant after the first burst of setup. It gives every room a gentle reason to open the app without turning attention into a game.',
          'Because everyone is responding to the same prompt, even small updates feel shared rather than random.',
        ],
      },
      {
        title: 'How Palmi shows ritual status',
        body: ['The product keeps ritual status visible but does not let it hijack navigation.'],
        bullets: [
          'Home surfaces the nearest open ritual',
          'Circles are tagged with states like ritual waiting or answered today',
          'Once the question moves through the room, the feed keeps the context that followed from it',
        ],
      },
    ],
  },
  {
    slug: 'ai-circle-network',
    title: 'The AI Circle Network',
    description:
      'Palmi uses an active discovery flow to help people find circles that fit what they need, not just what matches a keyword.',
    category: 'Essentials',
    eyebrow: 'Highlighted',
    readTime: '4 min read',
    highlight: true,
    sections: [
      {
        title: 'What it is',
        body: [
          'The AI Circle Network is Palmi’s discovery layer for circles that choose to be findable. A person describes the kind of room they need, and Palmi actively searches for circles that match the shape, cadence, and social fit of that request.',
          'It is not a public directory. It is a guided matching system for private rooms that have opted into discovery.',
        ],
      },
      {
        title: 'How it works for a person searching',
        body: [
          'A search begins with a plain-language request like “small study group” or “more private weekly check-ins.” Palmi interprets that request, understands the kind of room being asked for, and searches across eligible circles in the network.',
          'Results include why a given circle fits, so the process feels explainable rather than opaque.',
        ],
        bullets: [
          'Palmi reads what the person asked for',
          'It maps the purpose, audience, and constraints of that request',
          'It searches discoverable circles across the network',
          'It narrows the results based on social fit before showing matches',
        ],
      },
      {
        title: 'Why this matters',
        body: [
          'Many people want a room but do not know who to ask, which keyword to use, or whether the culture of a group will fit. The AI Circle Network helps bridge that gap without turning Palmi into a noisy marketplace.',
          'Done well, discovery should feel like being guided into the right room, not dropped into a public feed of strangers.',
        ],
        callout:
          'Palmi is not trying to maximize search volume. It is trying to make a small number of introductions feel surprisingly right.',
      },
    ],
  },
  {
    slug: 'membership-and-invites',
    title: 'Membership and Invite Codes',
    description:
      'Most circles are entered through trust: a code, an invitation, or a thoughtful join request.',
    category: 'Using Palmi',
    eyebrow: 'Joining well',
    readTime: '3 min read',
    sections: [
      {
        title: 'The default path is trust',
        body: [
          'Circles are not designed for anonymous scale. Most people join because a host shares a code directly or because the room is intentionally discoverable and open to requests.',
          'That keeps membership closer to the people already inside the room.',
        ],
      },
      {
        title: 'Ways someone can join',
        body: ['Palmi supports a few different thresholds depending on the room.'],
        bullets: [
          'Join with a code from someone already inside the room',
          'Send a join request if the circle is discoverable',
          'Be screened automatically only in cases where the room has opted into that path',
        ],
      },
      {
        title: 'Why Palmi keeps the threshold visible',
        body: [
          'A room feels safer when people understand how someone got in. Hosts can keep the invite path quiet and explicit, and members can see enough context to know how the room is being held.',
        ],
      },
    ],
  },
  {
    slug: 'notifications',
    title: 'Notifications',
    description: 'Notifications in Palmi are meant to be useful, not urgent by default.',
    category: 'Using Palmi',
    eyebrow: 'Quiet nudges',
    readTime: '2 min read',
    sections: [
      {
        title: 'A quiet notification model',
        body: [
          'Palmi notifies you when something actually changes in a room you care about, not because the product wants another session. The goal is to help you show up for people, not to create compulsion loops.',
        ],
      },
      {
        title: 'What you can tune',
        body: [
          'Notification settings can be adjusted around the kind of movement you care about most.',
        ],
        bullets: [
          'Daily question drops',
          'New posts or answers',
          'Reactions',
          'Join requests if you help host a room',
        ],
      },
      {
        title: 'What Palmi avoids',
        body: [
          'Palmi does not use streak pressure, fear-based nudges, or endless “someone posted” pings across unrelated spaces. If a notification is not helping a relationship stay alive, it should probably not exist.',
        ],
      },
    ],
  },
  {
    slug: 'plans-and-pricing',
    title: 'Plans and Pricing',
    description:
      'Palmi is free to use, with paid upgrades for people who want more depth over time.',
    category: 'Using Palmi',
    eyebrow: 'What is paid',
    readTime: '2 min read',
    sections: [
      {
        title: 'Free first',
        body: [
          'Palmi is designed so the core experience remains useful without payment. You can create or join circles, take part in rituals, and stay connected without ads or follower mechanics.',
        ],
      },
      {
        title: 'What paid plans unlock',
        body: ['Upgrades are aimed at depth, reflection, and discovery rather than basic access.'],
        bullets: [
          'More recap history and archives',
          'Memory and reflection features',
          'Expanded discovery through the AI Circle Network where applicable',
          'Additional premium tools for people holding or growing multiple rooms',
        ],
      },
      {
        title: 'Why the model matters',
        body: [
          'Because Palmi is not funded by ads, the product does not need to maximize your time on screen. The pricing model exists so the business can stay aligned with a calm product.',
        ],
      },
    ],
  },
  {
    slug: 'privacy-and-safety',
    title: 'Privacy and Safety',
    description: 'Palmi is designed to protect intimacy, not to widen visibility by default.',
    category: 'Trust',
    eyebrow: 'Trust layer',
    readTime: '4 min read',
    sections: [
      {
        title: 'Private by default',
        body: [
          'Palmi is built around private circles, not public profiles. The product should help people feel held inside a room instead of exposed to the wider network.',
          'That means the default posture is to limit unnecessary visibility, keep room thresholds explicit, and make it clear when a circle has chosen to be discoverable.',
        ],
      },
      {
        title: 'Safety is part of the product shape',
        body: [
          'Good safety comes from product structure as much as policy. Small rooms, visible hosting roles, controlled invite paths, and clear membership context all reduce the ambiguity that makes social spaces feel risky.',
        ],
      },
      {
        title: 'The role of moderation',
        body: [
          'Palmi still uses moderation where needed, but the larger goal is to design rooms that stay understandable and governable before they become chaotic.',
        ],
        bullets: [
          'Hosts can control discoverability and access paths',
          'Join requests can be screened',
          'Unsafe content can be reviewed and limited',
          'Members can leave quietly when a room no longer fits',
        ],
      },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ',
    description: 'A short guide to the most common questions about how Palmi works.',
    category: 'Trust',
    eyebrow: 'Quick answers',
    readTime: '4 min read',
    sections: [
      {
        title: 'Is Palmi public?',
        body: [
          'No. Palmi is built around private circles. Some circles can choose to be discoverable through the AI Circle Network, but that is an explicit choice, not the default state of the product.',
        ],
      },
      {
        title: 'Do I need to post every day?',
        body: [
          'No. The ritual creates rhythm, but Palmi is not meant to punish absence. You can miss a day, miss a week, and still come back to the room.',
        ],
      },
      {
        title: 'Can I use Palmi without inviting a large group?',
        body: [
          'Yes. Palmi is intentionally built for small rooms. Some circles start with only a couple of people and grow slowly from there.',
        ],
      },
      {
        title: 'What if I want a circle but do not have one yet?',
        body: [
          'That is exactly what the AI Circle Network is for. You can describe the room you want, and Palmi will search discoverable circles that may fit.',
        ],
      },
    ],
  },
];

export const KNOWLEDGE_CATEGORIES = ['Essentials', 'Using Palmi', 'Trust'] as const;

export function getKnowledgeArticle(slug: string) {
  return KNOWLEDGE_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function getKnowledgeArticlesByCategory(category: KnowledgeArticle['category']) {
  return KNOWLEDGE_ARTICLES.filter((article) => article.category === category);
}

export const KNOWLEDGE_ROUTES = KNOWLEDGE_ARTICLES.map((article) => `/knowledge/${article.slug}`);
