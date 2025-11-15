// Load environment variables first
require('dotenv').config();

// Validate required environment variables
if (!process.env.ALCHEMY_API_KEY || !process.env.FEY_FACTORY_ADDRESS || !process.env.DATABASE_URL) {
    console.error('Missing required environment variables: ALCHEMY_API_KEY, FEY_FACTORY_ADDRESS, or DATABASE_URL');
    process.exit(1);
}

const ethers = require('ethers');
const { prisma } = require('../db/client');
const logger = require('../utils/logger');
const FEYContractHelper = require('../contracts/helpers/FEYContractHelper');
const { resolveAddressName } = require('../services/nameResolver');

// Configuration
const BATCH_SIZE = 1000; // Process events in batches
// Alchemy free tier allows max 10 blocks per eth_getLogs request
// Set to 9 to be safe and leave room for retries
const MAX_BLOCKS_PER_QUERY = process.env.MAX_BLOCKS_PER_QUERY 
    ? parseInt(process.env.MAX_BLOCKS_PER_QUERY) 
    : 9; // Default to 9 for free tier compatibility
const REQUEST_DELAY_MS = process.env.REQUEST_DELAY_MS 
    ? parseInt(process.env.REQUEST_DELAY_MS) 
    : 100; // Delay between requests in milliseconds
const MAX_RETRIES = 5; // Maximum retries for rate limit errors
const RETRY_DELAY_BASE_MS = 1000; // Base delay for exponential backoff (1 second)

class BackfillService {
    constructor() {
        this.provider = null;
        this.feyContracts = null;
        this.processedCount = 0;
        this.skippedCount = 0;
        this.updatedCount = 0;
        this.errorCount = 0;
        this.errors = []; // Store error details for summary
    }

