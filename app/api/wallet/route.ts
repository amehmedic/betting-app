import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

const serialize = (obj: any) =>
  JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let wallet = await prisma.wallet.findFirst({
    where: { userId: session.user.id, currency: "USD" },
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId: session.user.id, currency: "USD" },
    });
  }

  const ledger = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(serialize({ wallet, ledger }));
}
