import { dispatch } from '@/server/http';
import '@/server/routes';

// すべての API はここ1か所で受けて src/server/routes/* の表に振り分ける。
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type C = { params: Promise<{ path: string[] }> };
const h = async (req: Request, { params }: C) => dispatch(req, (await params).path);

export { h as GET, h as POST, h as PATCH, h as DELETE };
