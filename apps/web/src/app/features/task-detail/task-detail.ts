import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-task-detail',
  template: `<h2>Task {{ taskId }}</h2>`,
})
export class TaskDetail {
  private readonly route = inject(ActivatedRoute);
  protected readonly taskId = this.route.snapshot.paramMap.get('taskId');
}
