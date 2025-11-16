-- CreateTable
CREATE TABLE IF NOT EXISTS "notification_subscriptions" (
    "id" SERIAL NOT NULL,
    "fid" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "clientAppId" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "notification_subscriptions_fid_token_key" ON "notification_subscriptions"("fid", "token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_subscriptions_fid_idx" ON "notification_subscriptions"("fid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_subscriptions_enabled_idx" ON "notification_subscriptions"("enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_subscriptions_token_idx" ON "notification_subscriptions"("token");

