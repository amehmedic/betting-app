-- CreateTable
CREATE TABLE "BlackjackGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "bet" BIGINT NOT NULL,
    "deck" JSONB NOT NULL,
    "playerHand" JSONB NOT NULL,
    "dealerHand" JSONB NOT NULL,
    "playerActions" JSONB NOT NULL,
    "dealerActions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'player',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BlackjackGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BlackjackGame_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BlackjackGame_userId_idx" ON "BlackjackGame"("userId");

-- CreateIndex
CREATE INDEX "BlackjackGame_walletId_idx" ON "BlackjackGame"("walletId");
