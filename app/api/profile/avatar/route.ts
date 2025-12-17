import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ file: z.any() });

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB upload limit

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File missing" }, { status: 400 });
  }

  if (file.size === 0 || file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    await fs.mkdir(avatarsDir, { recursive: true });
    const filename = `${session.user.id}.webp`;
    const filepath = path.join(avatarsDir, filename);

    const processed = await sharp(buffer)
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 75 })
      .toBuffer();

    await fs.writeFile(filepath, processed);

    const publicUrl = `/avatars/${filename}`;

    await prisma.user.update({ where: { id: session.user.id }, data: { avatarUrl: publicUrl } });

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
