// 開発用の初期データを SQL として標準出力に出す（reset.sh が psql に流す）。
// パスワードハッシュの形式は apps/web/src/server/auth/password.ts と同じ（scrypt$N$r$p$salt$hash）。
import { randomBytes, scryptSync } from 'node:crypto';

const DEV_PASSWORD = 'mahjong-dev-1234';

function hash(pw) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

const users = [
  ['00000000-0000-4000-8000-000000000001', 'platform@example.test', '運営'],
  ['00000000-0000-4000-8000-000000000002', 'owner@example.test', '龍門オーナー'],
  ['00000000-0000-4000-8000-000000000003', 'agent@example.test', '代理の辰'],
  ['00000000-0000-4000-8000-000000000011', 'p1@example.test', '東風'],
  ['00000000-0000-4000-8000-000000000012', 'p2@example.test', '南雲'],
  ['00000000-0000-4000-8000-000000000013', 'p3@example.test', '西園'],
  ['00000000-0000-4000-8000-000000000014', 'p4@example.test', '北斗'],
];
const [PLAT, OWNER, AGENT, P1, P2, P3, P4] = users.map((u) => u[0]);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const as = (uid) =>
  `set local role authenticated; select set_config('request.jwt.claims', ${q(JSON.stringify({ sub: uid, role: 'authenticated' }))}, true);`;
const out = [];
const tx = (uid, ...sql) => out.push('begin;', as(uid), ...sql, 'commit;');

out.push('begin;');
for (const [id, email, name] of users) {
  out.push(
    `insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values (${q(id)}, ${q(email)}, ${q(hash(DEV_PASSWORD))}, ${q(JSON.stringify({ display_name: name }))}::jsonb);`,
  );
}
out.push(`insert into public.platform_admins (user_id, note) values (${q(PLAT)}, 'local dev seed');`);
out.push('commit;');

// クラブ作成（オーナー）
tx(OWNER, `select public.create_club('龍門倶楽部', '開発用のクラブ。卓を開いて遊べます。');`);
// 以降の値は RLS で一般ユーザーから見えないので、スーパーユーザーのまま psql 変数に取っておく
out.push(`select id as club, club_code as code from public.clubs where owner_id = ${q(OWNER)} limit 1 \\gset`);
out.push(`select code as inv from public.club_invite_codes where club_id = :'club' and agent_id is null and revoked_at is null \\gset`);
const CLUB = `:'club'`;
const CODE = `:'code'`;
const INV = `:'inv'`;
const AINV = `:'ainv'`;

// ダイヤ付与（プラットフォーマー）
tx(PLAT, `select public.grant_diamonds(${CLUB}, 200, 'seed');`);
// エージェントと P1・P2 はクラブのコードで参加 → 承認 → エージェントへ昇格
for (const u of [AGENT, P1, P2]) tx(u, `select public.request_join_club(${CODE}, ${INV});`);
tx(
  OWNER,
  ...[AGENT, P1, P2].map((u) => `select public.approve_member(${CLUB}, ${q(u)}, true);`),
  `select public.set_member_role(${CLUB}, ${q(AGENT)}, 'agent');`,
);
out.push(`select code as ainv from public.club_invite_codes where club_id = :'club' and agent_id = ${q(AGENT)} and revoked_at is null \\gset`);
// P3・P4 はエージェントのコードで参加（＝エージェントの配下）→ エージェントが承認
for (const u of [P3, P4]) tx(u, `select public.request_join_club(${CODE}, ${AINV});`);
tx(AGENT, ...[P3, P4].map((u) => `select public.approve_member(${CLUB}, ${q(u)}, true);`));
// ポイント: 発行 → オーナーが配布 → エージェントが配下へ配布
tx(
  OWNER,
  `select public.issue_points(${CLUB}, 1000000, 'seed 発行');`,
  `select public.transfer_points(${CLUB}, ${q(OWNER)}, 50000, 'seed');`,
  `select public.transfer_points(${CLUB}, ${q(AGENT)}, 150000, 'seed');`,
  `select public.transfer_points(${CLUB}, ${q(P1)}, 50000, 'seed');`,
  `select public.transfer_points(${CLUB}, ${q(P2)}, 50000, 'seed');`,
);
tx(
  AGENT,
  `select public.transfer_points(${CLUB}, ${q(P3)}, 50000, 'seed');`,
  `select public.transfer_points(${CLUB}, ${q(P4)}, 50000, 'seed');`,
);

process.stdout.write(out.join('\n') + '\n');
