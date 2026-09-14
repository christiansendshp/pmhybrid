import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-project-dashboard',
  imports: [RouterOutlet],
  template: `
    <h1>Project Dashboard</h1>
    <router-outlet></router-outlet>
  `,
})
export class ProjectDashboard {}
