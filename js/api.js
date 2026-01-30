// js/api.js

async function getLivePrice(symbol) {
    const stockId = symbol.split('.')[0];
    const cacheKey = `price_cache_${stockId}`;
    const CACHE_DURATION = 10 * 60 * 1000; // 10 分鐘快取

    // 1. 先檢查本地快取是否存在且未過期
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        const cache = JSON.parse(cachedData);
        const isFresh = (new Date().getTime() - cache.timestamp) < CACHE_DURATION;
        
        if (isFresh) {
            console.log(`使用快取數據 (${symbol}):`, cache);
            return cache; // 直接回傳快取物件 (包含 price 和 changePercent)
        }
    }

    // 2. 如果無快取或已過期，則抓取新資料
    try {
        console.log(`正在從網路更新股價 (${symbol})...`);
        const date = new Date();
        date.setDate(date.getDate() - 10); // 多抓幾天確保有資料可計算漲跌
        const startDate = date.toISOString().split('T')[0];
        
        const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&token=${FINMIND_TOKEN}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
        
        const response = await fetch(proxyUrl);
        const rawData = await response.json();
        
        // 這裡就是關鍵：定義 json 變數
        const json = JSON.parse(rawData.contents);

        if (json.data && json.data.length >= 2) {
            const latest = json.data[json.data.length - 1];     // 今日資料
            const yesterday = json.data[json.data.length - 2];  // 昨日資料
            
            const price = latest.close;
            // 計算漲跌幅 (%)
            const changePercent = ((price - yesterday.close) / yesterday.close) * 100;

            const cachePayload = {
                price: price,
                changePercent: changePercent,
                timestamp: new Date().getTime()
            };

            // 儲存到本地快取
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
            
            return cachePayload;
        } else if (json.data && json.data.length === 1) {
            // 如果只有一筆資料，無法計算漲跌，但可以回傳價格
            return { price: json.data[0].close, changePercent: 0, timestamp: new Date().getTime() };
        }
        
        return null;
    } catch (e) {
        console.error("API 抓取失敗:", e);
        // 如果網路抓取失敗但本地有舊快取，先拿舊的頂著用
        return cachedData ? JSON.parse(cachedData) : null;
    }
}
