import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BrowseDirectoryQueryDto } from './dto/browse-directory-query.dto.js';
import { FilesystemBrowserService } from './filesystem-browser.service.js';

/** Backs the docsPath folder picker on "create project" / Project Settings (Roadmap GAP-27). */
@UseGuards(JwtAuthGuard)
@Controller('filesystem-browser')
export class FilesystemBrowserController {
  constructor(
    private readonly filesystemBrowserService: FilesystemBrowserService,
  ) {}

  @Get('browse')
  browse(@Query() query: BrowseDirectoryQueryDto) {
    return this.filesystemBrowserService.browse(query.path);
  }
}
