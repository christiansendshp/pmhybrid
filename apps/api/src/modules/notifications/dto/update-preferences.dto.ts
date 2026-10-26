import { SummaryFrequency } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** What a person can choose about being notified (Roadmap TASK-42). */
export class UpdatePreferencesDto {
  /** How often they are sent the summary of what changed in their projects. */
  @IsEnum(SummaryFrequency)
  summaryFrequency!: SummaryFrequency;
}
