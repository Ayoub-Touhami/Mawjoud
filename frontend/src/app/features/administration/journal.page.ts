import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { DateFrPipe } from './composants-admin';
import { AUDIT_LOG_SERVICE } from './services/admin.contrats';

/** Lecture seule : ni modification, ni suppression. */
@Component({
  selector: 'app-journal-page',
  imports: [DateFrPipe, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.journal' | transloco }}</h1>
    <div class="defilement" tabindex="0" role="region" [attr.aria-label]="'pages.journal' | transloco">
      <table>
        <caption>{{ 'admin.journal.legende' | transloco: { n: entrees().length } }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'admin.demandes.date' | transloco }}</th>
            <th scope="col">{{ 'admin.journal.auteur' | transloco }}</th>
            <th scope="col">{{ 'admin.journal.action' | transloco }}</th>
            <th scope="col">{{ 'admin.journal.cible' | transloco }}</th>
            <th scope="col">{{ 'admin.journal.detail' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (e of entrees(); track e.id) {
            <tr>
              <td>{{ e.date | dateFr }}</td>
              <td>{{ e.administrateur }}</td>
              <td>{{ 'admin.journal.actions.' + e.action | transloco }}</td>
              <td>{{ e.cible }}</td>
              <td>{{ e.detail ?? '—' }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="vide">{{ 'admin.journal.vide' | transloco }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './admin-partage.scss',
})
export class JournalPage {
  protected readonly entrees = toSignal(inject(AUDIT_LOG_SERVICE).lister(), { initialValue: [] });
}
