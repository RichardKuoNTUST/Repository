// js/api.js

async function getLivePrice(symbol) {
    const stockId = symbol.split('.')[0];
    const cacheKey = `price_cache_${stockId}`;
    const CACHE_DURATION = 10 * 60 * 1000; // 10 分鐘快取

    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        const cache = JSON.parse(cachedData);
        if ((new Date().getTime() - cache.timestamp) < CACHE_DURATION) {
            return cache;
        }
    }

    try {
        const date = new Date();
        date.setDate(date.getDate() - 10);
        const startDate = date.toISOString().split('T')[0];
        
        const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&token=${FINMIND_TOKEN}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
        
        const response = await fetch(proxyUrl);
        const rawData = await response.json();
        
        // 關鍵修正：確保在區塊內宣告 json
        const json = JSON.parse(rawData.contents);

        if (json.data && json.data.length >= 2) {
            const latest = json.data[json.data.length - 1];
            const yesterday = json.data[json.data.length - 2];
            const price = latest.close;
            const changePercent = ((price - yesterday.close) / yesterday.close) * 100;

            const cachePayload = {
                price: price,
                changePercent: changePercent || 0,
                timestamp: new Date().getTime()
            };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
            return cachePayload;
        }
        return null;
    } catch (e) {
        console.error("API Error:", e);
        return cachedData ? JSON.parse(cachedData) : null;
    }
}
