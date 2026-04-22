import { supabase } from './supabase';

export type ModerationVerdict = 'pass' | 'hold' | 'reject';

export interface ModerationResult {
  verdict: ModerationVerdict;
  categories: string[];
  reason?: string;
  content_id?: string;
}

export interface ModerateArgs {
  circle_id: string;
  content_type: 'post' | 'answer';
  body?: string | null;
  photo_url?: string | null;
  question_id?: string | null;
}

// Calls the moderate-content Edge Function, which performs moderation AND the
// insert in one server-side hop. On reject, no row is created and the returned
// `reason` is the user-facing message. On pass/hold, `content_id` is set.
//
// Fails OPEN on network error — we treat it as a pass so the user's content is
// not blocked by an outage, matching the server-side contract.
export async function moderateAndInsert(args: ModerateArgs): Promise<ModerationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('moderate-content', {
      body: args,
    });
    if (error) {
      return { verdict: 'pass', categories: [], reason: 'moderator_unreachable' };
    }
    return data as ModerationResult;
  } catch {
    return { verdict: 'pass', categories: [], reason: 'moderator_unreachable' };
  }
}
