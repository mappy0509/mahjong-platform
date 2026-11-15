import { notFound, redirect } from 'next/navigation';
import { ClubLobby } from '@/components/lobby/ClubLobby';
import { isUuid } from '@/server/db';
import { getSession } from '@/server/session';

export const metadata = { title: 'クラブ — 雀卓' };

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/clubs/${id}`)}`);
  return <ClubLobby clubId={id} userId={session.id} />;
}
