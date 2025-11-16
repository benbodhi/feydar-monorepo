const { sendTokenDeploymentMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const { resolveAddressName } = require('../services/nameResolver');
const logger = require('../utils/logger');
const { formatSupplyWithCommas } = require('@feydar/shared/utils');
const { prisma } = require('../db/client');
const { ethers } = require('ethers');

async function broadcastDeployment(deployment) {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    try {
        const response = await fetch(`${apiUrl}/api/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deployment),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return true;
    } catch (error) {
        logger.warn(`Failed to broadcast deployment: ${error.message}`);
        return false;
    }
}

async function sendDeploymentNotifications(deployment) {
    const apiUrl = process.env.API_URL || 'http://localhost:3001';
    try {
        const response = await fetch(`${apiUrl}/api/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deployment),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const result = await response.json();
        return result;
    } catch (error) {
        logger.warn(`Failed to send notifications: ${error.message}`);
        return null;
    }
}

/**
 * Handles new token creation events from FEY factory
 */
async function handleTokenDeployment({
    tokenAddress,
    name,
    symbol,
    deployer,
    transactionHash,
    blockNumber,
    provider,
    discord,
    fullEventData,
    feyContracts // FEYContractHelper instance for fetching contract data
}) {
    const startTime = Date.now();

    // Normalize addresses to lowercase for consistent database storage
    // (Ethereum addresses are case-insensitive, but we store them lowercase)
    tokenAddress = tokenAddress.toLowerCase();
    deployer = deployer.toLowerCase();

    try {
        logger.section('📝 Processing Token Deployment');
        logger.detail('Token', `${name} (${symbol})`);
        logger.detail('Address', tokenAddress);
        logger.detail('Transaction', transactionHash);
        
        logger.detail('---');
        logger.detail('Resolving deployer names...');
        const deployerInfo = await resolveAddressName(deployer, provider);
        logger.detail('Deployer resolved', `Basename: ${deployerInfo.basename || 'none'}, ENS: ${deployerInfo.ens || 'none'}, Display: ${deployerInfo.name}`);

        // All FEY tokens have 100b supply
        const TOTAL_SUPPLY_TOKENS = 100_000_000_000n; // 100 billion tokens (in wei: 100b * 10^18)
        const TOTAL_SUPPLY_WEI = TOTAL_SUPPLY_TOKENS * 10n**18n;
        
        let initialPurchaseText = null;
        if (fullEventData?.tokensReceived) {
            const tokensReceivedBigInt = typeof fullEventData.tokensReceived === 'bigint' 
                ? fullEventData.tokensReceived 
                : BigInt(fullEventData.tokensReceived);
            
            const percentage = TOTAL_SUPPLY_WEI > 0n
                ? (Number(tokensReceivedBigInt) / Number(TOTAL_SUPPLY_WEI)) * 100
                : 0;
            
            const tokensReceivedFormatted = formatSupplyWithCommas(tokensReceivedBigInt);
            initialPurchaseText = `Dev bought: ${percentage.toFixed(2)}% of supply (${tokensReceivedFormatted} ${symbol})`;
        }

        logger.detail('---');
        logger.detail('Sending Discord message...');
        await sendTokenDeploymentMessage({
            tokenAddress,
            name,
            symbol,
            deployer,
            deployerBasename: deployerInfo.basename,
            deployerENS: deployerInfo.ens,
            transactionHash,
            tokenImage: fullEventData?.tokenImage,
            feeSplit: fullEventData?.feeSplit,
            initialPurchase: initialPurchaseText
        }, discord);
        logger.detail('✅ Discord message sent');

        logger.detail('---');
        logger.detail('Saving to database...');
        try {
            const truncatedName = name ? name.substring(0, 500) : '';
            const truncatedSymbol = symbol ? symbol.substring(0, 100) : '';
            const truncatedDeployerBasename = deployerInfo.basename ? deployerInfo.basename.substring(0, 255) : null;
            const truncatedDeployerENS = deployerInfo.ens ? deployerInfo.ens.substring(0, 255) : null;
            
            const poolId = fullEventData?.poolId ? (typeof fullEventData.poolId === 'string' ? fullEventData.poolId : `0x${fullEventData.poolId.toString(16).padStart(64, '0')}`) : null;
            
            const creatorBps = fullEventData?.feeSplit?.creatorBps !== undefined ? Number(fullEventData.feeSplit.creatorBps) : null;
            const feyStakersBps = fullEventData?.feeSplit?.feyStakersBps !== undefined ? Number(fullEventData.feeSplit.feyStakersBps) : null;
            
            if (fullEventData?.feeSplit) {
                logger.detail('Fee Split', `Creator: ${creatorBps} bps (${(creatorBps / 100).toFixed(2)}%), FEY Stakers: ${feyStakersBps} bps (${(feyStakersBps / 100).toFixed(2)}%)`);
            }

            // Get block timestamp for accurate createdAt - MUST have this, retry until we get it
            let createdAt = null;
            if (blockNumber && provider) {
                const MAX_BLOCK_RETRIES = 10;
                const RETRY_DELAY_BASE_MS = 1000;
                let blockRetryCount = 0;
                let blockFetched = false;
                
                while (!blockFetched && blockRetryCount < MAX_BLOCK_RETRIES) {
                    try {
                        const block = await provider.getBlock(blockNumber);
                        if (block && block.timestamp) {
                            createdAt = new Date(Number(block.timestamp) * 1000);
                            blockFetched = true;
                        } else {
                            logger.warn(`Block ${blockNumber} has no timestamp, retrying...`);
                            blockRetryCount++;
                            if (blockRetryCount < MAX_BLOCK_RETRIES) {
                                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_BASE_MS * Math.pow(2, blockRetryCount - 1)));
                            }
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
                            const delay = RETRY_DELAY_BASE_MS * Math.pow(2, blockRetryCount - 1);
                            logger.warn(`Could not fetch block timestamp for block ${blockNumber} (attempt ${blockRetryCount}/${MAX_BLOCK_RETRIES}): ${e.message}. Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            logger.error(`Failed to fetch block timestamp for block ${blockNumber} after ${MAX_BLOCK_RETRIES} attempts: ${e.message}`);
                            throw new Error(`Cannot proceed without block timestamp for block ${blockNumber}`);
                        }
                    }
                }
                
                if (!createdAt) {
                    throw new Error(`Failed to get block timestamp for block ${blockNumber} - cannot proceed`);
                }
            } else {
                throw new Error('Missing blockNumber or provider - cannot determine deployment timestamp');
            }

            await prisma.deployment.upsert({
                where: { tokenAddress },
                                                update: {
                                                    name: truncatedName,
                                                    symbol: truncatedSymbol,
                                                    deployer,
                                                    deployerBasename: truncatedDeployerBasename,
                                                    deployerENS: truncatedDeployerENS,
                    transactionHash,
                    tokenImage: fullEventData?.tokenImage,
                                                    creatorBps,
                                                    feyStakersBps,
                                                    poolId,
                                                    blockNumber: BigInt(blockNumber || 0),
                                                    createdAt,
                                                },
                                                create: {
                                                    tokenAddress,
                                                    name: truncatedName,
                                                    symbol: truncatedSymbol,
                                                    deployer,
                                                    deployerBasename: truncatedDeployerBasename,
                                                    deployerENS: truncatedDeployerENS,
                                                    transactionHash,
                                                    tokenImage: fullEventData?.tokenImage,
                                                    creatorBps,
                                                    feyStakersBps,
                                                    poolId,
                                                    blockNumber: BigInt(blockNumber || 0),
                                                    createdAt,
                                                },
            });
            logger.detail('✅ Saved to database');

            const deploymentData = {
                tokenAddress,
                name,
                symbol,
                deployer,
                deployerBasename: deployerInfo.basename,
                deployerENS: deployerInfo.ens,
                transactionHash,
                tokenImage: fullEventData?.tokenImage,
                creatorBps,
                feyStakersBps,
                blockNumber: Number(blockNumber || 0),
                createdAt,
            };

            try {
                await broadcastDeployment(deploymentData);
                logger.detail('✅ Broadcasted via API');
            } catch (wsError) {
                logger.warn(`Broadcast error: ${wsError.message}`);
            }

            // Send Farcaster notifications (non-blocking)
            try {
                const notificationResult = await sendDeploymentNotifications(deploymentData);
                if (notificationResult) {
                    logger.detail(`✅ Sent notifications: ${notificationResult.sent} sent, ${notificationResult.failed} failed`);
                }
            } catch (notifError) {
                logger.warn(`Notification error: ${notifError.message}`);
            }

            // Fetch contract data asynchronously after initial save
            if (feyContracts) {
                feyContracts.fetchTokenContractData(tokenAddress)
                    .then(async (contractData) => {
                        try {
                            await prisma.deployment.update({
                                where: { tokenAddress },
                                data: {
                                    currentAdmin: contractData.currentAdmin,
                                    currentImageUrl: contractData.currentImageUrl,
                                    metadata: contractData.metadata,
                                    context: contractData.context,
                                    isVerified: contractData.isVerified,
                                },
                            });
                            logger.detail(`✅ Updated contract data for ${tokenAddress}`);
                        } catch (updateError) {
                            logger.warn(`Failed to update contract data for ${tokenAddress}: ${updateError.message}`);
                        }
                    })
                    .catch((error) => {
                        logger.warn(`Background contract data fetch failed for ${tokenAddress}: ${error.message}`);
                    });
            }
        } catch (dbError) {
            logger.error(`Database save error: ${dbError.message}`);
        }

        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();

    } catch (error) {
        const isNetworkError = handleError(error, 'Token Deployment Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = { handleTokenDeployment };

