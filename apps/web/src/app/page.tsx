import { HomeGuest } from '@/components/lobby/HomeGuest';
import { HomeMember } from '@/components/lobby/HomeMember';
import { getSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSession();
  return session ? <HomeMember /> : <HomeGuest />;
}
