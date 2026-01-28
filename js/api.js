async function getLivePrice(symbol) {
            const stockId = symbol.split('.')[0];
            const cacheKey = `price_info_${stockId}`;
            try {
                const date = new Date();
                date.setDate(date.getDate() - 10);
                const startDate = date.toISOString().split('T')[0];
                const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&token=${FINMIND_TOKEN}`;
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
                const response = await fetch(proxyUrl);
                const rawData = await response.json();
                const json = JSON.parse(rawData.contents);

                if (json.data && json.data.length >= 2) {
                    const latest = json.data[json.data.length - 1].close;
                    const prev = json.data[json.data.length - 2].close;
                    const result = { 
                        price: latest, 
                        changeAmount: (latest - prev).toFixed(2),
                        changePercent: (((latest - prev) / prev) * 100).toFixed(2)
                    };
                    localStorage.setItem(cacheKey, JSON.stringify({ data: result, time: new Date().toLocaleString() }));
                    return result;
                }
                return null;
            } catch (e) {
                const backup = localStorage.getItem(cacheKey);
                return backup ? JSON.parse(backup).data : null;
            }
        }
