// Load environment variables first
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const NO_LIMIT_MODE = args.includes('--no-limit') || args.includes('--nolimit');

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

// Rate limiting configuration
// When --no-limit flag is used, bypass rate limits for faster execution
let MAX_BLOCKS_PER_QUERY, REQUEST_DELAY_MS, RETRY_DELAY_BASE_MS;

if (NO_LIMIT_MODE) {
    // No-limit mode: run as fast as possible (use with caution - may hit rate limits)
    MAX_BLOCKS_PER_QUERY = process.env.MAX_BLOCKS_PER_QUERY 
        ? parseInt(process.env.MAX_BLOCKS_PER_QUERY) 
        : 1000; // Much larger block range per query
    REQUEST_DELAY_MS = process.env.REQUEST_DELAY_MS 
        ? parseInt(process.env.REQUEST_DELAY_MS) 
        : 0; // No delay between requests
    RETRY_DELAY_BASE_MS = 100; // Minimal retry delay
    console.warn('⚠️  NO-LIMIT MODE ENABLED: Running without rate limits. This may consume Compute Units quickly!');
} else {
    // Default mode: respect rate limits
    // Alchemy free tier allows max 10 blocks per eth_getLogs request
    // Set to 9 to be safe and leave room for retries
    MAX_BLOCKS_PER_QUERY = process.env.MAX_BLOCKS_PER_QUERY 
        ? parseInt(process.env.MAX_BLOCKS_PER_QUERY) 
        : 9; // Default to 9 for free tier compatibility
    REQUEST_DELAY_MS = process.env.REQUEST_DELAY_MS 
        ? parseInt(process.env.REQUEST_DELAY_MS) 
        : 100; // Delay between requests in milliseconds
    RETRY_DELAY_BASE_MS = 1000; // Base delay for exponential backoff (1 second)
}

const MAX_RETRIES = 5; // Maximum retries for rate limit errors

/**
 * Data Integrity Service
 * 
 * Purpose: Ensures database has complete and accurate historical data for all FEY token deployments.
 * 
 * Default Behavior:
 * - Starts from current chain head (latest block)
 * - Processes backwards to factory deployment block
 * - Adds missing tokens
 * - Updates existing tokens with accurate data (timestamps, names, fee splits, etc.)
 * - Safe to run multiple times (idempotent)
 * 
 * Usage:
 *   node dataIntegrity.js              # Run with rate limits (default, safe)
 *   node dataIntegrity.js --no-limit   # Run without rate limits (faster, uses more Compute Units)
 * 
 * This script is designed to be run:
 * - Manually when needed
 * - As a post-deploy script
 * - To fix data inconsistencies
 */
class DataIntegrityService {
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
        logger.section('🚀 Initializing Data Integrity Service');

        // Initialize provider (use HTTP for historical queries, more reliable)
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
        // This is the "starting block" - the earliest block we should ever process to
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
        // Get the latest block in database (for informational purposes only)
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

    /**
     * Process a TokenCreated event and extract all relevant data
     */
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
            const locker = tokenCreatedEvent.args[12];
            const mevModule = tokenCreatedEvent.args[13];
            const extensionsSupply = tokenCreatedEvent.args[14];
            const extensions = tokenCreatedEvent.args[15];

            // Extract fee split from TokenRewardAdded event
            // This is the actual fee split between Creator and FEY Stakers
            // We MUST get this data - retry until we succeed
            let creatorBps = null;
            let feyStakersBps = null;
            const MAX_RECEIPT_RETRIES = 50; // Very high limit - we must get this data
            let receiptRetryCount = 0;
            let receiptFetched = false;
            let receipt = null;
            
