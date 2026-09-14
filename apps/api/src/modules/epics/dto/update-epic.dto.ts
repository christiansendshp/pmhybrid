import { PartialType } from '@nestjs/mapped-types';
import { CreateEpicDto } from './create-epic.dto.js';

export class UpdateEpicDto extends PartialType(CreateEpicDto) {}
