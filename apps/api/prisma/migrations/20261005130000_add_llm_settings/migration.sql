-- CreateTable
CREATE TABLE "LlmSettings" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "provider" TEXT NOT NULL DEFAULT 'ANTHROPIC',
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEncrypted" TEXT,
    "temperature" DOUBLE PRECISION,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmSettings_pkey" PRIMARY KEY ("id")
);
