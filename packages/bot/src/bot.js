require('dotenv').config();
if (!process.env.DISCORD_TOKEN || 
    !process.env.ALCHEMY_API_KEY || 
    !process.env.DISCORD_CHANNEL_ID || 
    !process.env.FEY_FACTORY_ADDRESS) {
    console.error('Missing required environment variables: DISCORD_TOKEN, ALCHEMY_API_KEY, DISCORD_CHANNEL_ID, or FEY_FACTORY_ADDRESS');
    process.exit(1);
}

const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
const { handleError } = require('./handlers/errorHandler');
const { handleTokenDeployment } = require('./handlers/tokenHandler');
const logger = require('./utils/logger');
const FEYContractHelper = require('./contracts/helpers/FEYContractHelper');
const { formatSupplyWithCommas } = require('@feydar/shared/utils');

const MAX_RETRIES = 5;

class FeydarBot {
    constructor() {
        this.provider = null;
        this.discord = null;
        this.isReconnecting = false;
        this.isShuttingDown = false;
        this.lastEventTime = Date.now();
        this.healthCheckInterval = null;
        this.reconnectAttempts = 0;
        this.initCount = 0;
        
        this.setupCleanupHandlers();
        this.initialize();
    }

    setupCleanupHandlers() {
        ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
            process.on(signal, async () => {
                logger.info(`\n${signal} received. Starting cleanup...`);
                await this.cleanup(true);
            });
        });

        process.on('uncaughtException', async (error) => {
            logger.error(`Uncaught Exception: ${error.message}`);
            console.error(error);
            await this.cleanup(true);
        });

        process.on('unhandledRejection', async (error) => {
            logger.error(`Unhandled Rejection: ${error.message}`);
            console.error(error);
            await this.cleanup(true);
        });
    }

    async initialize() {
        if (this.isShuttingDown) return;
        
        try {
            logger.section('🚀 Initializing Feydar Bot');

            logger.detail('Starting WebSocket Provider...');
            this.provider = new ethers.WebSocketProvider(
                `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
                {
                    name: 'base',
                    chainId: 8453
                }
            );

            await this.provider.ready;
            logger.detail('✅ Provider Connected');

            await this.initializeDiscord();
            logger.detail('✅ Discord client ready');
            logger.sectionEnd();

            logger.section('🔄 Initializing Contract Monitoring');
            this.feyContracts = new FEYContractHelper(
                this.provider,
                process.env.FEY_FACTORY_ADDRESS
            );
            logger.detail('✅ FEY Factory contract initialized');
            logger.sectionEnd();

            logger.section('🔍 Verifying Contract Deployment');
            await this.verifyContract();
            logger.detail('✅ Contract verified successfully');
            logger.sectionEnd();

            logger.section('🎯 Setting up Event Listeners');
            await this.setupEventListeners();
            logger.detail('✅ Event listeners set up successfully');
            logger.sectionEnd();

            logger.section('🔍 Starting Health Checks and Ping/Pong');
            this.startHealthCheck();
            this.startPingPong();
            logger.sectionEnd();

            logger.section('🚀 Bot Initialization Complete');
            logger.detail('👀 Monitoring FEY Protocol token deployments...');
            logger.sectionEnd();

            this.initCount = 0;

        } catch (error) {
            logger.error(`Initialization error: ${error.message}`);
            console.error('Full error:', error);
            
            if (this.initCount < MAX_RETRIES) {
                this.initCount++;
                const delay = Math.min(1000 * Math.pow(2, this.initCount), 30000);
                logger.info(`Retrying initialization in ${delay}ms (attempt ${this.initCount}/${MAX_RETRIES})`);
                setTimeout(() => this.initialize(), delay);
            } else {
                logger.error(`Failed to initialize after ${MAX_RETRIES} attempts`);
                process.exit(1);
            }
        }
    }

    async initializeDiscord() {
        return new Promise((resolve, reject) => {
            this.discord = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                ]
            });
            
            this.discord.once('clientReady', () => {
                resolve();
            });

            this.discord.on('error', (error) => {
                handleError(error, 'Discord Client');
                if (!this.isReconnecting) {
                    this.handleDisconnect();
                }
            });
            
            this.discord.login(process.env.DISCORD_TOKEN).catch(reject);
        });
    }

    async verifyContract() {
        const code = await this.provider.getCode(this.feyContracts.feyFactory.target);
        if (code === '0x' || code.length < 10) {
            throw new Error(`FEY Factory contract not found or invalid at ${this.feyContracts.feyFactory.target}`);
        }
        logger.detail('FEY Factory verified', this.feyContracts.feyFactory.target);
    }

    async setupEventListeners() {
        const factoryAddress = this.feyContracts.feyFactory.target;
        
        const filter = {
            address: factoryAddress,
            topics: [
                ethers.id('TokenCreated(address,address,address,string,string,string,string,string,int24,address,bytes32,address,address,address,uint256,address[])')
            ]
        };
        
        this.provider.on(filter, async (log) => {
            try {
                this.lastEventTime = Date.now();
                const eventTime = new Date().toISOString();
                logger.detail('🚨 TokenCreated event detected (REAL-TIME)', log.transactionHash);
                logger.detail('Event timestamp', eventTime);
                logger.detail('Block number', log.blockNumber);
                
                const tokenCreatedEvent = this.feyContracts.feyFactory.interface.parseLog({
                    topics: log.topics,
                    data: log.data
                });
                
                if (tokenCreatedEvent && tokenCreatedEvent.name === 'TokenCreated') {
                    logger.section('📊 Complete TokenCreated Event Data');
                    logger.detail('Event Name', tokenCreatedEvent.name);
                    logger.detail('Total Args', tokenCreatedEvent.args.length.toString());
                    
                    const argNames = [
                        'msgSender',
                        'tokenAddress (indexed)',
                        'tokenAdmin (indexed)',
                        'tokenImage',
                        'tokenName',
                        'tokenSymbol',
                        'tokenMetadata',
                        'tokenContext',
                        'startingTick',
                        'poolHook',
                        'poolId',
                        'pairedToken',
                        'locker',
                        'mevModule',
                        'extensionsSupply',
                        'extensions'
                    ];
                    
                    tokenCreatedEvent.args.forEach((arg, index) => {
                        const argName = argNames[index] || `arg[${index}]`;
                        let value = arg;
                        
                        if (Array.isArray(arg)) {
                            value = `[${arg.length} items: ${arg.join(', ')}]`;
                        } else if (typeof arg === 'bigint') {
                            value = arg.toString();
                        } else if (typeof arg === 'string' && arg.startsWith('0x') && arg.length === 66) {
                            value = arg;
                        }
                        
                        logger.detail(`  ${argName}`, value);
                    });
                    
                    logger.detail('---');
                    logger.detail('Transaction Hash', log.transactionHash);
                    logger.detail('Block Number', log.blockNumber.toString());
                    logger.detail('Block Hash', log.blockHash);
                    logger.detail('Log Index', log.index.toString());
                    logger.detail('Transaction Index', log.transactionIndex.toString());
                    
                    let receipt = null;
                    let tokensReceived = null;
                    let tokensSpent = null;
                    let feeSplit = null;
                    
                    try {
                        // Retry receipt fetch with exponential backoff
                        // Note: Receipt should be available since event log is in the block, but retry for reliability
                        let receiptRetries = 0;
                        const maxReceiptRetries = 3;
                        while (receiptRetries < maxReceiptRetries && !receipt) {
                            try {
                                receipt = await this.provider.getTransactionReceipt(log.transactionHash);
                                if (!receipt && receiptRetries < maxReceiptRetries - 1) {
                                    const delay = 500 * (receiptRetries + 1);
                                    logger.detail(`  Receipt not available, retrying in ${delay}ms...`);
                                    await new Promise(resolve => setTimeout(resolve, delay));
                                }
                            } catch (receiptError) {
                                if (receiptRetries < maxReceiptRetries - 1) {
                                    const delay = 500 * (receiptRetries + 1);
                                    logger.detail(`  Receipt fetch error, retrying in ${delay}ms: ${receiptError.message}`);
                                    await new Promise(resolve => setTimeout(resolve, delay));
                                } else {
                                    logger.warn(`Could not fetch transaction receipt after ${maxReceiptRetries} attempts: ${receiptError.message}`);
                                }
                            }
                            receiptRetries++;
                        }
                        
                        if (receipt) {
                            logger.detail('---');
                            logger.detail('Transaction From', receipt.from);
                            logger.detail('Transaction To', receipt.to || 'Contract Creation');
                            logger.detail('Gas Used', receipt.gasUsed.toString());
                            logger.detail('Status', receipt.status === 1 ? 'Success' : 'Failed');
                            logger.detail('Effective Gas Price', receipt.gasPrice?.toString() || 'N/A');

                            logger.detail('---');
                            logger.detail('Scanning for TokenRewardAdded event (fee split)...');
                            
                            const TOKEN_REWARD_CONTRACT = '0x282B4e72a79ebe79c1bd295c5ebd72940e50e836';
                            const TOKEN_REWARD_ADDED_TOPIC = '0xc9b03d1b68674b3ca5738b69c14e4dbcfcb7f474303edd540b1d7dfa785d27ff';
                            
                            const interfaceVariations = [
                                'event TokenRewardAdded(address token, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address token0, address token1, uint24 fee, int24 tickSpacing) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address,address,uint24,int24,address) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)',
                                'event TokenRewardAdded(address token, tuple(address,address,uint24,int24) poolKey, uint256 poolSupply, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients, int24[] tickLower, int24[] tickUpper, uint16[] positionBps)'
                            ];
                            
                            logger.detail('  Looking for contract:', TOKEN_REWARD_CONTRACT);
                            logger.detail('  Total logs in receipt:', receipt.logs.length);
                            
                            let logsFromContract = 0;
                            let parsedEvent = null;
                            
                            for (const logEntry of receipt.logs) {
                                if (logEntry.address.toLowerCase() === TOKEN_REWARD_CONTRACT.toLowerCase()) {
                                    logsFromContract++;
                                    logger.detail(`  Found log #${logsFromContract} from token reward contract`);
                                    logger.detail('    Topic[0] (event sig):', logEntry.topics[0]);
                                    
                                    // First, check if the topic matches the actual event signature
                                    if (logEntry.topics[0].toLowerCase() === TOKEN_REWARD_ADDED_TOPIC.toLowerCase()) {
                                        logger.detail('  ✅ Topic hash matches TokenRewardAdded event!');
                                        
                                        // Try to parse with different interface variations
                                        for (const eventSig of interfaceVariations) {
                                            try {
                                                const iface = new ethers.Interface([eventSig]);
                                                const parsed = iface.parseLog({
                                                    topics: logEntry.topics,
                                                    data: logEntry.data
                                                });
                                                
                                                if (parsed && parsed.name === 'TokenRewardAdded') {
                                                    parsedEvent = parsed;
                                                    logger.detail('  ✅ Successfully parsed TokenRewardAdded event!');
                                                    logger.detail('    Token', parsed.args.token);
                                                    logger.detail('    Num Positions', parsed.args.numPositions.toString());
                                                    logger.detail('    Reward Recipients', parsed.args.rewardRecipients.length);
                                                    logger.detail('    RewardBps length', parsed.args.rewardBps?.length || 0);
                                                    
                                                    if (parsed.args.rewardBps) {
                                                        logger.detail('    RewardBps values:', parsed.args.rewardBps.map((v) => v.toString()).join(', '));
                                                    }
                                                    
                                                    break; // Found working interface
                                                }
                                            } catch (e) {
                                                // Try next variation
                                                continue;
                                            }
                                        }
                                        
                                        // If parsing failed with all variations, try manual decoding using AbiCoder
                                        // Since the interface doesn't match the topic hash, we need to manually decode
                                        if (!parsedEvent) {
                                            logger.warn('  ⚠️  Could not parse with any interface variation, trying manual decode...');
                                            try {
                                                const abiCoder = ethers.AbiCoder.defaultAbiCoder();
                                                const data = logEntry.data;
                                                
                                                // ABI encoding for dynamic arrays: offset (uint256) points to where array data starts
                                                // The data structure is:
                                                // - Fixed params come first (token, poolKey tuple, poolSupply, positionId, numPositions)
                                                // - Then offsets for dynamic arrays (rewardBps, rewardAdmins, rewardRecipients, tickLower, tickUpper, positionBps)
                                                // - Then the actual array data
                                                
                                                // Uniswap v4 PoolKey structure:
                                                // - Currency currency0 (typically encoded as address = 32 bytes)
                                                // - Currency currency1 (typically encoded as address = 32 bytes)
                                                // - uint24 fee (32 bytes, padded)
                                                // - int24 tickSpacing (32 bytes, padded)
                                                // - IHooks hooks (address = 32 bytes)
                                                // Total poolKey = 5 * 32 = 160 bytes
                                                
                                                // Fixed params breakdown:
                                                // token (address) = 32 bytes
                                                // poolKey tuple (v4) = 5 * 32 = 160 bytes (currency0, currency1, fee, tickSpacing, hooks)
                                                // poolSupply (uint256) = 32 bytes
                                                // positionId (uint256) = 32 bytes  
                                                // numPositions (uint256) = 32 bytes
                                                // Total fixed params = 32 + 160 + 32 + 32 + 32 = 288 bytes = 9 * 32 bytes
                                                
                                                // After fixed params, we have 6 offsets (each 32 bytes) for the 6 dynamic arrays
                                                // rewardBps offset is at position 9 (0-indexed, so byte 288)
                                                
                                                try {
                                                    // Decode the rewardBps offset (6th parameter, after fixed params)
                                                    // Fixed params: 9 * 32 = 288 bytes (token + v4 PoolKey + poolSupply + positionId + numPositions)
                                                    // Offset for rewardBps is at byte 288 (9 * 32)
                                                    const REWARD_BPS_OFFSET_POSITION = 288; // bytes (updated for Uniswap v4 PoolKey)
                                                    const HEX_CHARS_PER_BYTE = 2;
                                                    const BYTES_PER_UINT256 = 32;
                                                    const HEX_CHARS_PER_UINT256 = BYTES_PER_UINT256 * HEX_CHARS_PER_BYTE;
                                                    
                                                    // Calculate position in hex string (account for '0x' prefix)
                                                    const HEX_PREFIX_LENGTH = 2;
                                                    const offsetStart = HEX_PREFIX_LENGTH + REWARD_BPS_OFFSET_POSITION * HEX_CHARS_PER_BYTE;
                                                    
                                                    if (data.length < offsetStart + HEX_CHARS_PER_UINT256) {
                                                        throw new Error(`Data too short: expected at least ${offsetStart + HEX_CHARS_PER_UINT256} chars, got ${data.length}`);
                                                    }
                                                    
                                                    const rewardBpsOffsetHex = data.slice(offsetStart, offsetStart + HEX_CHARS_PER_UINT256);
                                                    const rewardBpsOffset = Number(BigInt('0x' + rewardBpsOffsetHex));
                                                    
                                                    if (rewardBpsOffset < 0 || rewardBpsOffset > data.length) {
                                                        throw new Error(`Invalid offset: ${rewardBpsOffset} (data length: ${data.length})`);
                                                    }
                                                    
                                                    logger.detail('    rewardBps offset:', rewardBpsOffset, 'bytes');
                                                    
                                                    // The offset is in bytes, convert to hex string position
                                                    const rewardBpsDataStart = HEX_PREFIX_LENGTH + rewardBpsOffset * HEX_CHARS_PER_BYTE;
                                                    
                                                    if (data.length < rewardBpsDataStart + HEX_CHARS_PER_UINT256) {
                                                        throw new Error(`Array data starts beyond data length`);
                                                    }
                                                    
                                                    // Decode the array: first 32 bytes is length, then the values
                                                    const arrayLengthHex = data.slice(rewardBpsDataStart, rewardBpsDataStart + HEX_CHARS_PER_UINT256);
                                                    const arrayLength = Number(BigInt('0x' + arrayLengthHex));
                                                    
                                                    logger.detail('    rewardBps array length:', arrayLength);
                                                    
                                                    // Validate array length (should be at least 1, reasonable max is 100)
                                                    if (arrayLength < 1 || arrayLength > 100) {
                                                        throw new Error(`Invalid array length: ${arrayLength} (expected 1-100)`);
                                                    }
                                                    
                                                    // Decode the first value
                                                    const value1Start = rewardBpsDataStart + HEX_CHARS_PER_UINT256;
                                                    
                                                    if (data.length < value1Start + HEX_CHARS_PER_UINT256) {
                                                        throw new Error(`Not enough data for array value`);
                                                    }
                                                    
                                                    const value1Hex = data.slice(value1Start, value1Start + HEX_CHARS_PER_UINT256);
                                                    const value1 = Number(BigInt('0x' + value1Hex));
                                                    
                                                    const MAX_BPS = 10000;
                                                    if (value1 < 0 || value1 > MAX_BPS) {
                                                        throw new Error(`Invalid BPS value: ${value1} (expected 0-${MAX_BPS})`);
                                                    }
                                                    
                                                    let creatorBps, feyStakersBps;
                                                    
                                                    if (arrayLength >= 2) {
                                                        // Two elements: [creatorBps, feyStakersBps]
                                                        const value2Start = value1Start + HEX_CHARS_PER_UINT256;
                                                        
                                                        if (data.length < value2Start + HEX_CHARS_PER_UINT256) {
                                                            throw new Error(`Not enough data for second array value`);
                                                        }
                                                        
                                                        const value2Hex = data.slice(value2Start, value2Start + HEX_CHARS_PER_UINT256);
                                                        const value2 = Number(BigInt('0x' + value2Hex));
                                                        
                                                        if (value2 < 0 || value2 > MAX_BPS) {
                                                            throw new Error(`Invalid BPS value: ${value2} (expected 0-${MAX_BPS})`);
                                                        }
                                                        
                                                        creatorBps = value1;
                                                        feyStakersBps = value2;
                                                    } else {
                                                        // Single element: [feyStakersBps] - creator gets the remainder
                                                        feyStakersBps = value1;
                                                        creatorBps = 10000 - value1;
                                                    }
                                                    
                                                    logger.detail('    Creator BPS (manual decode):', creatorBps);
                                                    logger.detail('    FEY Stakers BPS (manual decode):', feyStakersBps);
                                                    
                                                    feeSplit = {
                                                        creatorBps,
                                                        feyStakersBps
                                                    };
                                                    
                                                    parsedEvent = { args: { rewardBps: [creatorBps, feyStakersBps] } }; // Mock for logging
                                                    logger.detail('  ✅ Successfully decoded fee split manually!');
                                                } catch (decodeError) {
                                                    logger.warn('    Manual decode error:', decodeError.message);
                                                    if (process.env.NODE_ENV === 'development') {
                                                        logger.detail('    Data length:', data.length);
                                                        logger.detail('    Data preview (first 200 chars):', data.substring(0, 200));
                                                    }
                                                }
                                            } catch (e) {
                                                logger.warn('    Manual decode failed:', e.message);
                                            }
                                        }
                                        
                                        break; // Found the event, no need to check other logs
                                    }
                                }
                            }
                            
                            if (logsFromContract === 0) {
                                logger.warn(`  ⚠️  No logs found from token reward contract (${TOKEN_REWARD_CONTRACT}) in this transaction`);
                            } else if (!parsedEvent) {
                                logger.warn('  ⚠️  Found logs from contract but could not parse TokenRewardAdded event');
                                if (process.env.NODE_ENV === 'development') {
                                    logger.detail('  Total logs in receipt:', receipt.logs.length);
                                    logger.detail('  Logs from reward contract:', logsFromContract);
                                }
                            }
                            
                            // Extract fee split from parsed event
                            // The rewardBps array can have 1 or 2 elements:
                            // - If 2 elements: [creatorBps, feyStakersBps]
                            // - If 1 element: [feyStakersBps] where creatorBps = 10000 - feyStakersBps
                            if (parsedEvent && parsedEvent.args.rewardBps && parsedEvent.args.rewardBps.length >= 1) {
                                let creatorBps, feyStakersBps;
                                
                                if (parsedEvent.args.rewardBps.length >= 2) {
                                    // Two elements: [creatorBps, feyStakersBps]
                                    creatorBps = Number(parsedEvent.args.rewardBps[0]);
                                    feyStakersBps = Number(parsedEvent.args.rewardBps[1]);
                                } else {
                                    // One element: [feyStakersBps] - creator gets the remainder
                                    feyStakersBps = Number(parsedEvent.args.rewardBps[0]);
                                    creatorBps = 10000 - feyStakersBps; // Total is 10000 bps (100%)
                                    logger.detail('  Single rewardBps element detected, calculating creator share...');
                                }
                                
                                feeSplit = {
                                    creatorBps,
                                    feyStakersBps
                                };
                                
                                logger.detail('  Creator Fee (bps)', creatorBps.toString());
                                logger.detail('  FEY Stakers Fee (bps)', feyStakersBps.toString());
                                logger.detail('  Creator Fee (%)', (creatorBps / 100).toFixed(2) + '%');
                                logger.detail('  FEY Stakers Fee (%)', (feyStakersBps / 100).toFixed(2) + '%');
                            } else if (parsedEvent) {
                                logger.warn('  ⚠️  rewardBps array is empty or missing');
                                if (process.env.NODE_ENV === 'development') {
                                    logger.detail('  Parsed event args:', Object.keys(parsedEvent.args || {}));
                                }
                            }
                            
                            if (feeSplit) {
                                logger.detail('---');
                                logger.detail('✅ Fee split data extracted successfully');
                            } else {
                                logger.warn('⚠️  TokenRewardAdded event not found or fee split could not be extracted');
                                if (process.env.NODE_ENV === 'development') {
                                    logger.detail('  Transaction hash:', log.transactionHash);
                                    logger.detail('  Receipt status:', receipt ? (receipt.status === 1 ? 'Success' : 'Failed') : 'Not available');
                                }
                            }
                        } else {
                            logger.warn('⚠️  Transaction receipt not available - fee split cannot be extracted');
                            if (process.env.NODE_ENV === 'development') {
                                logger.detail('  Transaction hash:', log.transactionHash);
                                logger.detail('  Block number:', log.blockNumber);
                            }
                        }
                    } catch (e) {
                        logger.warn(`Could not fetch transaction receipt: ${e.message}`);
                        if (process.env.NODE_ENV === 'development') {
                            logger.detail('  Transaction hash:', log.transactionHash);
                            logger.detail('  Error:', e.message);
                        }
                    }
                    
                    // Extract event data for processing
                    const msgSender = tokenCreatedEvent.args[0];
                    const tokenAddress = ethers.getAddress(tokenCreatedEvent.args[1]);
                    const tokenAdmin = ethers.getAddress(tokenCreatedEvent.args[2]);
                    const tokenImage = tokenCreatedEvent.args[3];
                    const tokenName = tokenCreatedEvent.args[4];
                    const tokenSymbol = tokenCreatedEvent.args[5];
                    const tokenMetadata = tokenCreatedEvent.args[6];
                    const tokenContext = tokenCreatedEvent.args[7];
                    const startingTick = tokenCreatedEvent.args[8];
                    const poolHook = tokenCreatedEvent.args[9];
                    const poolId = tokenCreatedEvent.args[10];
                    const pairedToken = ethers.getAddress(tokenCreatedEvent.args[11]);
                    const locker = ethers.getAddress(tokenCreatedEvent.args[12]);
                    const mevModule = ethers.getAddress(tokenCreatedEvent.args[13]);
                    const extensionsSupply = tokenCreatedEvent.args[14];
                    const extensions = tokenCreatedEvent.args[15];

                    // Look for initial purchase: Transfer events showing deployer received tokens
                    if (receipt) {
                        logger.detail('---');
                        logger.detail('Scanning for initial purchase...');
                        
                        let pairedTokenDecimals = 18;
                        // Get paired token decimals for formatting
                        try {
                            const pairedTokenContract = this.feyContracts.getTokenContract(pairedToken);
                            pairedTokenDecimals = await pairedTokenContract.decimals();
                        } catch (e) {
                            // Default to 18
                        }
                        
                        // Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
                        const transferTopic = ethers.id('Transfer(address,address,uint256)');
                        const tokenAddressLower = tokenAddress.toLowerCase();
                        const pairedTokenLower = pairedToken.toLowerCase();
                        const deployerLower = tokenAdmin.toLowerCase();
                        
                        for (const logEntry of receipt.logs) {
                            // Check if this is a Transfer event
                            if (logEntry.topics[0] === transferTopic) {
                                try {
                                    const transferIface = new ethers.Interface([
                                        'event Transfer(address indexed from, address indexed to, uint256 value)'
                                    ]);
                                    const parsed = transferIface.parseLog({
                                        topics: logEntry.topics,
                                        data: logEntry.data
                                    });
                                    
                                    if (parsed && parsed.name === 'Transfer') {
                                        const from = parsed.args.from.toLowerCase();
                                        const to = parsed.args.to.toLowerCase();
                                        const value = parsed.args.value;
                                        const logAddress = logEntry.address.toLowerCase();
                                        
                                        // If deployer received new tokens (from pool/contract to deployer)
                                        if (logAddress === tokenAddressLower && 
                                            to === deployerLower && 
                                            from !== deployerLower) {
                                            tokensReceived = value;
                                            logger.detail(`  ✅ Deployer received: ${formatSupplyWithCommas(value)} ${tokenSymbol}`);
                                        }
                                        
                                        // If deployer spent paired token (from deployer to pool/contract)
                                        if (logAddress === pairedTokenLower && 
                                            from === deployerLower && 
                                            to !== deployerLower) {
                                            tokensSpent = value;
                                            logger.detail(`  ✅ Deployer spent: ${formatSupplyWithCommas(value, pairedTokenDecimals)} paired token`);
                                        }
                                    }
                                } catch (e) {
                                    // Continue searching
                                }
                            }
                        }
                        
                        if (tokensReceived || tokensSpent) {
                            logger.detail('---');
                            logger.detail('✅ Initial purchase data found');
                        }
                    }
                    
                    // Note: All FEY tokens have 100b supply, so we don't need to fetch it
                    logger.sectionEnd();
                    
                    await handleTokenDeployment({
                        tokenAddress: tokenAddress,
                        name: tokenName,
                        symbol: tokenSymbol,
                        deployer: tokenAdmin, // tokenAdmin is the deployer/admin
                        transactionHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        provider: this.provider,
                        discord: this.discord,
                        // Pass all additional data for potential use
                        fullEventData: {
                            msgSender,
                            tokenImage,
                            tokenMetadata,
                            tokenContext,
                            startingTick,
                            poolHook,
                            poolId,
                            pairedToken,
                            locker,
                            mevModule,
                            extensionsSupply,
                            extensions,
                            tokensReceived, // Initial purchase: tokens received
                            tokensSpent,    // Initial purchase: paired tokens spent
                            feeSplit        // Fee split from TokenRewardAdded event (Creator vs FEY Stakers)
                        }
                    });
                }
            } catch (error) {
                handleError(error, 'TokenCreated Event Handler');
            }
        });

        logger.detail('FEY Factory Monitor', 'TokenCreated events (from deployToken transactions)');
    }

    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.isShuttingDown || this.isReconnecting) return;

            try {
                // Check WebSocket connection
                if (this.provider?.websocket?.readyState !== 1) {
                    logger.warn('WebSocket not in OPEN state, reconnecting...');
                    await this.handleDisconnect();
                    return;
                }

                // Check Discord connection
                if (!this.discord?.isReady()) {
                    logger.warn('Discord client not ready, reconnecting...');
                    await this.handleDisconnect();
                    return;
                }

                // Check if we've received events recently
                const timeSinceLastEvent = Date.now() - this.lastEventTime;
                if (timeSinceLastEvent > 5 * 60 * 1000) { // 5 minutes
                    logger.warn('No events received recently, checking connection...');
                    await this.provider.getBlockNumber();
                }

            } catch (error) {
                logger.error(`Health check failed: ${error.message}`);
                await this.handleDisconnect();
            }
        }, 30000); // Check every 30 seconds
    }

    async handleDisconnect() {
        if (this.isReconnecting || this.isShuttingDown) return;
        
        this.isReconnecting = true;
        this.reconnectAttempts++;

        logger.warn('Connection lost, attempting to reconnect...');

        try {
            await this.cleanup(false);
            this.isShuttingDown = false;
            
            // Wait with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));

            await this.initialize();
            
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            logger.info('Successfully reconnected and restored listeners');
        } catch (error) {
            this.isReconnecting = false;
            handleError(error, 'Reconnection Failed');
            
            if (this.reconnectAttempts > 5) {
                logger.error('Too many reconnection attempts, exiting...');
                await this.cleanup(true);
            } else {
                setTimeout(() => this.handleDisconnect(), 5000);
            }
        }
    }

    async cleanup(shouldExit = true) {
        if (this.isShuttingDown) {
            logger.info('Cleanup already in progress...');
            return;
        }
        
        this.isShuttingDown = true;
        logger.info('Shutting down services...');
        
        try {
            // Remove signal handlers first
            ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
                process.removeAllListeners(signal);
            });

            // Remove unhandled rejection handler to prevent logging during cleanup
            process.removeAllListeners('unhandledRejection');
            
            // Clean up factory listeners
            if (this.feyContracts?.feyFactory) {
                this.feyContracts.feyFactory.removeAllListeners();
            }
            
            // Clean up provider
            if (this.provider) {
                // Remove all event listeners and subscriptions
                this.provider.removeAllListeners();
                if (this.provider.websocket) {
                    this.provider.websocket.removeAllListeners();
                    // Force close the websocket
                    this.provider.websocket.terminate();
                }
                
                // Add a small delay to ensure all cleanup is complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                try {
                    await this.provider.destroy();
                } catch (error) {
                    // Ignore provider destruction errors during cleanup
                    logger.warn('Provider cleanup error (non-fatal):', error.message);
                }
                this.provider = null;
            }

            // Clean up Discord
            if (this.discord) {
                await this.discord.destroy();
                this.discord = null;
            }

            logger.info('Cleanup completed successfully');

            if (shouldExit) {
                logger.info('Exiting process...');
                process.exit(0);
            }
        } catch (error) {
            logger.error(`Cleanup error: ${error.message}`);
            if (shouldExit) {
                process.exit(1);
            }
        }
    }

    startPingPong() {
        // Send a ping every 30 seconds
        setInterval(() => {
            if (this.provider?.websocket?.readyState === 1) { // 1 = OPEN
                this.provider.websocket.ping();
            }
        }, 30000);

        // Handle pong responses
        if (this.provider?.websocket) {
            this.provider.websocket.on('pong', () => {
                this.lastEventTime = Date.now(); // Update last event time
            });
        }
    }
}

// Start the bot
new FeydarBot();

