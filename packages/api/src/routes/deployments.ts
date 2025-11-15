import { Router } from 'express';
import { prisma } from '../db/client';
import { DeploymentsQuery } from '@feydar/shared/types';

const router = Router();

/**
 * GET /api/deployments
 * List deployments with pagination and filters
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
        totalSupply: d.totalSupply,
        deployer: d.deployer,
        deployerName: d.deployerName,
        deployerBasename: d.deployerBasename,
        deployerENS: d.deployerENS,
        transactionHash: d.transactionHash,
        tokenImage: d.tokenImage,
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
 * GET /api/deployments/latest
 * Get latest N deployments
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
        totalSupply: d.totalSupply,
        deployer: d.deployer,
        deployerName: d.deployerName,
        deployerBasename: d.deployerBasename,
        deployerENS: d.deployerENS,
        transactionHash: d.transactionHash,
        tokenImage: d.tokenImage,
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
 * GET /api/deployments/:address
 * Get single deployment by token address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const deployment = await prisma.deployment.findUnique({
      where: { tokenAddress: address.toLowerCase() },
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({
      id: deployment.id,
      tokenAddress: deployment.tokenAddress,
      name: deployment.name,
      symbol: deployment.symbol,
      totalSupply: deployment.totalSupply,
      deployer: deployment.deployer,
      deployerName: deployment.deployerName,
      deployerBasename: deployment.deployerBasename,
      deployerENS: deployment.deployerENS,
      transactionHash: deployment.transactionHash,
      tokenImage: deployment.tokenImage,
      creatorBps: deployment.creatorBps,
      feyStakersBps: deployment.feyStakersBps,
      poolId: deployment.poolId,
      pairedToken: deployment.pairedToken,
      blockNumber: Number(deployment.blockNumber),
      createdAt: deployment.createdAt,
    });
  } catch (error: any) {
    console.error('Error fetching deployment:', error);
    res.status(500).json({ error: 'Failed to fetch deployment' });
  }
});

export { router as deploymentsRouter };

