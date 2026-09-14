import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateDto } from './create-template.dto.js';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
