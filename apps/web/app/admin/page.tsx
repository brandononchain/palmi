import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Row = Record<string, unknown>;

async function fetchView(name: string, limit = 100): Promise<Row[]> {
  const sb = serviceClient();
  const { data, error } = await sb.schema('analytics').from(name).select('*').limit(limit);
  if (error) {
    console.error(`analytics.${name}`, error);
    return [];
  }
  return (data ?? []) as Row[];
}

async function fetchFunnelRows(limit = 500): Promise<Row[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('marketing_funnel_events')
    .select('event_name, source, created_at, page_path')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('marketing_funnel_events', error);
    return [];
  }
  return (data ?? []) as Row[];
}

async function fetchInstitutionalInquiries(limit = 100): Promise<Row[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('institutional_inquiries')
    .select('organization_name, work_email, program_type, cohort_size, status, source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('institutional_inquiries', error);
    return [];
  }
  return (data ?? []) as Row[];
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toFixed(3).replace(/\.?0+$/, '');
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

function Table({ rows, cols }: { rows: Row[]; cols: string[] }) {
  if (rows.length === 0) return <p style={{ color: 'var(--ink-faint)' }}>No data yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c}>{fmt(r[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminDashboard() {
  const [
    dau,
    wau,
    retention,
    postsPer,
    qRate,
    ttfp,
    reactions,
    fallbacks,
    waitlistCount,
    funnel,
    institutionalInquiries,
  ] = await Promise.all([
    fetchView('daily_active_users', 30),
    fetchView('weekly_active_users', 12),
    fetchView('retention_cohorts', 200),
    fetchView('posts_per_circle_per_week', 12),
    fetchView('daily_question_answer_rate', 12),
    fetchView('time_to_first_post', 1),
    fetchView('reactions_by_kind', 10),
    fetchView('top_fallback_questions', 20),
    (async () => {
      const sb = serviceClient();
      const { count } = await sb.from('waitlist').select('*', { count: 'exact', head: true });
      return count ?? 0;
    })(),
    fetchFunnelRows(),
    fetchInstitutionalInquiries(),
  ]);

  const last14d = funnel.filter((row) => {
    const createdAt = row.created_at;
    return (
      typeof createdAt === 'string' && Date.now() - new Date(createdAt).getTime() <= 14 * 86400000
    );
  });
  const eventCounts = Array.from(
    last14d.reduce((acc, row) => {
      const key = String(row.event_name ?? 'unknown');
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).map(([event_name, count]) => ({ event_name, count }));
  const sourceCounts = Array.from(
    last14d.reduce((acc, row) => {
      const key = `${String(row.source ?? 'unknown')} | ${String(row.event_name ?? 'unknown')}`;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).map(([label, count]) => {
    const [source, event_name] = label.split(' | ');
    return { source, event_name, count };
  });

  return (
    <main className="admin">
      <header>
        <h1>palmi / admin</h1>
        <p className="sub">
          Aggregate-only. No content bodies. No per-user rows. <a href="/admin/logout">sign out</a>
        </p>
      </header>

      <section>
        <h2>Waitlist</h2>
        <p className="big">{waitlistCount.toLocaleString()}</p>
        <p className="sub">total signups</p>
      </section>

      <section>
        <h2>Institutional inquiries</h2>
        <p className="big">{institutionalInquiries.length.toLocaleString()}</p>
        <p className="sub">most recent inbound program leads</p>
        <Table
          rows={institutionalInquiries}
          cols={[
            'created_at',
            'organization_name',
            'work_email',
            'program_type',
            'cohort_size',
            'status',
          ]}
        />
      </section>

      <section>
        <h2>Landing funnel (14d)</h2>
        <Table rows={eventCounts} cols={['event_name', 'count']} />
        <p className="note">Session-bucketed only. No cookies, no user ids, no page replay.</p>
      </section>

      <section>
        <h2>Landing sources (14d)</h2>
        <Table rows={sourceCounts} cols={['source', 'event_name', 'count']} />
      </section>

      <section>
        <h2>Daily active users (30d)</h2>
        <Table rows={dau} cols={['day', 'dau']} />
      </section>

      <section>
        <h2>Weekly active users (12w)</h2>
        <Table rows={wau} cols={['week_start', 'wau']} />
      </section>

      <section>
        <h2>Retention cohorts</h2>
        <Table
          rows={retention}
          cols={['cohort_week', 'n_users', 'week_offset', 'retained_share']}
        />
      </section>

      <section>
        <h2>Posts per circle per week (overall median)</h2>
        <Table
          rows={postsPer}
          cols={['week_start', 'median_posts', 'p25_posts', 'p75_posts', 'n_circles']}
        />
        <p className="note">Gated at ≥3 circles per week.</p>
      </section>

      <section>
        <h2>Daily question answer rate</h2>
        <Table rows={qRate} cols={['week_start', 'n_questions', 'answer_rate']} />
      </section>

      <section>
        <h2>Time to first post after circle creation</h2>
        <Table
          rows={ttfp}
          cols={[
            'n_eligible_circles',
            'n_circles_with_post',
            'median_hours_to_first_post',
            'p90_hours_to_first_post',
          ]}
        />
        <p className="note">Returns nothing until ≥5 circles with ≥5 members exist.</p>
      </section>

      <section>
        <h2>Reactions by kind (30d)</h2>
        <Table rows={reactions} cols={['kind', 'n', 'share']} />
      </section>

      <section>
        <h2>Top fallback questions</h2>
        <Table rows={fallbacks} cols={['question_text', 'times_used', 'tags']} />
      </section>
    </main>
  );
}
