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
  video_url?: string | null;
  question_id?: string | null;
  reply_to_id?: string | null;
  mentions?: string[]; // uuids of mentioned users, attached after insert
}

// Calls the moderate-content Edge Function, which performs moderation AND the
// insert in one server-side hop. On reject, no row is created and the returned
// `reason` is the user-facing message. On pass/hold, `content_id` is set.
//
// If the edge function is unreachable we surface a `reject` with a clear
// reason so the caller can show an error — previously this fail-opened and
// the UI thought the post succeeded when nothing was actually written.
export async function moderateAndInsert(args: ModerateArgs): Promise<ModerationResult> {
  const { mentions, ...payload } = args;
  try {
    // Force-refresh the session before calling the edge function. On Android
    // the auto-refresh sometimes lags behind the actual expiry, which surfaces
    // as a 401 "unauthenticated" from the function's own getUser() check.
    // Pulling a fresh token here turns a silent auth failure into a clean
    // "signed out" state the AuthGate will handle.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      return {
        verdict: 'reject',
        categories: [],
        reason: 'Your session expired. Sign out and back in, then try again.',
      };
    }
    // refreshSession is a no-op if the token is still valid.
    await supabase.auth.refreshSession().catch(() => null);

    const { data, error } = await supabase.functions.invoke('moderate-content', {
      body: payload,
    });
    if (error) {
      // supabase-js v2: on non-2xx, `error.context` is the Response (or a
      // Response-like with .status + body helpers). The body can only be read
      // once, so clone defensively and try json -> text in order.
      let serverMsg: string | null = null;
      let status: number | null = null;
      try {
        const ctx: any = (error as any).context;
        if (ctx) {
          if (typeof ctx.status === 'number') status = ctx.status;
          // Prefer cloning so we can try multiple readers without
          // "body stream already read" errors.
          const cloneFn = typeof ctx.clone === 'function' ? ctx.clone.bind(ctx) : null;
          const tryJson = async (r: any) => {
            if (r && typeof r.json === 'function') {
              try {
                const parsed = await r.json();
                if (parsed && typeof parsed.error === 'string') return parsed.error as string;
              } catch {
                // not JSON
              }
            }
            return null;
          };
          const tryText = async (r: any) => {
            if (r && typeof r.text === 'function') {
              try {
                const txt = await r.text();
                if (txt) {
                  try {
                    const parsed = JSON.parse(txt);
                    if (parsed && typeof parsed.error === 'string') return parsed.error as string;
                  } catch {
                    return txt.slice(0, 200);
                  }
                }
              } catch {
                // ignore
              }
            }
            return null;
          };
          serverMsg =
            (await tryJson(cloneFn ? cloneFn() : ctx)) ??
            (await tryText(cloneFn ? cloneFn() : ctx));
        }
      } catch {
        // fall through
      }
      // Log full error so Metro shows it in the console while developing.
      // eslint-disable-next-line no-console
      console.warn('[moderateAndInsert] invoke error', { status, serverMsg, error });
      const reasonMap: Record<string, string> = {
        unauthenticated: 'Your session expired. Sign out and back in, then try again.',
        forbidden: "You're not in this circle anymore.",
        server_misconfigured: 'Server is not configured. Contact support.',
        bad_request: 'Something about that post is invalid.',
        empty_content: 'Add some text or a photo before posting.',
        missing_question: 'No question selected.',
      };
      return {
        verdict: 'reject',
        categories: [],
        reason:
          (serverMsg && reasonMap[serverMsg]) ||
          (serverMsg
            ? `Server error: ${serverMsg}`
            : status === 401
              ? reasonMap.unauthenticated
              : status === 403
                ? reasonMap.forbidden
                : status && status >= 500
                  ? 'Server error. Please try again in a moment.'
                  : "Couldn't reach the server. Check your connection and try again."),
      };
    }
    const result = data as ModerationResult;

    if (!result || typeof result.verdict !== 'string') {
      return {
        verdict: 'reject',
        categories: [],
        reason: 'Something went wrong posting. Please try again.',
      };
    }

    if (
      result.content_id &&
      (result.verdict === 'pass' || result.verdict === 'hold') &&
      mentions &&
      mentions.length > 0
    ) {
      const rows = mentions.map((uid) => ({
        post_id: result.content_id!,
        mentioned_user_id: uid,
      }));
      await (supabase.from('post_mentions') as any).insert(rows);
    }

    return result;
  } catch {
    return {
      verdict: 'reject',
      categories: [],
      reason: "Couldn't reach the server. Check your connection and try again.",
    };
  }
}
