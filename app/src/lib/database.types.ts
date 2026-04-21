/**
 * Database types. Hand-written for v1.
 *
 * Once you have a Supabase project, regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type Uuid = string;
export type IsoDate = string;

export interface Profile {
  id: Uuid;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  created_at: IsoDate;
  updated_at: IsoDate;
}

export interface Circle {
  id: Uuid;
  name: string;
  invite_code: string;
  created_by: Uuid;
  member_count: number;
  created_at: IsoDate;
  deleted_at: IsoDate | null;
}

export interface Membership {
  id: Uuid;
  circle_id: Uuid;
  user_id: Uuid;
  role: 'member' | 'owner';
  joined_at: IsoDate;
  left_at: IsoDate | null;
}

export interface Post {
  id: Uuid;
  circle_id: Uuid;
  author_id: Uuid;
  body: string | null;
  photo_url: string | null;
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

export interface FeedPost {
  id: Uuid;
  author_id: Uuid;
  author_name: string;
  author_avatar: string | null;
  body: string | null;
  photo_url: string | null;
  reaction_counts: Partial<Record<ReactionKind, number>>;
  user_reactions: ReactionKind[];
  created_at: IsoDate;
}

// Minimal Database type for supabase-js generic.
// Full generated types come later.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      circles: { Row: Circle; Insert: Partial<Circle>; Update: Partial<Circle> };
      memberships: { Row: Membership; Insert: Partial<Membership>; Update: Partial<Membership> };
      posts: { Row: Post; Insert: Partial<Post>; Update: Partial<Post> };
      reactions: { Row: Reaction; Insert: Partial<Reaction>; Update: Partial<Reaction> };
    };
    Functions: {
      create_circle: { Args: { p_name: string }; Returns: Uuid };
      join_circle: { Args: { p_code: string }; Returns: Uuid };
      leave_circle: { Args: { p_circle_id: Uuid }; Returns: void };
      get_circle_feed: {
        Args: { p_circle_id: Uuid; p_before?: IsoDate; p_limit?: number };
        Returns: FeedPost[];
      };
    };
  };
}
