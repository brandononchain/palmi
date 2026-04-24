// ============================================================================
// supabase/functions/_shared/curatorVariants.ts
// ----------------------------------------------------------------------------
// Per-purpose system-prompt fragments + user-prompt hints for curate-question.
//
// The curator picks a variant from a circle's circle_profile.purpose. If no
// profile exists (legacy circles, or classification hasn't run yet), the
// 'friends' variant is used — which is identical in spirit to the original
// pre-Phase-1 prompt, so existing circles see no behavior change.
//
// Adding a new vertical (e.g., 'investor') = add a new entry here + add at
// least 30 fallback questions tagged with that purpose in migration 020.
// ============================================================================

export type CirclePurpose =
  | 'friends'
  | 'study'
  | 'professional'
  | 'interest'
  | 'wellness'
  | 'creator'
  | 'local'
  | 'other';

export interface CuratorVariant {
  id: CirclePurpose;
  /** Appended to the base palmi voice rules. ≤ 6 short bullets. */
  systemFragment: string;
  /** One short paragraph appended to the user prompt context block. */
  userPromptHint: string;
}

const VARIANTS: Record<CirclePurpose, CuratorVariant> = {
  friends: {
    id: 'friends',
    // Empty fragment = use the base palmi voice exactly as written.
    systemFragment: '',
    userPromptHint:
      'This circle is a small group of friends. Lean toward sensory, ' +
      'present-moment, or playful prompts.',
  },

  study: {
    id: 'study',
    systemFragment:
      '## Tone for this circle\n' +
      'This is a study group. Members support each other through learning ' +
      'cadence and motivation. Useful prompts touch on:\n' +
      '- a small thing you understood today that confused you yesterday\n' +
      '- the next thing you want to learn (one sentence)\n' +
      '- where you got stuck and how you moved past it\n' +
      'Avoid pop-quiz energy, grades talk, or comparing each other.',
    userPromptHint:
      'Members are studying together. Pick a prompt that supports learning ' +
      'reflection or low-pressure accountability — never quiz-style.',
  },

  professional: {
    id: 'professional',
    systemFragment:
      '## Tone for this circle\n' +
      'This is a professional peer circle (founders, operators, investors, ' +
      'designers, etc.). Useful prompts touch on:\n' +
      '- a small bet, hypothesis, or call you made this week\n' +
      '- something you changed your mind about\n' +
      '- the question you keep coming back to\n' +
      'Stay specific and concrete. No personal-finance, no salary, no ' +
      'company-confidential probes. No therapy framing.',
    userPromptHint:
      'Members are professional peers. Prefer prompts about thinking, ' +
      'decisions, or signal-sharing over personal-life prompts.',
  },

  interest: {
    id: 'interest',
    systemFragment:
      '## Tone for this circle\n' +
      'This circle is built around a shared interest or hobby. Anchor the ' +
      'prompt in the activity itself when natural — but stay open enough ' +
      'that someone having a quiet week can still answer in one sentence.',
    userPromptHint:
      'Members share an interest. Reference it lightly when subtopics are ' +
      'provided; never force it.',
  },

  wellness: {
    id: 'wellness',
    systemFragment:
      '## Tone for this circle\n' +
      'This is a wellness / movement / mindfulness circle. Useful prompts ' +
      'touch on small, observable behaviors (a meal, a walk, a moment of ' +
      'rest). Strict no-go zones:\n' +
      '- weight, body image, or appearance\n' +
      '- diet rules or calorie language\n' +
      '- therapy substitutes ("how are you really")',
    userPromptHint:
      'Members support each other on wellness habits. Keep prompts about ' +
      'small observable moments, never about bodies or numbers.',
  },

  creator: {
    id: 'creator',
    systemFragment:
      '## Tone for this circle\n' +
      'This is a circle of people who make things (writers, designers, ' +
      'musicians, builders). Useful prompts touch on:\n' +
      '- a tiny thing you made or fixed today\n' +
      '- what you cut\n' +
      '- the part you keep avoiding\n' +
      'Avoid follower/metric talk. The work, not the audience.',
    userPromptHint:
      'Members are makers. Prefer process and craft prompts over audience ' + 'or metrics prompts.',
  },

  local: {
    id: 'local',
    systemFragment:
      '## Tone for this circle\n' +
      'This circle is grounded in a shared place (campus, neighborhood, ' +
      'building). Sensory and "right outside your window" prompts work well.',
    userPromptHint:
      'Members share a physical place. Lean into specific sensory prompts ' +
      'that the place might prompt different answers to.',
  },

  other: {
    id: 'other',
    systemFragment: '',
    userPromptHint: 'Circle purpose is unclear; default to the friends-style prompt.',
  },
};

/** Returns the variant for a purpose, falling back to 'friends' on unknown input. */
export function getCuratorVariant(purpose: string | null | undefined): CuratorVariant {
  if (!purpose) return VARIANTS.friends;
  const v = VARIANTS[purpose as CirclePurpose];
  return v ?? VARIANTS.friends;
}

export const CURATOR_VARIANT_IDS = Object.keys(VARIANTS) as CirclePurpose[];
