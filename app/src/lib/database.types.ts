/**
 * Database types. Hand-written for v1.
 *
 * Once you have a Supabase project, regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type Uuid = string;
export type IsoDate = string;

export type Seniority =
  | 'intern'
  | 'ic'
  | 'manager'
  | 'director'
  | 'vp'
  | 'c_suite'
  | 'founder'
  | 'other';

export interface Profile {
  id: Uuid;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  phone: string | null;

  // Professional (B2B enterprise)
  full_name: string | null; // private � only Palmi AI backend reads this
  job_title: string | null;
  company: string | null;
  department: string | null;
  industry: string | null;
  seniority: Seniority | null;

  // Campus (B2C)
  school: string | null;
  graduation_year: number | null;

  // Location
  location_city: string | null;
  location_country: string | null; // ISO 3166-1 alpha-2

  // Open context
  bio: string | null; // <= 160 chars, shown in circle member cards
  website_url: string | null;

  // Billing (migration 026). Read-only on the client; only stripe-webhook writes.
  stripe_customer_id: string | null;
  subscription_tier: 'free' | 'premium' | 'premium_plus';
  subscription_status: 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  stripe_subscription_id: string | null;
  current_period_end: IsoDate | null;
  premium_since: IsoDate | null;

  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface ProfileTag {
  id: Uuid;
  profile_id: Uuid;
  tag: string;
  source: 'user' | 'ai';
  created_at: IsoDate;
}

/** Profile with tags - used in Palmi AI context. */
export type RichProfile = Profile & { tags: ProfileTag[] };

export interface Circle {
  id: Uuid;
  name: string;
  invite_code: string;
  created_by: Uuid;
  member_count: number;
  created_at: IsoDate;
  deleted_at: IsoDate | null;
  tier?: 'free' | 'paid';
  paid_since?: IsoDate | null;
  theme_key?: 'paper' | 'evening' | 'forest' | 'garden';
  onboarding_note?: string | null;
  pinned_post_id?: Uuid | null;
  discovery_priority?: number;
  recap_cadence?: 'monthly' | 'weekly';
  /** Phase 1.7: when true, owners have manually set the purpose; classifier
   * will refresh subtopics + summary but never overwrite purpose. */
  purpose_locked: boolean;
  /** Phase 2.1: opt-in discovery. Default false on every existing circle. */
  discoverable: boolean;
  admission_mode: AdmissionMode;
  /** Phase 2.1: required when discoverable=true (≤200 chars). */
  discovery_blurb: string | null;
}

/** Phase 2.1: how new members can enter a circle. Defaults to invite_only. */
export type AdmissionMode = 'closed' | 'invite_only' | 'request' | 'open_screened';

/** Phase 1.6: tightly enumerated set; mirrored in supabase/migrations/017
 *  and supabase/functions/_shared/curatorVariants.ts. */
export type CirclePurpose =
  | 'friends'
  | 'study'
  | 'professional'
  | 'interest'
  | 'wellness'
  | 'creator'
  | 'local'
  | 'other';

export type CircleAudience = 'campus' | 'young_adult' | 'professional' | 'mixed';

export interface CircleProfile {
  circle_id: Uuid;
  purpose: CirclePurpose;
  audience: CircleAudience;
  subtopics: string[];
  vibe_keywords: string[];
  summary: string | null;
  health_score?: number | null;
  activity_pattern?: 'dormant' | 'sparse' | 'steady' | 'bursty' | 'daily' | null;
  engagement_stats?: Record<string, unknown> | null;
  last_activity_at?: IsoDate | null;
  signal_version?: number;
  classified_at: IsoDate | null;
  classified_by: 'ai' | 'owner' | 'hybrid';
  created_at?: IsoDate;
  updated_at: IsoDate;
}

export interface Membership {
  id: Uuid;
  circle_id: Uuid;
  user_id: Uuid;
  role: 'member' | 'co_host' | 'owner';
  joined_at: IsoDate;
  left_at: IsoDate | null;
}

export interface Post {
  id: Uuid;
  circle_id: Uuid;
  author_id: Uuid;
  body: string | null;
  photo_url: string | null;
  moderation_status: 'ok' | 'held';
  created_at: IsoDate;
  deleted_at: IsoDate | null;
}

export type ReactionKind = 'heart' | 'laugh' | 'wow' | 'support';

export interface Reaction {
  id: Uuid;
  post_id: Uuid;
  user_id: Uuid;
  kind: ReactionKind;
  created_at: IsoDate;
}

export interface Recap {
  id: Uuid;
  circle_id: Uuid;
  period_start: IsoDate;
  period_end: IsoDate;
  body: string;
  source: 'ai' | 'template';
  created_at: IsoDate;
}

export interface FeedPost {
  id: Uuid;
  author_id: Uuid;
  author_name: string;
  author_avatar: string | null;
  body: string | null;
  photo_url: string | null;
  video_url: string | null;
  reply_to_id: Uuid | null;
  reply_to_author_name: string | null;
  reply_to_body: string | null;
  mentioned_user_ids: Uuid[];
  reaction_counts: Partial<Record<ReactionKind, number>>;
  user_reactions: ReactionKind[];
  created_at: IsoDate;
}

// ---------------------------------------------------------------------------
// Phase 2: discovery + join requests
// ---------------------------------------------------------------------------

export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'expired';
export type ScreeningRecommendation =
  | 'pending'
  | 'safe_auto_approve'
  | 'needs_owner_review'
  | 'reject';

