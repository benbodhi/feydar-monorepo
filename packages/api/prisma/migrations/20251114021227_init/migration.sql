-- CreateTable
CREATE TABLE "deployments" (
    "id" SERIAL NOT NULL,
    "tokenAddress" VARCHAR(42) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "totalSupply" TEXT NOT NULL,
    "deployer" VARCHAR(42) NOT NULL,
    "deployerName" VARCHAR(255),
    "transactionHash" VARCHAR(66) NOT NULL,
    "tokenImage" TEXT,
    "feyFee" INTEGER,
    "pairedFee" INTEGER,
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployments_tokenAddress_key" ON "deployments"("tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_transactionHash_key" ON "deployments"("transactionHash");

-- CreateIndex
CREATE INDEX "deployments_createdAt_idx" ON "deployments"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "deployments_tokenAddress_idx" ON "deployments"("tokenAddress");

-- CreateIndex
CREATE INDEX "deployments_deployer_idx" ON "deployments"("deployer");
