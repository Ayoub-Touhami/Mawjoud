// Sert un build compilé, avec retour sur index.html comme le ferait un hébergeur.
//   node e2e/serveur-statique.mjs <dossier> <port>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dossier, port] = process.argv.slice(2);
const racine = resolve(dossier);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

createServer((requete, reponse) => {
  const chemin = normalize(decodeURIComponent(requete.url.split('?')[0]));
  let fichier = join(racine, chemin);
  if (!fichier.startsWith(racine) || !existsSync(fichier) || statSync(fichier).isDirectory()) {
    fichier = join(racine, 'index.html');
  }
  reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
  createReadStream(fichier).pipe(reponse);
}).listen(Number(port), '127.0.0.1');
