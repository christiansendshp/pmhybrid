import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_URL } from './api-base-url.js';
import { TaskCard, TasksService } from './tasks.service.js';

const card = (id: string) => ({ id, title: `Task ${id}` }) as unknown as TaskCard;

describe('TasksService.listForProject (Roadmap IMPROVEMENT-01d3)', () => {
  let service: TasksService;
  let backend: HttpTestingController;
  const url = `${API_BASE_URL}/projects/p1/tasks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TasksService);
    backend = TestBed.inject(HttpTestingController);
  });

  it('is one request when the list fits a page', async () => {
    const result = service.listForProject('p1');

    backend.expectOne(url).flush([card('a'), card('b')]);

    expect((await result).map((task) => task.id)).toEqual(['a', 'b']);
    backend.verify();
  });

  it('follows the cursor of each page until there is none, and returns the whole list in order', async () => {
    const result = service.listForProject('p1');

    backend.expectOne(url).flush([card('a'), card('b')], { headers: { 'X-Next-Cursor': 'c1' } });
    await Promise.resolve();
    backend
      .expectOne((request) => request.url === url && request.params.get('cursor') === 'c1')
      .flush([card('c'), card('d')], { headers: { 'X-Next-Cursor': 'c2' } });
    await Promise.resolve();
    backend
      .expectOne((request) => request.url === url && request.params.get('cursor') === 'c2')
      .flush([card('e')]);

    expect((await result).map((task) => task.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    backend.verify();
  });
});
