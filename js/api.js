// js/api.js

async function getLivePrice(symbol) {
    const stockId = symbol.split('.')[0];
    const cacheKey = `price_cache_${stockId}`;
    const CACHE_DURATION = 10 * 60 * 1000; // 10 分鐘快取 (毫秒)

    // 1. 檢查快取
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        const { price, timestamp } = JSON.parse(cachedData);
        const isFresh = (new Date().getTime() - timestamp) < CACHE_DURATION;
        
        if (isFresh) {
            console.log(`使用快取股價: ${symbol} = ${price}`);
            return { price: price };
        }
    }

    // 2. 如果無快取或已過期，則抓取新資料
    try {
        console.log(`快取過期，重新抓取: ${symbol}...`);
        const date = new Date();
        date.setDate(date.getDate() - 5);
        const startDate = date.toISOString().split('T')[0];
        
        const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&token=${FINMIND_TOKEN}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
        
        const response = await fetch(proxyUrl);
        const rawData = await response.json();
        const json = JSON.parse(rawData.contents);

        if (json.data && json.data.length > 0) {
            const latestPrice = json.data[json.data.length - 1].close;
            
            // 3. 存入快取
            const cachePayload = {
                price: latestPrice,
                timestamp: new Date().getTime()
            };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
            
            return { price: latestPrice };
        }
        return null;
    } catch (e) {
        console.error("抓取失敗，回傳舊快取或 null", e);
        return cachedData ? JSON.parse(cachedData) : null;
    }
}
