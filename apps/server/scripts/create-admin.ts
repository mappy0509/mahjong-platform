
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'password123';
    const displayName = 'Administrator';

    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const user = await prisma.user.upsert({
            where: { username },
            update: {
                passwordHash,
                role: UserRole.PLATFORMER,
            },
            create: {
                username,
                passwordHash,
                displayName,
                role: UserRole.PLATFORMER,
            },
        });

        console.log(`Admin user created/updated:`);
        console.log(`Username: ${user.username}`);
        console.log(`Password: ${password}`);
        console.log(`Role: ${user.role}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