            while (!receiptFetched) {
                try {
                    receipt = await this.provider.getTransactionReceipt(log.transactionHash);
                    receiptFetched = true;
                } catch (e) {
                    receiptRetryCount++;
                    const isRateLimit = e.message && (
                        e.message.includes('429') || 
                        e.message.includes('rate limit') || 
                        e.message.includes('compute units') ||
                        e.message.includes('throughput')
                    );
                    
                    if (receiptRetryCount < MAX_RECEIPT_RETRIES) {
                        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, Math.min(receiptRetryCount - 1, 5)); // Cap exponential backoff
                        logger.detail(`  Rate limit fetching receipt for ${log.transactionHash}, retrying in ${delay}ms (attempt ${receiptRetryCount}/${MAX_RECEIPT_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        logger.error(`  Could not fetch transaction receipt for ${log.transactionHash} after ${MAX_RECEIPT_RETRIES} attempts: ${e.message}`);
                        logger.error(`  This is critical data - will retry from beginning of block range`);
                        throw new Error(`Failed to fetch transaction receipt after ${MAX_RECEIPT_RETRIES} attempts - cannot proceed without this data`);
                    }
                }
            }
            
            if (receipt) {
                try {
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
                } catch (e) {
                    logger.warn(`  Error extracting fee split from receipt for ${log.transactionHash}: ${e.message}`);
                    // Fee splits might not exist for all tokens, so we continue with null values
                    // This is acceptable - not all tokens have fee splits set
                }
            } else {
                throw new Error(`Failed to fetch transaction receipt for ${log.transactionHash} - this should not happen`);
            }

            // Note: All FEY tokens have 100b supply, so we don't need to fetch/store it

            // Resolve deployer names with retry logic for data integrity
            // We need accurate data, so retry on failure
            let deployerBasename = null;
            let deployerENS = null;
            const MAX_NAME_RESOLUTION_RETRIES = 3;
            let nameResolutionAttempts = 0;
            let nameResolutionSuccess = false;
            
            while (!nameResolutionSuccess && nameResolutionAttempts < MAX_NAME_RESOLUTION_RETRIES) {
                try {
                    nameResolutionAttempts++;
                    const deployerInfo = await resolveAddressName(tokenAdmin, this.provider);
                    
                    // Store basename if available
                    if (deployerInfo.basename) {
                        deployerBasename = deployerInfo.basename;
                    }
                    // Store ENS if available
                    if (deployerInfo.ens) {
                        deployerENS = deployerInfo.ens;
                    }
                    
                    nameResolutionSuccess = true;
                    
                    // Log summary of resolved names (only if we found something)
                    if (deployerBasename || deployerENS) {
                        const parts = [];
                        if (deployerBasename) parts.push(`Basename: ${deployerBasename}`);
                        if (deployerENS) parts.push(`ENS: ${deployerENS}`);
                        logger.detail(`  ✓ Resolved deployer names: ${parts.join(', ')}`);
                    }
                } catch (e) {
                    if (nameResolutionAttempts < MAX_NAME_RESOLUTION_RETRIES) {
                        // Wait before retry (exponential backoff)
                        const retryDelay = 1000 * Math.pow(2, nameResolutionAttempts - 1);
                        logger.warn(`  Name resolution failed for ${tokenAdmin} (attempt ${nameResolutionAttempts}/${MAX_NAME_RESOLUTION_RETRIES}): ${e.message}. Retrying in ${retryDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    } else {
                        // Final attempt failed - log but continue (names will be null, which is accurate)
                        logger.warn(`  Name resolution failed for ${tokenAdmin} after ${MAX_NAME_RESOLUTION_RETRIES} attempts: ${e.message}`);
                    }
                }
            }

            // Get block timestamp - CRITICAL for accurate deployment times
            // We MUST have accurate block timestamp - retry indefinitely until we get it
            let createdAt = null;
            const MAX_BLOCK_RETRIES = 50; // Very high limit - we must get this data
            let blockRetryCount = 0;
            let blockFetched = false;
            
            while (!blockFetched) {
                try {
                    const block = await this.provider.getBlock(log.blockNumber);
                    if (block && block.timestamp) {
                        createdAt = new Date(Number(block.timestamp) * 1000);
                        blockFetched = true;
                    } else {
                        blockRetryCount++;
                        logger.warn(`Block ${log.blockNumber} has no timestamp, retrying... (attempt ${blockRetryCount})`);
                        if (blockRetryCount >= MAX_BLOCK_RETRIES) {
                            logger.error(`Block ${log.blockNumber} has no timestamp after ${MAX_BLOCK_RETRIES} attempts - this should not happen`);
                            throw new Error(`Block ${log.blockNumber} has no timestamp`);
                        }
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE_MS * Math.pow(2, Math.min(blockRetryCount - 1, 5))));
                    }
                } catch (e) {
                    blockRetryCount++;
                    const isRateLimit = e.message && (
                        e.message.includes('429') || 
                        e.message.includes('rate limit') || 
                        e.message.includes('compute units') ||
                        e.message.includes('throughput')
                    );
                    
                    if (blockRetryCount < MAX_BLOCK_RETRIES) {
                        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, Math.min(blockRetryCount - 1, 5)); // Cap exponential backoff
                        logger.detail(`  Rate limit fetching block ${log.blockNumber}, retrying in ${delay}ms (attempt ${blockRetryCount}/${MAX_BLOCK_RETRIES})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        logger.error(`Could not fetch block timestamp for block ${log.blockNumber} after ${MAX_BLOCK_RETRIES} attempts: ${e.message}`);
                        logger.error(`  This is critical data - will retry from beginning of block range`);
                        throw new Error(`Failed to fetch block timestamp after ${MAX_BLOCK_RETRIES} attempts - cannot proceed without this data`);
                    }
                }
            }
            
            // Final validation - if we don't have a timestamp, we cannot proceed
            if (!createdAt) {
                throw new Error(`Failed to get block timestamp for ${log.transactionHash} (block ${log.blockNumber}) - this should not happen`);
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

            // Fetch changeable contract data
            let contractData = {
                currentAdmin: null,
                currentImageUrl: null,
                metadata: null,
                context: null,
                isVerified: null,
            };
            
            try {
                contractData = await this.feyContracts.fetchTokenContractData(tokenAddress);
                
                if (contractData.currentImageUrl) {
                    logger.detail(`  ✓ Retrieved contract data: imageUrl, admin=${contractData.currentAdmin ? 'set' : 'null'}, verified=${contractData.isVerified}`);
                } else if (contractData.currentAdmin || contractData.metadata || contractData.context !== null || contractData.isVerified !== null) {
                    logger.detail(`  ✓ Retrieved contract data: admin=${contractData.currentAdmin ? 'set' : 'null'}, verified=${contractData.isVerified}`);
                }
            } catch (error) {
                logger.warn(`  ⚠️  Could not query token contract for changeable data: ${error.message}`);
            }
            
            const finalImageUrl = contractData.currentImageUrl || tokenImage || null;

            return {
                tokenAddress,
                // Truncate to fit database column limits (safety measure)
                name: tokenName ? tokenName.substring(0, 500) : '',
                symbol: tokenSymbol ? tokenSymbol.substring(0, 100) : '',
                deployer: ethers.getAddress(tokenAdmin),
                deployerBasename: deployerBasename ? deployerBasename.substring(0, 255) : null,
                deployerENS: deployerENS ? deployerENS.substring(0, 255) : null,
                transactionHash: log.transactionHash,
                tokenImage: finalImageUrl,
                currentAdmin: contractData.currentAdmin,
                currentImageUrl: contractData.currentImageUrl,
                metadata: contractData.metadata,
                context: contractData.context,
                isVerified: contractData.isVerified,
                creatorBps,
                feyStakersBps,
                poolId: poolIdFormatted,
                blockNumber: BigInt(log.blockNumber),
                createdAt,
            };
        } catch (error) {
            logger.error(`Error processing event: ${error.message}`);
            this.errorCount++;
            return null;
        }
    }

    /**
     * Compares two field values, handling dates, booleans, and nulls
     */
    compareFieldValue(oldVal, newVal, fieldKey) {
        // Special handling for Date objects
        if (fieldKey === 'createdAt') {
            // Handle Prisma Date objects and strings - normalize to Date objects
            let oldDate = null;
            let newDate = null;
            
            if (oldVal) {
                if (oldVal instanceof Date) {
                    oldDate = oldVal;
                } else if (typeof oldVal === 'string') {
                    oldDate = new Date(oldVal);
                } else if (oldVal.getTime) {
                    // Handle Prisma DateTime objects
                    oldDate = new Date(oldVal.getTime());
                }
            }
            
            if (newVal) {
                if (newVal instanceof Date) {
                    newDate = newVal;
                } else if (typeof newVal === 'string') {
                    newDate = new Date(newVal);
                } else if (newVal.getTime) {
                    newDate = new Date(newVal.getTime());
                }
            }
            
            if (oldDate && newDate) {
                // Compare timestamps (ignore milliseconds differences)
                const oldTime = Math.floor(oldDate.getTime() / 1000);
                const newTime = Math.floor(newDate.getTime() / 1000);
                const isDifferent = oldTime !== newTime;
                
                // Debug logging for timestamp differences
                if (isDifferent && process.env.DEBUG_TIMESTAMPS === 'true') {
                    logger.detail(`  [DEBUG] Timestamp comparison: old=${oldDate.toISOString()} (${oldTime}), new=${newDate.toISOString()} (${newTime}), diff=${Math.abs(newTime - oldTime)}s`);
                }
                
                return isDifferent;
            }
            
            // If one is null and the other isn't, they're different
            if ((oldDate && !newDate) || (!oldDate && newDate)) {
                return true;
            }
            
            return false;
        }
        
        // Special handling for boolean fields (isVerified)
        if (fieldKey === 'isVerified') {
            const oldBool = oldVal === null || oldVal === undefined ? null : Boolean(oldVal);
            const newBool = newVal === null || newVal === undefined ? null : Boolean(newVal);
            return oldBool !== newBool;
        }
        
        // Handle null/undefined comparison for other fields
        const oldValStr = oldVal === null || oldVal === undefined ? 'null' : String(oldVal);
        const newValStr = newVal === null || newVal === undefined ? 'null' : String(newVal);
        
        return oldValStr !== newValStr;
    }

    /**
     * Format field value for logging
     */
    formatFieldValue(value, fieldKey) {
        if (fieldKey === 'createdAt') {
            if (value instanceof Date) {
                return value.toISOString();
            }
            if (value) {
                return new Date(value).toISOString();
            }
            return '(missing)';
        }
        
        if (value === null || value === undefined) {
            return '(missing)';
        }
        return String(value);
    }


    /**
     * Process a range of blocks and ensure data integrity
     */
    async processBlockRange(fromBlock, toBlock, existingAddresses, retryCount = 0) {
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

                // Process deployments - ensure data integrity
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
                            const existingByTx = existingByTxHash.get(deployment.transactionHash.toLowerCase());
                            
                            // Normalize addresses to lowercase for consistent database storage
                            const normalizedTokenAddress = deployment.tokenAddress.toLowerCase();
                            const normalizedDeployer = deployment.deployer.toLowerCase();
                            
                            // Build full deployment data
                            const deploymentData = {
                                tokenAddress: normalizedTokenAddress,
                                name: deployment.name,
                                symbol: deployment.symbol,
                                deployer: normalizedDeployer,
                                deployerBasename: deployment.deployerBasename || null,
                                deployerENS: deployment.deployerENS || null,
                                transactionHash: deployment.transactionHash,
                                tokenImage: deployment.tokenImage || null,
                                currentAdmin: deployment.currentAdmin || null,
                                currentImageUrl: deployment.currentImageUrl || null,
                                metadata: deployment.metadata || null,
                                context: deployment.context || null,
                                isVerified: deployment.isVerified !== null && deployment.isVerified !== undefined ? deployment.isVerified : null,
                                creatorBps: deployment.creatorBps !== null && deployment.creatorBps !== undefined ? deployment.creatorBps : null,
                                feyStakersBps: deployment.feyStakersBps !== null && deployment.feyStakersBps !== undefined ? deployment.feyStakersBps : null,
                                poolId: deployment.poolId || null,
                                blockNumber: deployment.blockNumber,
                                createdAt: deployment.createdAt,
                            };
                            
                            // If record exists by transactionHash, update it
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
                                        { key: 'deployer', label: 'Deployer' },
                                        { key: 'deployerBasename', label: 'Deployer Basename' },
                                        { key: 'deployerENS', label: 'Deployer ENS' },
                                        { key: 'tokenImage', label: 'Token Image' },
                                        { key: 'currentAdmin', label: 'Current Admin' },
                                        { key: 'currentImageUrl', label: 'Current Image URL' },
                                        { key: 'metadata', label: 'Metadata' },
                                        { key: 'context', label: 'Context' },
                                        { key: 'isVerified', label: 'Is Verified' },
                                        { key: 'creatorBps', label: 'Creator BPS' },
                                        { key: 'feyStakersBps', label: 'FEY Stakers BPS' },
                                        { key: 'poolId', label: 'Pool ID' },
                                        { key: 'createdAt', label: 'Created At' },
                                    ];
                                    
                                    for (const field of fieldsToCheck) {
                                        const oldVal = existing[field.key];
                                        const newVal = deploymentData[field.key];
                                        
                                        if (this.compareFieldValue(oldVal, newVal, field.key)) {
                                            changes.push({
                                                field: field.label,
                                                old: this.formatFieldValue(oldVal, field.key),
                                                new: this.formatFieldValue(newVal, field.key),
                                            });
                                        }
                                    }
                                    
                                    if (changes.length > 0) {
                                        logger.detail(`  🔄 Updating ${normalizedTokenAddress}:`);
                                        changes.forEach(change => {
                                            logger.detail(`     ${change.field}: "${change.old}" → "${change.new}"`);
                                        });
                                        
                                        // Build update data with accurate values
                                        // Only update fields where we have verified data
                                        const updateData = {
                                            name: deploymentData.name,
                                            symbol: deploymentData.symbol,
                                            deployer: deploymentData.deployer,
                                            deployerBasename: deploymentData.deployerBasename,
                                            deployerENS: deploymentData.deployerENS,
                                            tokenImage: deploymentData.tokenImage,
                                            currentAdmin: deploymentData.currentAdmin,
                                            currentImageUrl: deploymentData.currentImageUrl,
                                            metadata: deploymentData.metadata,
                                            context: deploymentData.context,
                                            isVerified: deploymentData.isVerified,
                                            // Only update fee splits if we actually found them - if null, skip updating those fields
                                            ...(deploymentData.creatorBps !== null && deploymentData.creatorBps !== undefined 
                                                ? { creatorBps: deploymentData.creatorBps } 
                                                : {}),
                                            ...(deploymentData.feyStakersBps !== null && deploymentData.feyStakersBps !== undefined 
                                                ? { feyStakersBps: deploymentData.feyStakersBps } 
                                                : {}),
                                            poolId: deploymentData.poolId,
                                            createdAt: deploymentData.createdAt,
                                        };
                                        
                                        operations.push(
                                            prisma.deployment.update({
                                                where: { transactionHash: deployment.transactionHash },
                                                data: updateData,
                                            })
                                        );
                                        updatedTokens.push(normalizedTokenAddress);
                                    } else {
                                        logger.detail(`  ✓ ${normalizedTokenAddress}: Data already accurate (no changes needed)`);
                                    }
                                } else {
                                    // Shouldn't happen, but handle it
                                    logger.warn(`  ⚠️  Record with txHash ${deployment.transactionHash} not found for update`);
                                }
                            } else {
                                // No record exists by transactionHash - check by tokenAddress
                                const existingByAddress = await prisma.deployment.findUnique({
                                    where: { tokenAddress: normalizedTokenAddress },
                                });
                                
                                if (existingByAddress) {
                                    // Compare fields to see what changed
                                    const changes = [];
                                    const fieldsToCheck = [
                                        { key: 'name', label: 'Name' },
                                        { key: 'symbol', label: 'Symbol' },
                                        { key: 'deployer', label: 'Deployer' },
                                        { key: 'deployerBasename', label: 'Deployer Basename' },
                                        { key: 'deployerENS', label: 'Deployer ENS' },
                                        { key: 'tokenImage', label: 'Token Image' },
                                        { key: 'currentAdmin', label: 'Current Admin' },
                                        { key: 'currentImageUrl', label: 'Current Image URL' },
                                        { key: 'metadata', label: 'Metadata' },
                                        { key: 'context', label: 'Context' },
                                        { key: 'isVerified', label: 'Is Verified' },
                                        { key: 'creatorBps', label: 'Creator BPS' },
                                        { key: 'feyStakersBps', label: 'FEY Stakers BPS' },
                                        { key: 'poolId', label: 'Pool ID' },
                                        { key: 'createdAt', label: 'Created At' },
                                    ];
                                    
                                    for (const field of fieldsToCheck) {
                                        const oldVal = existingByAddress[field.key];
                                        const newVal = deploymentData[field.key];
                                        
                                        if (this.compareFieldValue(oldVal, newVal, field.key)) {
                                            changes.push({
                                                field: field.label,
                                                old: this.formatFieldValue(oldVal, field.key),
                                                new: this.formatFieldValue(newVal, field.key),
                                            });
                                        }
                                    }
                                    
                                    if (changes.length > 0) {
                                        logger.detail(`  🔄 Updating ${normalizedTokenAddress}:`);
                                        changes.forEach(change => {
                                            logger.detail(`     ${change.field}: "${change.old}" → "${change.new}"`);
                                        });
                                        
                                        // Build update data with accurate values
                                        // Only update fields where we have verified data
                                        const updateData = {
                                            name: deploymentData.name,
                                            symbol: deploymentData.symbol,
                                            deployer: deploymentData.deployer,
                                            deployerBasename: deploymentData.deployerBasename,
                                            deployerENS: deploymentData.deployerENS,
                                            tokenImage: deploymentData.tokenImage,
                                            currentAdmin: deploymentData.currentAdmin,
                                            currentImageUrl: deploymentData.currentImageUrl,
                                            metadata: deploymentData.metadata,
                                            context: deploymentData.context,
                                            isVerified: deploymentData.isVerified,
                                            // Only update fee splits if we actually found them - if null, skip updating those fields
                                            ...(deploymentData.creatorBps !== null && deploymentData.creatorBps !== undefined 
                                                ? { creatorBps: deploymentData.creatorBps } 
                                                : {}),
                                            ...(deploymentData.feyStakersBps !== null && deploymentData.feyStakersBps !== undefined 
                                                ? { feyStakersBps: deploymentData.feyStakersBps } 
                                                : {}),
                                            poolId: deploymentData.poolId,
                                            createdAt: deploymentData.createdAt,
                                        };
                                        
                                        operations.push(
                                            prisma.deployment.update({
                                                where: { tokenAddress: normalizedTokenAddress },
                                                data: updateData,
                                            })
                                        );
                                        updatedTokens.push(normalizedTokenAddress);
                                    } else {
                                        logger.detail(`  ✓ ${normalizedTokenAddress}: Data already accurate (no changes needed)`);
                                    }
                                } else {
                                    logger.detail(`  ➕ Adding new token: ${normalizedTokenAddress} (${deployment.name || 'N/A'})`);
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
                            logger.detail(`  ✓ All tokens in this batch were already accurate (no database operations needed)`);
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
                if (NO_LIMIT_MODE) {
                    logger.warn(`Rate limit error (429) in no-limit mode for blocks ${fromBlock}-${toBlock}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                    logger.warn('⚠️  Consider running without --no-limit flag if rate limits persist');
                } else {
                    logger.warn(`Rate limit error (429) for blocks ${fromBlock}-${toBlock}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                }
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await this.processBlockRange(fromBlock, toBlock, existingAddresses, retryCount + 1);
            }
            
            // Handle block range errors by splitting
            // In no-limit mode, allow larger ranges (up to MAX_BLOCKS_PER_QUERY)
            const maxBlockRange = NO_LIMIT_MODE ? MAX_BLOCKS_PER_QUERY : 10;
            if (isBlockRangeError && (toBlock - fromBlock) > maxBlockRange) {
                // Split the range in half and retry
                logger.warn(`Block range too large (${toBlock - fromBlock + 1} blocks), splitting...`);
                const midBlock = Math.floor((fromBlock + toBlock) / 2);
                await this.processBlockRange(fromBlock, midBlock, existingAddresses, 0);
                await this.processBlockRange(midBlock + 1, toBlock, existingAddresses, 0);
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
            const startingBlock = await this.getFactoryDeploymentBlock(); // The "starting block" - earliest range we should ever process to
            const latestBlockInDb = await this.getLatestBlockInDatabase();
            
            // DEFAULT BEHAVIOR: Always start from current chain head and process backwards
            // This ensures we capture any missed deployments and fix any data inconsistencies
            const processFromBlock = latestBlock;
            const processToBlock = startingBlock;
            
            logger.section('🔍 Starting Data Integrity Check');
            logger.detail('📝 Purpose:');
            logger.detail('   • Ensure database has complete historical data');
            logger.detail('   • Add any missing token deployments');
            logger.detail('   • Update existing tokens with accurate data (timestamps, names, fee splits, etc.)');
            logger.detail('   • Safe to run multiple times (idempotent)');
            logger.detail('');
            logger.detail('📊 Block Range:');
            logger.detail(`   Latest block on chain: ${latestBlock}`);
            logger.detail(`   Latest block in DB: ${latestBlockInDb || 'none'}`);
            logger.detail(`   Factory deployment block: ${startingBlock}`);
            logger.detail(`   Processing backwards from block ${processFromBlock} to ${processToBlock}`);
            
            const totalBlocks = processFromBlock - processToBlock + 1; // +1 to include both endpoints
            logger.detail(`   Total blocks to process: ${totalBlocks}`);
            
            if (latestBlockInDb && latestBlockInDb < latestBlock) {
                logger.detail(`   ⚠️  Gap detected: DB is ${latestBlock - latestBlockInDb} blocks behind chain`);
            }
            logger.sectionEnd();

            // Process in chunks backwards from processFromBlock to startingBlock (factory deployment block)
            // This ensures we catch the most recent tokens first (useful for recovery scenarios)
            let currentBlock = processFromBlock;
            let processedBlocks = 0;
            
            logger.detail(`Processing backwards from block ${processFromBlock} to ${processToBlock} (${totalBlocks} blocks total)`);
            
            // Process TokenCreated events (backwards, as before)
            // Token images are now queried directly from the contract (current state)
            while (currentBlock >= processToBlock) {
                const fromBlock = Math.max(currentBlock - MAX_BLOCKS_PER_QUERY + 1, processToBlock);
                const toBlock = currentBlock;
                
                // Process TokenCreated events (deployments)
                // This will also query the contract directly for the current image URL
                await this.processBlockRange(fromBlock, toBlock, existingAddresses);
                
                currentBlock = fromBlock - 1;

                // Progress update
                processedBlocks += (toBlock - fromBlock + 1);
                const progress = totalBlocks > 0 ? ((processedBlocks / totalBlocks) * 100).toFixed(2) : '100.00';
                logger.detail(`Progress: ${progress}% (processed ${processedBlocks}/${totalBlocks} blocks, current: ${fromBlock}-${toBlock})`);
            }

            // Summary
            logger.section('✅ Data Integrity Check Complete');
            logger.detail(`Added: ${this.processedCount} new token(s)`);
            if (this.updatedCount > 0) {
                logger.detail(`Updated: ${this.updatedCount} existing token(s) with accurate data`);
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
            logger.error(`Data integrity check failed: ${error.message}`);
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
    const service = new DataIntegrityService();
    service.run();
}

module.exports = { DataIntegrityService };

