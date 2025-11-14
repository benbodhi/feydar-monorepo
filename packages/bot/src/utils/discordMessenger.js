const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../handlers/errorHandler');
const logger = require('./logger');
const { createTradeLinks } = require('@feydar/shared/constants');

/**
 * Formats deployer address with all available names (basename, ENS, hex) and explorer links
 */
function formatDeployerField(address, name, basename, ens) {
    try {
        const checksummedAddress = require('ethers').getAddress(address);
        const lines = [];
        
        if (basename && basename.toLowerCase() !== address.toLowerCase()) {
            lines.push(`**${basename}.base.eth**`);
        }
        
        if (ens && ens.toLowerCase() !== address.toLowerCase()) {
            lines.push(`**${ens}**`);
        }
        
        lines.push(`\`${checksummedAddress}\``);
        
        const displayName = lines.length > 0 ? lines.join('\n') : checksummedAddress;
        
        return `${displayName}\n**[Basescan](https://basescan.org/address/${address})**`;
    } catch (error) {
        handleError(error, 'Address Formatting');
        const displayName = name && name !== address ? `${name} (${address})` : address;
        return `${displayName}\n**[Basescan](https://basescan.org/address/${address})**`;
    }
}

/**
 * Creates embed fields for token deployment
 */
function createTokenEmbedFields(tokenData) {
    const tradeLinks = createTradeLinks(tokenData.tokenAddress);
    
    const tradeLinksRow = [
        `**[FEY](${tradeLinks.fey})**`,
        `**[Matcha](${tradeLinks.matcha})**`,
        `**[Uniswap](${tradeLinks.uniswap})**`
    ].join(' | ');

    const explorerLinksRow = [
        `**[Basescan](https://basescan.org/token/${tokenData.tokenAddress})**`,
        `**[Dexscreener](https://dexscreener.com/base/${tokenData.tokenAddress})**`,
        `**[Defined](https://www.defined.fi/base/${tokenData.tokenAddress}?quoteToken=token0&cache=d3c3a)**`,
        `**[GeckoTerminal](https://www.geckoterminal.com/base/pools/${tokenData.tokenAddress})**`
    ].join(' | ');

    const fields = [
        { name: 'Token Name', value: tokenData.name, inline: true },
        { name: 'Ticker', value: tokenData.symbol, inline: true },
        { 
            name: 'Trade', 
            value: tradeLinksRow, 
            inline: false 
        },
        { 
            name: 'Contract Address', 
            value: `${tokenData.tokenAddress}\n${explorerLinksRow}`, 
            inline: false 
        },
        { name: 'Deployer', value: formatDeployerField(tokenData.deployer, tokenData.deployerName, tokenData.deployerBasename, tokenData.deployerENS), inline: false },
        { name: 'Total Supply', value: tokenData.totalSupply, inline: false }
    ];

    if (tokenData.initialPurchase) {
        fields.push({
            name: 'Initial Purchase',
            value: tokenData.initialPurchase,
            inline: false
        });
    }

    if (tokenData.feeSplit && tokenData.feeSplit.creatorBps !== undefined && tokenData.feeSplit.feyStakersBps !== undefined) {
        const creatorPercent = (tokenData.feeSplit.creatorBps / 100).toFixed(2);
        const feyStakersPercent = (tokenData.feeSplit.feyStakersBps / 100).toFixed(2);
        fields.push({
            name: 'Fee Split',
            value: `Creator ${creatorPercent}% | FEY Stakers ${feyStakersPercent}%`,
            inline: false
        });
    }

    if (tokenData.transactionHash) {
        fields.push({
            name: 'Transaction',
            value: `**[View on Basescan](https://basescan.org/tx/${tokenData.transactionHash})**`,
            inline: false
        });
    }

    return fields;
}

/**
 * Sends Discord message for new token deployment
 */
async function sendTokenDeploymentMessage(tokenData, discord) {
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        if (!channel) {
            throw new Error('Discord channel not found');
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🚀 New FEY Token Deployed')
            .addFields(createTokenEmbedFields(tokenData))
            .setTimestamp();

        if (tokenData.tokenImage && tokenData.tokenImage.trim() !== '') {
            let imageUrl = tokenData.tokenImage;
            if (imageUrl.startsWith('ipfs://')) {
                imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
            }
            embed.setImage(imageUrl);
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        handleError(error, 'Discord Message');
        throw error;
    }
}

module.exports = { 
    sendTokenDeploymentMessage
};

