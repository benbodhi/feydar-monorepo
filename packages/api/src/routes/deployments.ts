import { Router } from 'express';
import { prisma } from '../db/client';
import { DeploymentsQuery } from '@feydar/shared/types';

const router = Router();

/**
 * GET /token
 * List tokens with pagination and filters
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      pageSize = '20',
      deployer,
      search,
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10)));
    const skip = (pageNum - 1) * pageSizeNum;

    // Build where clause
    const where: any = {};
    if (deployer) {
      where.deployer = deployer.toLowerCase();
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { symbol: { contains: search, mode: 'insensitive' } },
        { tokenAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get deployments and total count
    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      prisma.deployment.count({ where }),
    ]);

    res.json({
      deployments: deployments.map((d) => ({
        id: d.id,
        tokenAddress: d.tokenAddress,
        name: d.name,
        symbol: d.symbol,
        deployer: d.deployer,
        deployerBasename: d.deployerBasename,
        deployerENS: d.deployerENS,
        transactionHash: d.transactionHash,
        tokenImage: d.tokenImage,
        currentAdmin: d.currentAdmin,
        currentImageUrl: d.currentImageUrl,
        metadata: d.metadata,
        context: d.context,
        isVerified: d.isVerified,
        creatorBps: d.creatorBps,
        feyStakersBps: d.feyStakersBps,
        poolId: d.poolId,
        blockNumber: Number(d.blockNumber),
        createdAt: d.createdAt,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      hasMore: skip + deployments.length < total,
    });
  } catch (error: any) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

/**
 * GET /token/latest
 * Get latest N tokens
 */
router.get('/latest', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));

    const deployments = await prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      deployments: deployments.map((d) => ({
        id: d.id,
        tokenAddress: d.tokenAddress,
        name: d.name,
        symbol: d.symbol,
        deployer: d.deployer,
        deployerBasename: d.deployerBasename,
        deployerENS: d.deployerENS,
        transactionHash: d.transactionHash,
        tokenImage: d.tokenImage,
        currentAdmin: d.currentAdmin,
        currentImageUrl: d.currentImageUrl,
        metadata: d.metadata,
        context: d.context,
        isVerified: d.isVerified,
        creatorBps: d.creatorBps,
        feyStakersBps: d.feyStakersBps,
        poolId: d.poolId,
        blockNumber: Number(d.blockNumber),
        createdAt: d.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching latest deployments:', error);
    res.status(500).json({ error: 'Failed to fetch latest deployments' });
  }
});

/**
 * GET /token/:address/adjacent
 * Get adjacent tokens (older and newer) for a given token address
 * Must be defined before /:address route to avoid matching "adjacent" as an address
 */
router.get('/:address/adjacent', async (req, res) => {
  try {
    const { address } = req.params;

    // First, get the current token to find its createdAt timestamp
    const currentDeployment = await prisma.deployment.findUnique({
      where: { tokenAddress: address.toLowerCase() },
      select: { createdAt: true },
    });

    if (!currentDeployment) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const currentTime = currentDeployment.createdAt;

    // Find older token (deployed before, createdAt < currentTime)
    const olderDeployment = await prisma.deployment.findFirst({
      where: {
        createdAt: { lt: currentTime },
      },
      orderBy: { createdAt: 'desc' }, // Get the most recent one before current
      take: 1,
    });

    // Find newer token (deployed after, createdAt > currentTime)
    const newerDeployment = await prisma.deployment.findFirst({
      where: {
        createdAt: { gt: currentTime },
      },
      orderBy: { createdAt: 'asc' }, // Get the oldest one after current
      take: 1,
    });

    // Format response
    const formatDeployment = (d: any) => ({
      id: d.id,
      tokenAddress: d.tokenAddress,
      name: d.name,
      symbol: d.symbol,
      deployer: d.deployer,
      deployerBasename: d.deployerBasename,
      deployerENS: d.deployerENS,
      transactionHash: d.transactionHash,
      tokenImage: d.tokenImage,
      currentAdmin: d.currentAdmin,
      currentImageUrl: d.currentImageUrl,
      metadata: d.metadata,
      context: d.context,
      isVerified: d.isVerified,
      creatorBps: d.creatorBps,
      feyStakersBps: d.feyStakersBps,
      poolId: d.poolId,
      blockNumber: Number(d.blockNumber),
      createdAt: d.createdAt,
    });

    res.json({
      older: olderDeployment ? formatDeployment(olderDeployment) : null,
      newer: newerDeployment ? formatDeployment(newerDeployment) : null,
    });
  } catch (error: any) {
    console.error('Error fetching adjacent tokens:', error);
    res.status(500).json({ error: 'Failed to fetch adjacent tokens' });
  }
});

/**
 * GET /token/:address
 * Get single token by address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Use case-insensitive search to handle both lowercase and mixed-case addresses
    // This works for tokens stored with any case (legacy mixed-case or normalized lowercase)
    const result = await prisma.$queryRaw<Array<{
      id: number;
      tokenAddress: string;
      name: string;
      symbol: string;
      deployer: string;
      deployerBasename: string | null;
      deployerENS: string | null;
      transactionHash: string;
      tokenImage: string | null;
      currentAdmin: string | null;
      currentImageUrl: string | null;
      metadata: string | null;
      context: string | null;
      isVerified: boolean | null;
      creatorBps: number | null;
      feyStakersBps: number | null;
      poolId: string | null;
      blockNumber: bigint;
      createdAt: Date;
    }>>`
      SELECT * FROM deployments WHERE LOWER("tokenAddress") = LOWER(${address}) LIMIT 1
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const rawDeployment = result[0];
    
    // Return in the same format as before
    res.json({
      id: rawDeployment.id,
      tokenAddress: rawDeployment.tokenAddress,
      name: rawDeployment.name,
      symbol: rawDeployment.symbol,
      deployer: rawDeployment.deployer,
      deployerBasename: rawDeployment.deployerBasename,
      deployerENS: rawDeployment.deployerENS,
      transactionHash: rawDeployment.transactionHash,
      tokenImage: rawDeployment.tokenImage,
      currentAdmin: rawDeployment.currentAdmin,
      currentImageUrl: rawDeployment.currentImageUrl,
      metadata: rawDeployment.metadata,
      context: rawDeployment.context,
      isVerified: rawDeployment.isVerified,
      creatorBps: rawDeployment.creatorBps,
      feyStakersBps: rawDeployment.feyStakersBps,
      poolId: rawDeployment.poolId,
      blockNumber: Number(rawDeployment.blockNumber),
      createdAt: rawDeployment.createdAt,
    });
  } catch (error: any) {
    console.error('Error fetching deployment:', error);
    res.status(500).json({ error: 'Failed to fetch deployment' });
  }
});

export { router as deploymentsRouter };

