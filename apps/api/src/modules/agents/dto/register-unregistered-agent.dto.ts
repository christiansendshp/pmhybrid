import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/dto-limits.js';

export class RegisterUnregisteredAgentDto {
  /** A name the project's ledger carries that no agent answers to, as `GET /projects/:id/agents/unregistered` lists it. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.ID)
  name!: string;
}
