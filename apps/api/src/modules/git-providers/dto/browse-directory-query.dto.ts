import { IsOptional, IsString } from 'class-validator';

export class BrowseDirectoryQueryDto {
  @IsString()
  @IsOptional()
  path?: string;
}
