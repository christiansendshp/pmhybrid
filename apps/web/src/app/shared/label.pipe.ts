import { Pipe, PipeTransform } from '@angular/core';
import { label, LabelKind } from '../core/labels';

/** `{{ event.operation | label: 'operation' }}` — the Spanish name of an API enum (Roadmap UX-03a). */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined, kind: LabelKind): string {
    return label(kind, value);
  }
}