    async initialize() {
        logger.section('🚀 Initializing Backfill Service');

        // Initialize provider (use HTTP for backfill, more reliable for historical queries)
        this.provider = new ethers.JsonRpcProvider(
            `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
        );
        logger.detail('✅ Provider Connected');

        // Initialize contract helpers
        this.feyContracts = new FEYContractHelper(
            this.provider,
            process.env.FEY_FACTORY_ADDRESS
        );
        logger.detail('✅ FEY Factory contract initialized');
        logger.sectionEnd();
    }

    async getLatestBlockNumber() {
        return await this.provider.getBlockNumber();
    }

    async getFactoryDeploymentBlock() {
        // Get the block where the factory was deployed
        // This is the "starting block" - the earliest block we should ever backfill to
        // When processing backwards, this is where we END (the earliest point in our range)
        const factoryCode = await this.provider.getCode(this.feyContracts.feyFactory.target);
        if (factoryCode === '0x' || factoryCode.length < 10) {
            throw new Error(`FEY Factory contract not found at ${this.feyContracts.feyFactory.target}`);
        }

        // Return the factory deployment block (the "starting block" - earliest range)
        // This is set via FEY_FACTORY_DEPLOYMENT_BLOCK env var or defaults to 38141030
        return process.env.FEY_FACTORY_DEPLOYMENT_BLOCK 
            ? parseInt(process.env.FEY_FACTORY_DEPLOYMENT_BLOCK)
            : 38141030;
    }
    
    async getLatestBlockInDatabase() {
        // Get the latest block in database (used when BACKFILL_FROM_LATEST=true)
        const latestDeployment = await prisma.deployment.findFirst({
            orderBy: { blockNumber: 'desc' },
            select: { blockNumber: true }
        });
        
        return latestDeployment && latestDeployment.blockNumber 
            ? Number(latestDeployment.blockNumber) 
            : null;
    }

    async getExistingTokenAddresses() {
        const deployments = await prisma.deployment.findMany({
            select: { tokenAddress: true },
        });
        return new Set(deployments.map(d => d.tokenAddress.toLowerCase()));
    }

    async processTokenCreatedEvent(log, existingAddresses) {
        try {
            // Parse the event log
            const tokenCreatedEvent = this.feyContracts.feyFactory.interface.parseLog({
                topics: log.topics,
                data: log.data
            });

            if (!tokenCreatedEvent || tokenCreatedEvent.name !== 'TokenCreated') {
                return null;
            }

            const tokenAddress = ethers.getAddress(tokenCreatedEvent.args[1]);

            // Extract event data
            const msgSender = tokenCreatedEvent.args[0];
            const tokenAdmin = tokenCreatedEvent.args[2];
            const tokenImage = tokenCreatedEvent.args[3];
            const tokenName = tokenCreatedEvent.args[4];
            const tokenSymbol = tokenCreatedEvent.args[5];
            const tokenMetadata = tokenCreatedEvent.args[6];
            const tokenContext = tokenCreatedEvent.args[7];
            const startingTick = tokenCreatedEvent.args[8];
            const poolHook = tokenCreatedEvent.args[9];
            const poolId = tokenCreatedEvent.args[10];
            const pairedToken = tokenCreatedEvent.args[11];
            const locker = tokenCreatedEvent.args[12];
            const mevModule = tokenCreatedEvent.args[13];
            const extensionsSupply = tokenCreatedEvent.args[14];
            const extensions = tokenCreatedEvent.args[15];

            // Extract fee split from TokenRewardAdded event
            // This is the actual fee split between Creator and FEY Stakers
            let creatorBps = null;
            let feyStakersBps = null;
            try {
                const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
                if (receipt) {
                    // Extract fee split from TokenRewardAdded event
                    const TOKEN_REWARD_CONTRACT = '0x282B4e72a79ebe79c1bd295c5ebd72940e50e836';
                    const TOKEN_REWARD_ADDED_TOPIC = '0xc9b03d1b68674b3ca5738b69c14e4dbcfcb7f474303edd540b1d7dfa785d27ff';
                    
                    for (const logEntry of receipt.logs) {
                        if (logEntry.address.toLowerCase() === TOKEN_REWARD_CONTRACT.toLowerCase() &&
                            logEntry.topics[0].toLowerCase() === TOKEN_REWARD_ADDED_TOPIC.toLowerCase()) {
                            
                            // Try to parse with interface variations
                            const interfaceVariations = [
                                'event TokenRewardAdded(address token, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address token0, address token1, uint24 fee, int24 tickSpacing) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address,address,uint24,int24,address) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address,address,uint24,int24) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)'
                            ];
                            
                            let parsedEvent = null;
                            for (const eventSig of interfaceVariations) {
                                try {
                                    const iface = new ethers.Interface([eventSig]);
                                    const parsed = iface.parseLog({
                                        topics: logEntry.topics,
                                        data: logEntry.data
                                    });
                                    
                                    if (parsed && parsed.name === 'TokenRewardAdded') {
                                        parsedEvent = parsed;
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            // If parsing failed, try manual decoding
                            if (!parsedEvent) {
                                try {
                                    const data = logEntry.data;
                                    const REWARD_BPS_OFFSET_POSITION = 288; // bytes (Uniswap v4 PoolKey)
                                    const HEX_CHARS_PER_BYTE = 2;
                                    const BYTES_PER_UINT256 = 32;
                                    const HEX_CHARS_PER_UINT256 = BYTES_PER_UINT256 * HEX_CHARS_PER_BYTE;
                                    const HEX_PREFIX_LENGTH = 2;
                                    
                                    if (data.length >= HEX_PREFIX_LENGTH + REWARD_BPS_OFFSET_POSITION * HEX_CHARS_PER_BYTE + HEX_CHARS_PER_UINT256) {
                                        const offsetStart = HEX_PREFIX_LENGTH + REWARD_BPS_OFFSET_POSITION * HEX_CHARS_PER_BYTE;
                                        const rewardBpsOffsetHex = data.slice(offsetStart, offsetStart + HEX_CHARS_PER_UINT256);
                                        const rewardBpsOffset = Number(BigInt('0x' + rewardBpsOffsetHex));
                                        
                                        if (rewardBpsOffset >= 0 && rewardBpsOffset < data.length) {
                                            const rewardBpsDataStart = HEX_PREFIX_LENGTH + rewardBpsOffset * HEX_CHARS_PER_BYTE;
                                            
                                            if (data.length >= rewardBpsDataStart + HEX_CHARS_PER_UINT256) {
                                                const arrayLengthHex = data.slice(rewardBpsDataStart, rewardBpsDataStart + HEX_CHARS_PER_UINT256);
                                                const arrayLength = Number(BigInt('0x' + arrayLengthHex));
                                                
                                                if (arrayLength >= 1 && arrayLength <= 100) {
                                                    const value1Start = rewardBpsDataStart + HEX_CHARS_PER_UINT256;
                                                    
                                                    if (data.length >= value1Start + HEX_CHARS_PER_UINT256) {
                                                        const value1Hex = data.slice(value1Start, value1Start + HEX_CHARS_PER_UINT256);
                                                        const value1 = Number(BigInt('0x' + value1Hex));
                                                        
                                                        const MAX_BPS = 10000;
                                                        if (value1 >= 0 && value1 <= MAX_BPS) {
                                                            if (arrayLength >= 2) {
                                                                // Two elements: [creatorBps, feyStakersBps]
                                                                const value2Start = value1Start + HEX_CHARS_PER_UINT256;
                                                                if (data.length >= value2Start + HEX_CHARS_PER_UINT256) {
                                                                    const value2Hex = data.slice(value2Start, value2Start + HEX_CHARS_PER_UINT256);
                                                                    const value2 = Number(BigInt('0x' + value2Hex));
                                                                    
                                                                    if (value2 >= 0 && value2 <= MAX_BPS) {
                                                                        creatorBps = value1; // First element is creatorBps
                                                                        feyStakersBps = value2; // Second element is feyStakersBps
                                                                    }
                                                                }
                                                            } else {
                                                                // Single element: [feyStakersBps] - creator gets the remainder
                                                                feyStakersBps = value1; // Single element is feyStakersBps
                                                                creatorBps = 10000 - value1; // Total is 10000 bps (100%)
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Manual decode failed, continue
                                }
                            } else if (parsedEvent.args.rewardBps && parsedEvent.args.rewardBps.length >= 1) {
                                // Extract from parsed event
                                // The rewardBps array can have 1 or 2 elements:
                                // - If 2 elements: [creatorBps, feyStakersBps]
                                // - If 1 element: [feyStakersBps] where creatorBps = 10000 - feyStakersBps
                                if (parsedEvent.args.rewardBps.length >= 2) {
                                    creatorBps = Number(parsedEvent.args.rewardBps[0]);
                                    feyStakersBps = Number(parsedEvent.args.rewardBps[1]);
                                } else {
                                    // Single element: [feyStakersBps] - creator gets the remainder
                                    feyStakersBps = Number(parsedEvent.args.rewardBps[0]);
                                    creatorBps = 10000 - feyStakersBps; // Total is 10000 bps (100%)
                                }
                            }
                            
                            break; // Found the event, no need to continue
                        }
                    }
                }
            } catch (e) {
                // Fee data not critical for backfill
            }

            // Get total supply from token contract
            let totalSupply = 0n;
            let decimals = 18;
            try {
                const tokenContract = this.feyContracts.getTokenContract(tokenAddress);
                totalSupply = await tokenContract.totalSupply();
                try {
                    decimals = await tokenContract.decimals();
                } catch (e) {
                    // Default to 18
                }
            } catch (e) {
                logger.warn(`Could not fetch total supply for ${tokenAddress}`);
            }

            // Always attempt to resolve deployer names (basename and ENS separately)
            // This ensures names are stored/updated even if they didn't have one before but now they do
            let deployerName = null;
            let deployerBasename = null;
            let deployerENS = null;
            try {
                const deployerInfo = await resolveAddressName(tokenAdmin, this.provider);
                // Store primary display name if different from address
                if (deployerInfo.name && deployerInfo.name.toLowerCase() !== tokenAdmin.toLowerCase()) {
                    deployerName = deployerInfo.name;
                }
                // Store basename if available
                if (deployerInfo.basename) {
                    deployerBasename = deployerInfo.basename;
                }
                // Store ENS if available
                if (deployerInfo.ens) {
                    deployerENS = deployerInfo.ens;
                }
                // Log summary of resolved names (only if we found something)
                if (deployerBasename || deployerENS) {
                    const parts = [];
                    if (deployerBasename) parts.push(`Basename: ${deployerBasename}`);
                    if (deployerENS) parts.push(`ENS: ${deployerENS}`);
                    logger.detail(`  ✓ Resolved deployer names: ${parts.join(', ')}`);
                }
            } catch (e) {
                // Name resolution not critical, continue without name
                if (process.env.NODE_ENV === 'development') {
                    logger.detail(`  Name resolution failed for ${tokenAdmin}: ${e.message}`);
                }
            }

            // Get block timestamp
            let createdAt = new Date();
            try {
                const block = await this.provider.getBlock(log.blockNumber);
                if (block && block.timestamp) {
                    createdAt = new Date(Number(block.timestamp) * 1000);
                }
            } catch (e) {
                // Use current time as fallback
            }

            // Format poolId as hex string (bytes32)
            let poolIdFormatted = null;
            if (poolId) {
                if (typeof poolId === 'string') {
                    poolIdFormatted = poolId.startsWith('0x') ? poolId : `0x${poolId}`;
                } else {
                    // If it's a BigInt or number, convert to hex
                    poolIdFormatted = `0x${poolId.toString(16).padStart(64, '0')}`;
                }
            }

            return {
                tokenAddress,
                // Truncate to fit database column limits (safety measure)
                name: tokenName ? tokenName.substring(0, 500) : '',
                symbol: tokenSymbol ? tokenSymbol.substring(0, 100) : '',
                totalSupply: totalSupply.toString(),
                deployer: ethers.getAddress(tokenAdmin),
                deployerName: deployerName ? deployerName.substring(0, 255) : null,
                deployerBasename: deployerBasename ? deployerBasename.substring(0, 255) : null,
                deployerENS: deployerENS ? deployerENS.substring(0, 255) : null,
                transactionHash: log.transactionHash,
                tokenImage: tokenImage || null,
                creatorBps,
                feyStakersBps,
                poolId: poolIdFormatted,
                pairedToken: pairedToken ? ethers.getAddress(pairedToken) : null,
                blockNumber: BigInt(log.blockNumber),
                createdAt,
            };
        } catch (error) {
            logger.error(`Error processing event: ${error.message}`);
            this.errorCount++;
            return null;
        }
    }

    async backfillRange(fromBlock, toBlock, existingAddresses, retryCount = 0) {
        const factoryAddress = this.feyContracts.feyFactory.target;
        const filter = {
            address: factoryAddress,
            topics: [
                ethers.id('TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])')
            ],
            fromBlock,
            toBlock,
        };

        try {
            // Add delay before making the request to avoid rate limiting
            if (retryCount === 0) {
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
            }
            
            const logs = await this.provider.getLogs(filter);
            logger.section(`📦 Processing blocks ${fromBlock} to ${toBlock} (${logs.length} events)`);

            // Process in batches to avoid overwhelming the system
            for (let i = 0; i < logs.length; i += BATCH_SIZE) {
                const batch = logs.slice(i, i + BATCH_SIZE);
                logger.detail(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(logs.length / BATCH_SIZE)}`);

                const deployments = [];
                for (const log of batch) {
                    const deployment = await this.processTokenCreatedEvent(log, existingAddresses);
                    if (deployment) {
                        deployments.push(deployment);
                        // Track in Set for duplicate detection within this run
                        existingAddresses.add(deployment.tokenAddress.toLowerCase());
                    }
                }

                // Process deployments - use upsert for everything (just like the bot does)
                if (deployments.length > 0) {
                    try {
                        const operations = [];
                        const newTokens = [];
                        const updatedTokens = [];
                        
                        // Check for existing records by transactionHash to avoid unique constraint violations
                        const batchTxHashes = deployments.map(d => d.transactionHash);
                        const existingByTxHash = new Map();
                        if (batchTxHashes.length > 0) {
                            const existing = await prisma.deployment.findMany({
                                where: {
                                    transactionHash: { in: batchTxHashes }
                                },
                                select: {
                                    tokenAddress: true,
                                    transactionHash: true,
                                }
                            });
                            for (const record of existing) {
                                existingByTxHash.set(record.transactionHash.toLowerCase(), record);
                            }
                        }
                        
                        for (const deployment of deployments) {
                            const isNew = !existingAddresses.has(deployment.tokenAddress.toLowerCase());
                            const existingByTx = existingByTxHash.get(deployment.transactionHash.toLowerCase());
                            
                            // Build full deployment data (same structure as bot uses)
                            const deploymentData = {
                                tokenAddress: deployment.tokenAddress,
                                name: deployment.name,
                                symbol: deployment.symbol,
                                totalSupply: deployment.totalSupply,
                                deployer: deployment.deployer,
                                deployerName: deployment.deployerName || null,
                                deployerBasename: deployment.deployerBasename || null,
                                deployerENS: deployment.deployerENS || null,
                                transactionHash: deployment.transactionHash,
                                tokenImage: deployment.tokenImage || null,
                                creatorBps: deployment.creatorBps !== null && deployment.creatorBps !== undefined ? deployment.creatorBps : null,
                                feyStakersBps: deployment.feyStakersBps !== null && deployment.feyStakersBps !== undefined ? deployment.feyStakersBps : null,
                                poolId: deployment.poolId || null,
                                pairedToken: deployment.pairedToken || null,
                                blockNumber: deployment.blockNumber,
                                createdAt: deployment.createdAt,
                            };
                            
                            // If record exists by transactionHash, update it
                            // (tokenAddress should match, but we update by transactionHash to avoid conflicts)
                            if (existingByTx) {
                                // Fetch existing record to compare
                                const existing = await prisma.deployment.findUnique({
                                    where: { transactionHash: deployment.transactionHash },
                                });
                                
                                if (existing) {
                                    // Compare fields to see what changed
                                    const changes = [];
                                    const fieldsToCheck = [
                                        { key: 'name', label: 'Name' },
                                        { key: 'symbol', label: 'Symbol' },
                                        { key: 'totalSupply', label: 'Total Supply' },
                                        { key: 'deployer', label: 'Deployer' },
                                        { key: 'deployerName', label: 'Deployer Name' },
                                        { key: 'deployerBasename', label: 'Deployer Basename' },
                                        { key: 'deployerENS', label: 'Deployer ENS' },
                                        { key: 'tokenImage', label: 'Token Image' },
                                        { key: 'creatorBps', label: 'Creator BPS' },
                                        { key: 'feyStakersBps', label: 'FEY Stakers BPS' },
                                        { key: 'poolId', label: 'Pool ID' },
                                        { key: 'pairedToken', label: 'Paired Token' },
                                    ];
                                    
                                    for (const field of fieldsToCheck) {
                                        const oldVal = existing[field.key];
                                        const newVal = deploymentData[field.key];
                                        
                                        // Handle null/undefined comparison
                                        const oldValStr = oldVal === null || oldVal === undefined ? 'null' : String(oldVal);
                                        const newValStr = newVal === null || newVal === undefined ? 'null' : String(newVal);
                                        
                                        if (oldValStr !== newValStr) {
                                            changes.push({
                                                field: field.label,
                                                old: oldVal === null || oldVal === undefined ? '(missing)' : oldValStr,
                                                new: newVal === null || newVal === undefined ? '(missing)' : newValStr,
                                            });
                                        }
                                    }
                                    
                                    if (changes.length > 0) {
                                        logger.detail(`  🔄 Updating ${deployment.tokenAddress}:`);
                                        changes.forEach(change => {
                                            logger.detail(`     ${change.field}: "${change.old}" → "${change.new}"`);
                                        });
                                        operations.push(
                                            prisma.deployment.update({
                                                where: { transactionHash: deployment.transactionHash },
                                                data: {
                                                    name: deploymentData.name,
                                                    symbol: deploymentData.symbol,
                                                    totalSupply: deploymentData.totalSupply,
                                                    deployer: deploymentData.deployer,
                                                    deployerName: deploymentData.deployerName,
                                                    deployerBasename: deploymentData.deployerBasename,
                                                    deployerENS: deploymentData.deployerENS,
                                                    tokenImage: deploymentData.tokenImage,
                                                    creatorBps: deploymentData.creatorBps,
                                                    feyStakersBps: deploymentData.feyStakersBps,
                                                    poolId: deploymentData.poolId,
                                                    pairedToken: deploymentData.pairedToken,
                                                },
                                            })
                                        );
                                        updatedTokens.push(deployment.tokenAddress);
                                    } else {
                                        logger.detail(`  ✓ ${deployment.tokenAddress}: Data already up to date (no changes needed)`);
                                        // Don't add to operations - no database update needed
                                    }
                                } else {
                                    // Shouldn't happen, but handle it
                                    logger.warn(`  ⚠️  Record with txHash ${deployment.transactionHash} not found for update`);
                                }
                            } else {
                                // No record exists by transactionHash - use upsert by tokenAddress
                                // Check if record exists by tokenAddress
                                const existingByAddress = await prisma.deployment.findUnique({
                                    where: { tokenAddress: deployment.tokenAddress },
                                });
                                
                                let changes = [];
                                if (existingByAddress) {
                                    // Compare fields to see what changed
                                    const fieldsToCheck = [
                                        { key: 'name', label: 'Name' },
                                        { key: 'symbol', label: 'Symbol' },
                                        { key: 'totalSupply', label: 'Total Supply' },
                                        { key: 'deployer', label: 'Deployer' },
                                        { key: 'deployerName', label: 'Deployer Name' },
                                        { key: 'deployerBasename', label: 'Deployer Basename' },
                                        { key: 'deployerENS', label: 'Deployer ENS' },
                                        { key: 'tokenImage', label: 'Token Image' },
                                        { key: 'creatorBps', label: 'Creator BPS' },
                                        { key: 'feyStakersBps', label: 'FEY Stakers BPS' },
                                        { key: 'poolId', label: 'Pool ID' },
                                        { key: 'pairedToken', label: 'Paired Token' },
                                    ];
                                    
                                    for (const field of fieldsToCheck) {
                                        const oldVal = existingByAddress[field.key];
                                        const newVal = deploymentData[field.key];
                                        
                                        const oldValStr = oldVal === null || oldVal === undefined ? 'null' : String(oldVal);
                                        const newValStr = newVal === null || newVal === undefined ? 'null' : String(newVal);
                                        
                                        if (oldValStr !== newValStr) {
                                            changes.push({
                                                field: field.label,
                                                old: oldVal === null || oldVal === undefined ? '(missing)' : oldValStr,
                                                new: newVal === null || newVal === undefined ? '(missing)' : newValStr,
                                            });
                                        }
                                    }
                                    
                                    if (changes.length > 0) {
                                        logger.detail(`  🔄 Updating ${deployment.tokenAddress}:`);
                                        changes.forEach(change => {
                                            logger.detail(`     ${change.field}: "${change.old}" → "${change.new}"`);
                                        });
                                        operations.push(
                                            prisma.deployment.update({
                                                where: { tokenAddress: deployment.tokenAddress },
                                                data: {
                                                    name: deploymentData.name,
                                                    symbol: deploymentData.symbol,
                                                    totalSupply: deploymentData.totalSupply,
                                                    deployer: deploymentData.deployer,
                                                    deployerName: deploymentData.deployerName,
                                                    deployerBasename: deploymentData.deployerBasename,
                                                    deployerENS: deploymentData.deployerENS,
                                                    tokenImage: deploymentData.tokenImage,
                                                    creatorBps: deploymentData.creatorBps,
                                                    feyStakersBps: deploymentData.feyStakersBps,
                                                    poolId: deploymentData.poolId,
                                                    pairedToken: deploymentData.pairedToken,
                                                },
                                            })
                                        );
                                        updatedTokens.push(deployment.tokenAddress);
                                    } else {
                                        logger.detail(`  ✓ ${deployment.tokenAddress}: Data already up to date (no changes needed)`);
                                        // Don't add to operations - no database update needed
                                    }
                                } else {
                                    logger.detail(`  ➕ Adding new token: ${deployment.tokenAddress} (${deployment.name || 'N/A'})`);
                                    operations.push(
                                        prisma.deployment.create({
                                            data: deploymentData,
                                        })
                                    );
                                    newTokens.push(deployment.tokenAddress);
                                    existingAddresses.add(deployment.tokenAddress.toLowerCase());
                                }
                            }
                        }
                        
                        // Execute all operations in a transaction
                        if (operations.length > 0) {
                            await prisma.$transaction(operations);
                            
                            // Log results summary
                            if (newTokens.length > 0) {
                                logger.detail(`  ✅ Added ${newTokens.length} new token(s)`);
                            }
                            if (updatedTokens.length > 0) {
                                logger.detail(`  🔄 Updated ${updatedTokens.length} existing token(s)`);
                            }
                            
                            this.processedCount += newTokens.length;
                            this.updatedCount += updatedTokens.length;
                        } else {
                            logger.detail(`  ✓ All tokens in this batch were already up to date (no database operations needed)`);
                        }
                    } catch (dbError) {
                        logger.error(`Database error: ${dbError.message}`);
                        this.errorCount += deployments.length;
                    }
                }

                // Delay between batches to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
            }

