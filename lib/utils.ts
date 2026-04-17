import { Client, Priority } from './types';

export function haversineDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function smartSort(clients: Client[]): Client[] {
  return [...clients].sort((a, b) => {
    // 1. Priority: High first
    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pd !== 0) return pd;
    // 2. Distance: closer first
    const dd = (a.distance ?? Infinity) - (b.distance ?? Infinity);
    if (dd !== 0) return dd;
    // 3. Last Met: oldest first (nulls = never met → highest urgency → sort first)
    if (!a.lastMet && !b.lastMet) return 0;
    if (!a.lastMet) return -1;
    if (!b.lastMet) return 1;
    return new Date(a.lastMet).getTime() - new Date(b.lastMet).getTime();
  });
}

export function formatLastMet(iso: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}yr ago`;
}

export function meetingPlanScore(client: Client): number {
  const priorityPts = { High: 100, Medium: 50, Low: 20 }[client.priority];
  // Recency: older last-met = higher urgency (max 100pts at 1+ year)
  const days = client.lastMet
    ? (Date.now() - new Date(client.lastMet).getTime()) / 86400000
    : 400; // never met = treat as very overdue
  const recencyPts = Math.min(days, 365) / 3.65;
  // Proximity: closer = better (max 50pts at 0km, 0pts at 100km)
  const proximityPts = Math.max(0, 50 - (client.distance ?? 999) * 0.5);
  return priorityPts + recencyPts + proximityPts;
}

export function exportToCSV(clients: Client[]): void {
  const headers = ['Name', 'Type', 'Priority', 'City', 'Country', 'Distance (km)', 'Last Met', 'Coverage', 'Notes'];
  const rows = clients.map((c) => [
    c.name,
    c.type,
    c.priority,
    c.city,
    c.country,
    c.distance?.toFixed(1) ?? '',
    c.lastMet ?? '',
    c.coverage,
    c.notes,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
