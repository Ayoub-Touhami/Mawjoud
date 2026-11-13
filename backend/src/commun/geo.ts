/**
 * Distance haversine en mètres, en SQL (PostGIS n'est pas installé). Les arguments sont des expressions
 * SQL déjà sûres (noms de colonnes ou paramètres $n) : jamais une valeur venue d'une requête HTTP.
 */
export function distanceMetresSql(latA: string, lngA: string, latB: string, lngB: string): string {
  return `(2 * 6371000 * asin(least(1.0, sqrt(
      power(sin(radians((${latB})::float8 - (${latA})::float8) / 2), 2)
    + cos(radians((${latA})::float8)) * cos(radians((${latB})::float8))
      * power(sin(radians((${lngB})::float8 - (${lngA})::float8) / 2), 2)))))`;
}

