import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePhaseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  order!: number;

  @IsString()
  @IsOptional()
  description?: string;
}
