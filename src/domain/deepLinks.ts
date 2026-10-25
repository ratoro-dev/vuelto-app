/**
 * Los links `rumbo://…` que abren los widgets, el botón de acción, el Centro de control y los atajos.
 * Devuelve la ruta de la app, o nada si el link no es de Rumbo.
 *
 * - rumbo://registrar?modo=voz&escuchar=1 → dictar ya mismo
 * - rumbo://inicio, rumbo://presupuesto, rumbo://metas, rumbo://movimientos, rumbo://sync
 * - rumbo://facturas
 */
export function deepLinkRoute(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'rumbo:') return undefined;
  // En "rumbo://registrar?…" el destino llega como host; en "rumbo:///registrar" como ruta
  const target = (parsed.host || parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  switch (target) {
    case 'registrar': {
      const modo = parsed.searchParams.get('modo');
      const query = new URLSearchParams();
      if (modo && ['voz', 'texto', 'foto', 'qr'].includes(modo)) query.set('modo', modo);
      if (parsed.searchParams.get('escuchar') === '1' && modo === 'voz') query.set('escuchar', '1');
      const q = query.toString();
      return `/tabs/registrar${q ? `?${q}` : ''}`;
    }
    case '':
    case 'inicio':
      return '/tabs/inicio';
    case 'facturas':
      return '/tabs/inicio/facturas';
    case 'sync':
      return '/tabs/movimientos/sync';
    case 'presupuesto':
    case 'metas':
    case 'movimientos':
      return `/tabs/${target}`;
    default:
      return '/tabs/inicio';
  }
}
