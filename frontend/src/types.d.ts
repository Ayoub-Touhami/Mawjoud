/** Les fichiers .svg importés arrivent sous forme de texte (option « loader » d'angular.json). */
/// <reference types="geojson" />

declare module '*.svg' {
  const contenu: string;
  export default contenu;
}
