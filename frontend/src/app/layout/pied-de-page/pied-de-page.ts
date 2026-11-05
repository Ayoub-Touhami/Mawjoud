import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-pied-de-page',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pied-de-page.html',
  styleUrl: './pied-de-page.scss',
})
export class PiedDePage {}
