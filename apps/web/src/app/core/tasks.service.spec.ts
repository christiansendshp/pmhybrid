import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_URL } from './api-base-url.js';
import { TaskCard, TasksService } from './tasks.service.js';

const card = (id: string) => ({ id, title: `Task ${id}` }) as unknown as TaskCard;

describe('TasksService.table (Roadmap TASK-18)', () => {
  let service: TasksService;
  let backend: HttpTestingController;
  const url = `${API_BASE_URL}/projects/p1/task-table`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TasksService);
    backend = TestBed.inject(HttpTestingController);
  });

  it('sends only what it was asked for, with a flag as 1', async () => {
    const result = service.table('p1', {
      q: 'sync',
      blocked: true,
      divergent: false,
      stale: 72,
      sort: 'priority',
      dir: 'desc',
      limit: 50,
      offset: 100,
    });

    const request = backend.expectOne((req) => req.url === url);
    expect(
      Object.fromEntries(
        request.request.params.keys().map((key) => [key, request.request.params.get(key)]),
      ),
    ).toEqual({
      q: 'sync',
      blocked: '1',
      stale: '72',
      sort: 'priority',
      dir: 'desc',
      limit: '50',
      offset: '100',
    });
    request.flush({ total: 0, offset: 100, limit: 50, sort: 'priority', dir: 'desc', items: [] });
    expect((await result).total).toBe(0);
    backend.verify();
  });

  it('sends no query at all for a table nobody filtered or ordered', async () => {
    const result = service.table('p1', {});

    const request = backend.expectOne((req) => req.url === url);
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ total: 3, offset: 0, limit: 50, sort: 'createdAt', dir: 'asc', items: [] });
    expect((await result).total).toBe(3);
  });
});

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
