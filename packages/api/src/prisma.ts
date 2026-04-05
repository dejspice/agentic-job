/**
 * Singleton PrismaClient for the API layer.
 *
 * Imported by server.ts and used as the default DB client when no
 * test-injected client is provided via ServerConfig.prismaClient.
 *
 * Route handlers never import this directly — they read from
 * req.app.locals.prismaClient so the client can be swapped in tests
 * without process-level side effects.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
