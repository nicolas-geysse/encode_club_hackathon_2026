/**
 * Missions API Route
 *
 * Handles mission management operations.
 * Actions: list, create, create_from_scenarios, validate, complete, skip, update_progress, delete, get
 */

import type { APIEvent } from '@solidjs/start/server';

// Types - reusing Mission interface from MissionCard
export interface Mission {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade';
  weeklyHours: number;
  weeklyEarnings: number;
  status: 'active' | 'completed' | 'skipped';
  progress: number;
  startDate: string;
  hoursCompleted: number;
  earningsCollected: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade';
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number;
  flexibilityScore: number;
  hourlyRate: number;
}

interface MissionStats {
  total: number;
  active: number;
  completed: number;
  skipped: number;
  totalEarnings: number;
  totalHours: number;
}

// In-memory storage (hackathon MVP)
const missionsStore: Map<string, Mission> = new Map();

// Helper to generate UUID
function generateId(): string {
  return 'mission_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
}

// Calculate stats for a user's missions
function calculateStats(userId: string): MissionStats {
  const userMissions = Array.from(missionsStore.values()).filter(
    (m) => m.userId === userId || !m.userId
  );

  return {
    total: userMissions.length,
    active: userMissions.filter((m) => m.status === 'active').length,
    completed: userMissions.filter((m) => m.status === 'completed').length,
    skipped: userMissions.filter((m) => m.status === 'skipped').length,
    totalEarnings: userMissions.reduce((sum, m) => sum + m.earningsCollected, 0),
    totalHours: userMissions.reduce((sum, m) => sum + m.hoursCompleted, 0),
  };
}

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { action, userId = 'anonymous' } = body;

    switch (action) {
      case 'list': {
        const { status: filterStatus } = body;

        let missions = Array.from(missionsStore.values()).filter(
          (m) => m.userId === userId || !m.userId
        );

        if (filterStatus) {
          missions = missions.filter((m) => m.status === filterStatus);
        }

        // Sort by status (active first) then by creation date
        missions.sort((a, b) => {
          const statusOrder = { active: 0, completed: 1, skipped: 2 };
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        return new Response(
          JSON.stringify({
            missions,
            stats: calculateStats(userId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'get': {
        const { missionId } = body;

        const mission = missionsStore.get(missionId);
        if (!mission) {
          return new Response(JSON.stringify({ error: true, message: 'Mission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(mission), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'create': {
        const { title, description, category, weeklyHours, weeklyEarnings } = body;

        if (!title || !category) {
          return new Response(
            JSON.stringify({ error: true, message: 'Title and category are required' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        const mission: Mission = {
          id: generateId(),
          title,
          description: description || '',
          category: category || 'freelance',
          weeklyHours: weeklyHours || 0,
          weeklyEarnings: weeklyEarnings || 0,
          status: 'active',
          progress: 0,
          startDate: new Date().toISOString(),
          hoursCompleted: 0,
          earningsCollected: 0,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        missionsStore.set(mission.id, mission);

        return new Response(JSON.stringify(mission), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'create_from_scenarios': {
        const { scenarios } = body as { scenarios: Scenario[] };

        if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
          return new Response(
            JSON.stringify({ error: true, message: 'Scenarios array is required' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        const createdMissions: Mission[] = [];

        for (const scenario of scenarios) {
          const mission: Mission = {
            id: generateId(),
            title: scenario.title,
            description: scenario.description,
            category: scenario.category,
            weeklyHours: scenario.weeklyHours,
            weeklyEarnings: scenario.weeklyEarnings,
            status: 'active',
            progress: 0,
            startDate: new Date().toISOString(),
            hoursCompleted: 0,
            earningsCollected: 0,
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          missionsStore.set(mission.id, mission);
          createdMissions.push(mission);
        }

        return new Response(
          JSON.stringify({
            missions: createdMissions,
            count: createdMissions.length,
            stats: calculateStats(userId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'validate':
      case 'complete': {
        const { missionId } = body;

        const mission = missionsStore.get(missionId);
        if (!mission) {
          return new Response(JSON.stringify({ error: true, message: 'Mission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        mission.status = 'completed';
        mission.progress = 100;
        mission.hoursCompleted = mission.weeklyHours;
        mission.earningsCollected = mission.weeklyEarnings;
        mission.updatedAt = new Date().toISOString();

        missionsStore.set(missionId, mission);

        return new Response(
          JSON.stringify({
            mission,
            stats: calculateStats(mission.userId || userId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'skip': {
        const { missionId } = body;

        const mission = missionsStore.get(missionId);
        if (!mission) {
          return new Response(JSON.stringify({ error: true, message: 'Mission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        mission.status = 'skipped';
        mission.updatedAt = new Date().toISOString();

        missionsStore.set(missionId, mission);

        return new Response(
          JSON.stringify({
            mission,
            stats: calculateStats(mission.userId || userId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'update_progress': {
        const { missionId, hours, earnings } = body;

        const mission = missionsStore.get(missionId);
        if (!mission) {
          return new Response(JSON.stringify({ error: true, message: 'Mission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (hours !== undefined) {
          mission.hoursCompleted = Math.min(hours, mission.weeklyHours);
        }
        if (earnings !== undefined) {
          mission.earningsCollected = Math.min(earnings, mission.weeklyEarnings);
        }

        // Calculate progress based on hours and earnings
        const hoursProgress =
          mission.weeklyHours > 0 ? (mission.hoursCompleted / mission.weeklyHours) * 100 : 100;
        const earningsProgress =
          mission.weeklyEarnings > 0
            ? (mission.earningsCollected / mission.weeklyEarnings) * 100
            : 100;
        mission.progress = Math.round((hoursProgress + earningsProgress) / 2);

        // Auto-complete at 100%
        if (mission.progress >= 100) {
          mission.status = 'completed';
          mission.progress = 100;
        }

        mission.updatedAt = new Date().toISOString();
        missionsStore.set(missionId, mission);

        return new Response(
          JSON.stringify({
            mission,
            stats: calculateStats(mission.userId || userId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      case 'delete': {
        const { missionId } = body;

        const mission = missionsStore.get(missionId);
        if (!mission) {
          return new Response(JSON.stringify({ error: true, message: 'Mission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const missionUserId = mission.userId || userId;
        missionsStore.delete(missionId);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Mission deleted',
            stats: calculateStats(missionUserId),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(JSON.stringify({ error: true, message: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Missions API error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
