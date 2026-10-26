import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_SNAPSHOT_DAYS } from '../snapshot.service.js';

export class SnapshotsQueryDto {
  /** How many days of history, today included: 1 to 365, 30 when it is not given. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SNAPSHOT_DAYS)
  @IsOptional()
  days?: number;
}
