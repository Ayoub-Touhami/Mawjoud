/** Les fichiers .svg importés arrivent sous forme de texte (option « loader » d'angular.json). */
declare module '*.svg' {
  const contenu: string;
  export default contenu;
}
