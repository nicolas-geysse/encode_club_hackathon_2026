/**
 * Profile Export API Route
 *
 * GET /api/profiles/export?id=xxx
 * Returns a JSON file for download containing the profile data.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query } from '../_db';

// Profile row type
interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  diploma: string | null;
  skills: string[] | null;
  city: string | null;
  city_size: string | null;
  income_sources: string | null;
  expenses: string | null;
  max_work_hours_weekly: number | null;
  min_hourly_rate: number | null;
  has_loan: boolean | null;
  loan_amount: number | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  monthly_margin: number | null;
  profile_type: string;
  parent_profile_id: string | null;
  goal_name: string | null;
  goal_amount: number | null;
  goal_deadline: string | null;
  plan_data: string | null;
  followup_data: string | null;
  achievements: string | null;
  is_active: boolean;
}

function rowToProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    diploma: row.diploma || undefined,
    skills: row.skills || undefined,
    city: row.city || undefined,
    citySize: row.city_size || undefined,
    incomeSources: row.income_sources ? JSON.parse(row.income_sources) : undefined,
    expenses: row.expenses ? JSON.parse(row.expenses) : undefined,
    maxWorkHoursWeekly: row.max_work_hours_weekly || undefined,
    minHourlyRate: row.min_hourly_rate || undefined,
    hasLoan: row.has_loan || undefined,
    loanAmount: row.loan_amount || undefined,
    monthlyIncome: row.monthly_income || undefined,
    monthlyExpenses: row.monthly_expenses || undefined,
    monthlyMargin: row.monthly_margin || undefined,
    profileType: row.profile_type || 'main',
    parentProfileId: row.parent_profile_id || undefined,
    goalName: row.goal_name || undefined,
    goalAmount: row.goal_amount || undefined,
    goalDeadline: row.goal_deadline || undefined,
    planData: row.plan_data ? JSON.parse(row.plan_data) : undefined,
    followupData: row.followup_data ? JSON.parse(row.followup_data) : undefined,
    achievements: row.achievements ? JSON.parse(row.achievements) : undefined,
    isActive: row.is_active,
  };
}

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('id');

    let profileRow: ProfileRow | null = null;

    if (profileId) {
      // Export specific profile
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE id = '${profileId}'`);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      profileRow = rows[0];
    } else {
      // Export active profile
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE is_active = TRUE LIMIT 1`);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'No active profile found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      profileRow = rows[0];
    }

    const profile = rowToProfile(profileRow);

    // Create export package
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      source: 'stride',
      profile,
    };

    // Generate filename
    const sanitizedName = profile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `stride_profile_${sanitizedName}_${new Date().toISOString().split('T')[0]}.json`;

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Profile Export] Error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Export failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