export interface CircleJoinRequest {
  id: Uuid;
  circle_id: Uuid;
  requester_id: Uuid;
  intent_text: string;
  status: JoinRequestStatus;
  screening_recommendation: ScreeningRecommendation;
  screening_reason: string | null;
  decided_by: Uuid | null;
  decided_at: IsoDate | null;
  created_at: IsoDate;
}

export interface UserIntentLog {
  id: Uuid;
  user_id: Uuid;
  query_text: string;
  parsed_intent: ParsedIntent | null;
  embedding?: number[] | null;
  result_count: number;
  created_at: IsoDate;
}

export interface NotificationPrefs {
  user_id: Uuid;
  circle_id: Uuid;
  daily_question: boolean;
  new_posts: boolean;
  reactions: boolean;
  join_requests: boolean;
}

export interface PushToken {
  id: Uuid;
  user_id: Uuid;
  token: string;
  platform: 'ios' | 'android';
  enabled: boolean;
  created_at?: IsoDate;
}

export interface ParsedIntent {
  purpose: CirclePurpose | 'support' | 'mixed' | null;
  audience: string | null;
  subtopics: string[];
  constraints: string[];
}

/** Result row returned by the discover-circles edge function. */
export interface DiscoveredCircle {
  circle_id: Uuid;
  name: string;
  blurb: string | null;
  purpose: string | null;
  admission_mode: 'request' | 'open_screened';
  member_count: number;
  fit_reason: string;
  similarity: number;
}

export interface DiscoverResponse {
  results: DiscoveredCircle[];
  parsed_intent: ParsedIntent | null;
  query_id: Uuid | null;
  quota?: DiscoveryQuota | null;
}

export interface DiscoveryQuota {
  remaining: number;
  used: number;
  quota: number;
  tier: 'free' | 'premium' | 'premium_plus';
}

export interface PersonalReflection {
  id: Uuid;
  user_id: Uuid;
  period_start: IsoDate;
  period_end: IsoDate;
  body: string;
  source: 'ai' | 'template';
  created_at: IsoDate;
}

export interface MemorySearchResult {
  source_type: 'post' | 'answer';
  source_id: Uuid;
  circle_id: Uuid;
  circle_name: string;
  body: string | null;
  created_at: IsoDate;
  rank: number;
}

export interface YearbookEntry {
  entry_type: 'post' | 'answer';
  source_id: Uuid;
  circle_id: Uuid;
  circle_name: string;
  body: string | null;
  created_at: IsoDate;
}

export interface CircleParticipationSnapshot {
  active_members_avg: number | null;
  posting_members_avg: number | null;
  answer_rate_avg: number | null;
  posts_total: number;
  answers_total: number;
  reactions_total: number;
}

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type EmptySchemaObject = {
  [key: string]: never;
};

// Minimal Database type for supabase-js generic.
// Full generated types come later.
export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      circles: TableDef<Circle>;
      memberships: TableDef<Membership>;
      posts: TableDef<Post>;
      reactions: TableDef<Reaction>;
      recaps: TableDef<Recap>;
      profile_tags: TableDef<ProfileTag>;
      circle_profile: TableDef<CircleProfile>;
      circle_join_requests: TableDef<CircleJoinRequest>;
      notification_prefs: TableDef<NotificationPrefs>;
      push_tokens: TableDef<PushToken>;
      user_intent_log: TableDef<UserIntentLog>;
    };
    Views: EmptySchemaObject;
    Functions: {
      create_circle: { Args: { p_name: string }; Returns: Uuid };
      join_circle: { Args: { p_code: string }; Returns: Uuid };
      leave_circle: { Args: { p_circle_id: Uuid }; Returns: void };
      rename_circle: { Args: { p_circle_id: Uuid; p_name: string }; Returns: void };
      check_discovery_quota: { Args: { p_user: Uuid }; Returns: DiscoveryQuota[] };
      get_circle_feed: {
        Args: { p_circle_id: Uuid; p_before?: IsoDate; p_limit?: number };
        Returns: FeedPost[];
      };
      get_circle_participation_snapshot: {
        Args: { p_circle_id: Uuid; p_days?: number };
        Returns: CircleParticipationSnapshot[];
      };
      get_yearbook_entries: {
        Args: { p_year?: number | null };
        Returns: YearbookEntry[];
      };
      request_join_circle: {
        Args: { p_circle_id: Uuid; p_intent: string };
        Returns: Uuid;
      };
      approve_join_request: {
        Args: { p_request_id: Uuid };
        Returns: Uuid;
      };
      decline_join_request: {
        Args: { p_request_id: Uuid };
        Returns: void;
      };
      pin_circle_post: {
        Args: { p_circle_id: Uuid; p_post_id: Uuid | null };
        Returns: Circle;
      };
      search_my_memory: {
        Args: { p_query: string; p_limit?: number };
        Returns: MemorySearchResult[];
      };
      set_circle_member_role: {
        Args: { p_circle_id: Uuid; p_member_id: Uuid; p_role: 'member' | 'co_host' };
        Returns: void;
      };
      update_circle_premium_settings: {
        Args: {
          p_circle_id: Uuid;
          p_theme_key?: 'paper' | 'evening' | 'forest' | 'garden' | null;
          p_onboarding_note?: string | null;
          p_recap_cadence?: 'monthly' | 'weekly' | null;
          p_discovery_priority?: number | null;
        };
        Returns: Circle;
      };
    };
    Enums: EmptySchemaObject;
    CompositeTypes: EmptySchemaObject;
  };
}
