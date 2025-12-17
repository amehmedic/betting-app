import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { verify } from "argon2";

const updateSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(32).optional(),
  avatarUrl: z.string().url().optional(),
  currentPassword: z.string().min(1).optional(),
});

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, username: true, avatarUrl: true, role: true, createdAt: true },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, user });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { email, username, avatarUrl, currentPassword } = parsed.data;
  if (!email && !username && avatarUrl === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if ((email || username) && !currentPassword) {
      return NextResponse.json(
        { error: "Current password required to change email or username" },
        { status: 400 }
      );
    }

    if (currentPassword && existing?.passwordHash) {
      const ok = await verify(existing.passwordHash, currentPassword);
      if (!ok) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const updates: any = {};

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail && existingEmail.id !== session.user.id) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      updates.email = email;
    }

    if (username) {
      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername && existingUsername.id !== session.user.id) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      updates.username = username;
    }

    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl;
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updates,
      select: { id: true, email: true, username: true, avatarUrl: true, role: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, user: updatedUser });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