            logger.sectionEnd();
        } catch (error) {
            const errorMessage = error.message || '';
            const errorString = JSON.stringify(error);
            
            // Check if it's a rate limit error (429)
            const isRateLimitError = errorMessage.includes('429') || 
                                    errorString.includes('429') ||
                                    errorMessage.includes('exceeded its compute units') ||
                                    errorMessage.includes('throughput');
            
            // Check if it's a block range limit error
            const isBlockRangeError = errorMessage.includes('10 block range') || 
                                     errorMessage.includes('block range should work');
            
            // Handle rate limit errors with exponential backoff retry
            if (isRateLimitError && retryCount < MAX_RETRIES) {
                const retryDelay = RETRY_DELAY_BASE_MS * Math.pow(2, retryCount); // Exponential backoff
                logger.warn(`Rate limit error (429) for blocks ${fromBlock}-${toBlock}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await this.backfillRange(fromBlock, toBlock, existingAddresses, retryCount + 1);
            }
            
            // Handle block range errors by splitting
            if (isBlockRangeError && (toBlock - fromBlock) > 10) {
                // Split the range in half and retry
                logger.warn(`Block range too large (${toBlock - fromBlock + 1} blocks), splitting...`);
                const midBlock = Math.floor((fromBlock + toBlock) / 2);
                await this.backfillRange(fromBlock, midBlock, existingAddresses, 0);
                await this.backfillRange(midBlock + 1, toBlock, existingAddresses, 0);
            } else {
                const errorMsg = `Error querying blocks ${fromBlock}-${toBlock}: ${error.message}`;
                logger.error(errorMsg);
                this.errors.push(errorMsg);
                this.errorCount++;
            }
        }
    }

    async run() {
        try {
            await this.initialize();

            // Get existing deployments
            logger.section('📊 Loading existing deployments');
            const existingAddresses = await this.getExistingTokenAddresses();
            logger.detail(`Found ${existingAddresses.size} existing deployments in database`);
            logger.sectionEnd();

            // Get block range
            const latestBlock = await this.getLatestBlockNumber();
            const startingBlock = await this.getFactoryDeploymentBlock(); // The "starting block" - earliest range we should ever backfill to
            const latestBlockInDb = await this.getLatestBlockInDatabase();
            
            // Determine where to START processing (we always process backwards)
            // BACKFILL_FROM_LATEST=true: Start from latest block in DB + 1 (skip already processed blocks)
            // Otherwise: Start from chain head (process everything from chain head backwards)
            // We ALWAYS process backwards to the "starting block" (factory deployment block) to get ALL tokens ever deployed
            const processFromBlock = (process.env.BACKFILL_FROM_LATEST === 'true' && latestBlockInDb)
                ? latestBlockInDb + 1  // Start from block AFTER latest in DB (skip already processed)
                : latestBlock;          // Start from chain head (process everything)
            
            // Always process backwards to the "starting block" (factory deployment block - earliest range)
            const processToBlock = startingBlock;
            
            logger.section('🔍 Starting Backfill');
            logger.detail('📝 Behavior:');
            logger.detail('   • Adds new tokens (not in database)');
            logger.detail('   • Updates existing tokens with latest data (deployer names, fee splits, etc.)');
            logger.detail('   • Ensures database has complete and up-to-date information for all tokens');
            logger.detail(`Latest block on chain: ${latestBlock}`);
            logger.detail(`Latest block in DB: ${latestBlockInDb || 'none'}`);
            logger.detail(`Starting block (earliest range): ${startingBlock}`);
            logger.detail(`Processing backwards from block ${processFromBlock} to ${processToBlock}`);
            
            const totalBlocks = processFromBlock - processToBlock + 1; // +1 to include both endpoints
            logger.detail(`Total blocks to process: ${totalBlocks}`);
            
            if (latestBlockInDb && latestBlockInDb < latestBlock) {
                logger.detail(`⚠️  Gap detected: DB is ${latestBlock - latestBlockInDb} blocks behind chain`);
            }
            logger.sectionEnd();

            // Process in chunks backwards from processFromBlock to startingBlock (factory deployment block)
            // This ensures we catch the most recent tokens first (useful for recovery scenarios)
            let currentBlock = processFromBlock;
            let processedBlocks = 0;
            
            logger.detail(`Processing backwards from block ${processFromBlock} to ${processToBlock} (${totalBlocks} blocks total)`);
            
            while (currentBlock >= processToBlock) {
                const fromBlock = Math.max(currentBlock - MAX_BLOCKS_PER_QUERY + 1, processToBlock);
                const toBlock = currentBlock;
                await this.backfillRange(fromBlock, toBlock, existingAddresses);
                currentBlock = fromBlock - 1;

                // Progress update
                processedBlocks += (toBlock - fromBlock + 1);
                const progress = totalBlocks > 0 ? ((processedBlocks / totalBlocks) * 100).toFixed(2) : '100.00';
                logger.detail(`Progress: ${progress}% (processed ${processedBlocks}/${totalBlocks} blocks, current: ${fromBlock}-${toBlock})`);
            }

            // Summary
            logger.section('✅ Backfill Complete');
            logger.detail(`Added: ${this.processedCount} new token(s)`);
            if (this.updatedCount > 0) {
                logger.detail(`Updated: ${this.updatedCount} existing token(s) with latest data`);
            }
            if (this.skippedCount > 0) {
                logger.detail(`Skipped: ${this.skippedCount} event(s) (parsing errors or invalid events)`);
            }
            logger.detail(`Errors: ${this.errorCount}`);
            if (this.errors.length > 0) {
                logger.detail('---');
                logger.detail('Error Details:');
                this.errors.forEach((err, idx) => {
                    logger.detail(`  ${idx + 1}. ${err}`);
                });
            }
            logger.sectionEnd();

        } catch (error) {
            logger.error(`Backfill failed: ${error.message}`);
            console.error(error);
            process.exit(1);
        } finally {
            await prisma.$disconnect();
            process.exit(0);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const backfill = new BackfillService();
    backfill.run();
}

module.exports = { BackfillService };

