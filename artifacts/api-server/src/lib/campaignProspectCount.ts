import {
  autopilotEnrollmentsTable,
  callTasksTable,
  campaignsTable,
  emailsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * All-time unique prospects associated with the outer campaign row.
 * Include historical/inactive enrollments and tasks, not just active outreach.
 * Every source is tenant-scoped; repeated steps and overlapping sources count once.
 */
export function campaignProspectCount(clientId: string) {
  return sql<number>`(
    select count(distinct campaign_prospects.prospect_id)::int
    from (
      select ${emailsTable.prospectId} as prospect_id
      from ${emailsTable}
      where ${emailsTable.clientId} = ${clientId}
        and ${emailsTable.campaignId} = ${campaignsTable.id}
      union all
      select ${autopilotEnrollmentsTable.prospectId} as prospect_id
      from ${autopilotEnrollmentsTable}
      where ${autopilotEnrollmentsTable.clientId} = ${clientId}
        and ${autopilotEnrollmentsTable.campaignId} = ${campaignsTable.id}
      union all
      select ${callTasksTable.prospectId} as prospect_id
      from ${callTasksTable}
      where ${callTasksTable.clientId} = ${clientId}
        and ${callTasksTable.campaignId} = ${campaignsTable.id}
    ) as campaign_prospects
  )`;
}