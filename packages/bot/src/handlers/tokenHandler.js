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

/**
 * Handles new token creation events from FEY factory
 */
async function handleTokenDeployment({
    tokenAddress,
    name,
    symbol,
    totalSupply,
    deployer,
    transactionHash,
    blockNumber,
    provider,
    discord,
    fullEventData
}) {
    const startTime = Date.now();

    try {
        logger.section('📝 Processing Token Deployment');
        logger.detail('Token', `${name} (${symbol})`);
        logger.detail('Address', tokenAddress);
        logger.detail('Transaction', transactionHash);
        
        logger.detail('---');
        logger.detail('Resolving deployer names...');
        const deployerInfo = await resolveAddressName(deployer, provider);
        logger.detail('Deployer resolved', `Basename: ${deployerInfo.basename || 'none'}, ENS: ${deployerInfo.ens || 'none'}, Display: ${deployerInfo.name}`);

        let initialPurchaseText = null;
        if (fullEventData?.tokensReceived) {
            const tokensReceivedBigInt = typeof fullEventData.tokensReceived === 'bigint' 
                ? fullEventData.tokensReceived 
                : BigInt(fullEventData.tokensReceived);
            const totalSupplyBigInt = typeof totalSupply === 'bigint' 
                ? totalSupply 
                : BigInt(totalSupply);
            
            const percentage = totalSupplyBigInt > 0n
                ? (Number(tokensReceivedBigInt) / Number(totalSupplyBigInt)) * 100
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
            totalSupply: formatSupplyWithCommas(totalSupply),
            deployer,
            deployerName: deployerInfo.name,
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
            const truncatedDeployerName = deployerInfo.name ? deployerInfo.name.substring(0, 255) : null;
            const truncatedDeployerBasename = deployerInfo.basename ? deployerInfo.basename.substring(0, 255) : null;
            const truncatedDeployerENS = deployerInfo.ens ? deployerInfo.ens.substring(0, 255) : null;
            
            const poolId = fullEventData?.poolId ? (typeof fullEventData.poolId === 'string' ? fullEventData.poolId : `0x${fullEventData.poolId.toString(16).padStart(64, '0')}`) : null;
            const pairedToken = fullEventData?.pairedToken ? ethers.getAddress(fullEventData.pairedToken) : null;
            
            const creatorBps = fullEventData?.feeSplit?.creatorBps !== undefined ? Number(fullEventData.feeSplit.creatorBps) : null;
            const feyStakersBps = fullEventData?.feeSplit?.feyStakersBps !== undefined ? Number(fullEventData.feeSplit.feyStakersBps) : null;
            
            if (fullEventData?.feeSplit) {
                logger.detail('Fee Split', `Creator: ${creatorBps} bps (${(creatorBps / 100).toFixed(2)}%), FEY Stakers: ${feyStakersBps} bps (${(feyStakersBps / 100).toFixed(2)}%)`);
            }

            await prisma.deployment.upsert({
                where: { tokenAddress },
                update: {
                    name: truncatedName,
                    symbol: truncatedSymbol,
                    totalSupply: totalSupply.toString(),
                    deployer,
                    deployerName: truncatedDeployerName,
                    deployerBasename: truncatedDeployerBasename,
                    deployerENS: truncatedDeployerENS,
                    transactionHash,
                    tokenImage: fullEventData?.tokenImage,
                    creatorBps,
                    feyStakersBps,
                    poolId,
                    pairedToken,
                    blockNumber: BigInt(blockNumber || 0),
                },
                create: {
                    tokenAddress,
                    name: truncatedName,
                    symbol: truncatedSymbol,
                    totalSupply: totalSupply.toString(),
                    deployer,
                    deployerName: truncatedDeployerName,
                    deployerBasename: truncatedDeployerBasename,
                    deployerENS: truncatedDeployerENS,
                    transactionHash,
                    tokenImage: fullEventData?.tokenImage,
                    creatorBps,
                    feyStakersBps,
                    poolId,
                    pairedToken,
                    blockNumber: BigInt(blockNumber || 0),
                },
            });
            logger.detail('✅ Saved to database');

            try {
                await broadcastDeployment({
                    tokenAddress,
                    name,
                    symbol,
                    totalSupply: totalSupply.toString(),
                    deployer,
                    deployerName: deployerInfo.name,
                    deployerBasename: deployerInfo.basename,
                    deployerENS: deployerInfo.ens,
                    transactionHash,
                    tokenImage: fullEventData?.tokenImage,
                    creatorBps,
                    feyStakersBps,
                    blockNumber: Number(blockNumber || 0),
                    createdAt: new Date(),
                });
                logger.detail('✅ Broadcasted via API');
            } catch (wsError) {
                logger.warn(`Broadcast error: ${wsError.message}`);
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

