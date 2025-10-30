import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "argon2";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = schema.parse(body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "Email already in use" }, { status: 400 });

    const passwordHash = await hash(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
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