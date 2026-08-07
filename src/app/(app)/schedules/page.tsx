import { listSchedules, listShellAgents } from "@/lib/queries";
import { availableTimezones, systemTimezone } from "@/lib/cron";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { SchedulesView, type ScheduleItem } from "@/components/schedules-view";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent: agentId } = await searchParams;
  const [rows, agents, savedTimezone] = await Promise.all([
    listSchedules(agentId),
    listShellAgents(),
    getSetting(SETTING_KEYS.timezone),
  ]);

  const schedules: ScheduleItem[] = rows.map(({ schedule, agent }) => ({
    id: schedule.id,
    agentId: schedule.agentId,
    agentName: agent.name,
    agentAvatar: agent.avatar,
    name: schedule.name,
    cron: schedule.cron,
    timezone: schedule.timezone,
    taskPrompt: schedule.taskPrompt,
    enabled: schedule.enabled,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
  }));

  return (
    <SchedulesView
      schedules={schedules}
      agents={agents.map((a) => ({ id: a.id, name: a.name, avatar: a.avatar }))}
      scopedAgentId={agentId}
      timezones={availableTimezones()}
      defaultTimezone={savedTimezone ?? systemTimezone()}
    />
  );
}
