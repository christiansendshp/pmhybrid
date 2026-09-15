import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAgentDto } from './create-agent.dto.js';

export class UpdateAgentDto extends PartialType(CreateAgentDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
