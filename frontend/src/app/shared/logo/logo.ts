import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marqueur, nom et nom arabe, sur une ligne comme dans l'en-tête du PDF de design. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
})
export class Logo {
  /** Taille du marqueur, en pixels de hauteur. */
  readonly taille = input(40);
}
