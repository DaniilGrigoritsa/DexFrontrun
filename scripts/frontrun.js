require("dotenv").config();
const Web3 = require("web3");
const WSProvider = "wss://mainnet.infura.io/ws/v3/1ab91169b78e4abca0ea58de59de04d0";
let provider = new Web3.providers.WebsocketProvider(WSProvider);
const web3 = new Web3(provider);

/**
 * Handle provider disconnect errors 
 */
provider.on('error', e => {
    console.log('WS Error', e);
    provider = new Web3.providers.WebsocketProvider(WSProvider);
});

provider.on('end', e => {
    console.log('WS closed');
    console.log('Attempting to reconnect...');
    provider = new Web3.providers.WebsocketProvider(WSProvider);

    provider.on('connect', function () {
        console.log('WSS Reconnected');
    });

    web3.setProvider(provider);
});

const UniswapV2FactoryABI = require("../abis/IUniswapV2Factory.json");
const UniswapV2PairABI = require("../abis/IUniswapV2Pair.json");
const UniswapV2RouterABI = require("../abis/IUniswapV2Router.json");
const ERC20ABI = require("../abis/ERC20ABI.json");

const METAMASK_PRIVATE_KEY = process.env.METAMASK_PRIVATE_KEY;
const UNISWAPV2FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const OWNER = ""; // paste your address
const UNISWAPV2ROUTER = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"; 
const VALUE = '10000000000000000'; // optional (0.01 ether)
const MIN_GAS_PRICE = '8000000000';
const MININUM_IMPACT_PERCENT = 0.01; // optional (1%)
const MINIMUM_EXTRACTABLE_PROFIT = 1.005 // optional 100,5% of initial value of ether

const v2Factory = new web3.eth.Contract(UniswapV2FactoryABI, UNISWAPV2FACTORY);
const router = new web3.eth.Contract(UniswapV2RouterABI, UNISWAPV2ROUTER);


const swappingFuntionSelectors = [
    "0x18cbafe5", // swapExactTokensForETH
    "0x7ff36ab5", // swapExactETHForTokens
]

/**
 * Calculate price impact using uniswap v2 AMM formula 
 */
calculatePriceImpact = async (amountIn, amountOutMin, path) => {
    const token0 = path[0];
    const token1 = path[1];
    const pairAddress = await v2Factory.methods.getPair(token0, token1).call();
    const pair = new web3.eth.Contract(UniswapV2PairABI, pairAddress);
    const {_reserve0, _reserve1,} = await pair.methods.getReserves().call();

    const priceImpact = ((_reserve0 + amountIn) / (_reserve1 - amountOutMin) - (_reserve0 / _reserve1))
        / (_reserve0 / _reserve1);
    
    return priceImpact;
}


firstFrontRunTransaction = async (gasPrice, poolAddress, data) => {
    const _nonce = await web3.eth.getTransactionCount(OWNER, 'latest');
    const nonce = _nonce.toString();

    const transaction = {
        'from': OWNER,
        'to': poolAddress,
        'value': VALUE,
        'gasLimit': "6800000", 
        'gasPrice': gasPrice * 2,  
        'nonce': nonce,
        'data': data
    }

    const signTrx = await web3.eth.accounts.signTransaction(transaction, METAMASK_PRIVATE_KEY);
    
    web3.eth.sendSignedTransaction(signTrx.rawTransaction, function(error, hash){
        if (error) {
            console.log('Error in first frontrun transaction', error)
        } 
        else { 
            console.log('Fronrun first transaction ', hash) 
        }
    })
}

 
secondFrontRunTransaction = async (
        gasPrice, 
        amountIn, 
        amountOutMin, 
        path, 
        poolAddress
    ) => {
    const _nonce = await web3.eth.getTransactionCount(OWNER, 'latest');
    const nonce = _nonce.toString();

    const data = router.methods.swapExactTokensForETH(
        amountIn, 
        amountOutMin, 
        path, 
        poolAddress, 
        datetime.now() + 6000
    ).encodeABI();

    const transaction = {
        'from': OWNER,
        'to': poolAddress,
        'value': '0x0',
        'gasLimit': "6800000", 
        'gasPrice': gasPrice,  
        'nonce': nonce,
        'data': data
    }

    const signTrx = await web3.eth.accounts.signTransaction(transaction, METAMASK_PRIVATE_KEY);
    
    web3.eth.sendSignedTransaction(signTrx.rawTransaction, function(error, hash){
        if (error) {
            console.log('Error in first frontrun transaction', error)
        } 
        else { 
            console.log('Fronrun first transaction ', hash) 
        }
    })
}


watchMempool = async () => {
    const subscription = await web3.eth.subscribe('pendingTransactions');

    subscription.on("data", async (txHash) => {
        const tx = await web3.eth.getTransaction(txHash);
        
        if (tx != null && tx.to == UNISWAPV2ROUTER) {
            const input = tx.input;
            const gasPrice = tx.gasPrice;

            if (input.substring(0, 10) == swappingFuntionSelectors[1] && gasPrice > MIN_GAS_PRICE) {
                console.log(tx);
                
                const data = input(11, input.length);

                const decodedData = web3.eth.abi.decodeParameters(
                    ['uint256','address[]','address','uint256'], 
                    data
                );

                const amountOutMin = decodedData[0];
                const path = decodedData[1];
                const to = decodedData[2];
                const deadline = decodedData[3];
                let priceImpact = 0;
                    
                if (path.length == 2) {
                    priceImpact = await calculatePriceImpact(VALUE, amountOutMin, path);
                } 
                
                if (priceImpact > MININUM_IMPACT_PERCENT) {
                    const balanceBefore = web3.eth.getBalance(OWNER);
                    await firstFrontRunTransaction(gasPrice, to, input);

                    const tradedTokenAddress = path[1];
                    const token = new web3.eth.Contract(ERC20ABI, tradedTokenAddress);
                    const tokensRecieved = token.methods.balanceOf(OWNER);
                    const newPath = path.reverse; 
                    const amountEthOutMin = VALUE * MINIMUM_EXTRACTABLE_PROFIT;

                    await secondFrontRunTransaction(gasPrice, tokensRecieved, amountEthOutMin, newPath, to);
                
                    const balanceAfter = web3.eth.getBalance(OWNER);
                    const profit = balanceAfter - balanceBefore; 
                    console.log(profit);
                }
            }
        }
    })
}

watchMempool();