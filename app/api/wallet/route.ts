import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

const serialize = (obj: any) =>
  JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

export async function GET() {
  const session = await getServerSession(authConfig); // ← v4 style
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: session.user.id, currency: "PLAY" },
  });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const ledger = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(serialize({ wallet, ledger }));
}