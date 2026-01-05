import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "argon2";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3).max(32).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, username, avatarUrl } = schema.parse(body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

    let finalUsername = username ?? email.split("@")[0];
    if (username) {
      const existingUserName = await prisma.user.findUnique({ where: { username } });
      if (existingUserName) {
        return NextResponse.json({ error: "Username already in use" }, { status: 409 });
      }
    } else {
      if (finalUsername.length < 3) {
        finalUsername = `${finalUsername}${Math.floor(Math.random() * 1000)}`;
      }
      const existingUserName = await prisma.user.findUnique({ where: { username: finalUsername } });
      if (existingUserName) {
        finalUsername = `${finalUsername}-${Math.floor(Math.random() * 9999)}`;
      }
    }

    const passwordHash = await hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        username: finalUsername,
        avatarUrl,
        wallets: {
          create: [{ currency: "PLAY", balance: BigInt(10_000), held: BigInt(0) }], // give starter play credits
        },
      },
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Invalid request" }, { status: 400 });
  }
}
