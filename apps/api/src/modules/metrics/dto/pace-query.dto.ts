import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The weeks a pace read draws when the request says none (Roadmap TASK-36). */
export const DEFAULT_WEEKS = 12;
export const MIN_WEEKS = 2;
export const MAX_WEEKS = 52;

export class PaceQueryDto {
  /** How many weeks to draw, the one in progress included. The forecast reads the whole history whatever this is. */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WEEKS)
  @Max(MAX_WEEKS)
  @IsOptional()
  weeks?: number;
}
