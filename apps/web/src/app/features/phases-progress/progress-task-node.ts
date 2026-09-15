import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { statusCountEntries } from '../../core/status-counts.js';
import { ProgressTaskNode } from '../../core/tasks.service.js';

/**
 * One row of the progress tree's task list, recursing into its own
 * `subtasks` at any depth (brief §16 "subtareas en el árbol") — a task's
 * `progress` already reflects its subtask rollup, so this only needs to
 * display the tree, not recompute anything.
 */
@Component({
  selector: 'app-progress-task-node',
  imports: [RouterLink, ProgressTaskNodeItem],
  templateUrl: './progress-task-node.html',
  styleUrl: './progress-task-node.scss',
})
export class ProgressTaskNodeItem {
  readonly task = input.required<ProgressTaskNode>();
  readonly countsFor = statusCountEntries;
}
