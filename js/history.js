// js/history.js

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol');

    if (!symbol) {
        alert("找不到股票代號");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('stock-title').innerText = `股票明細: ${symbol}`;
    
    // 確保 API 腳本已加載後執行
    setTimeout(() => {
        loadHistory(symbol);
    }, 100);
});

// 全域編輯狀態
let currentEditData = { table: '', id: '', symbol: '' };

/**
 * 核心功能：載入股票明細、計算損益並渲染看板
 */
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');
    const summaryPanel = document.getElementById('stock-summary-panel');

    // 1. 抓取資料 (市價、交易紀錄、股利)
    const priceInfo = await getLivePrice(symbol);
    const currentPrice = priceInfo ? priceInfo.price : null;

    const [holdingsRes, dividendsRes] = await Promise.all([
        _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: true }),
        _supabase.from('dividends').select('*').eq('symbol', symbol)
    ]);

    const trades = holdingsRes.data || [];
    const dividends = dividendsRes.data || [];

    // 2. 【核心計算區】FIFO 演算法
    let totalShares = 0;
    let realizedProfit = 0;
    let buys = []; // 存放剩餘庫存的成本資訊

    trades.forEach(t => {
        const shares = parseFloat(t.shares);
        const totalPrice = parseFloat(t.total_price);
        
        if (shares > 0) {
            // 買入：記錄每股成本
            buys.push({ remaining: shares, pricePerShare: totalPrice / shares });
            totalShares += shares;
        } else if (shares < 0) {
            // 賣出：依照先進先出扣除
            let sellQty = Math.abs(shares);
            const sellPricePerShare = totalPrice / sellQty;
            totalShares -= sellQty;

            while (sellQty > 0 && buys.length > 0) {
                let first = buys[0];
                if (first.remaining <= sellQty) {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * first.remaining;
                    sellQty -= first.remaining;
                    buys.shift();
                } else {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * sellQty;
                    first.remaining -= sellQty;
                    sellQty = 0;
                }
            }
        }
    });

    // 3. 計算總結數值
    const remainingCost = buys.reduce((sum, b) => sum + (b.pricePerShare * b.remaining), 0);
    const avgCost = totalShares > 0 ? (remainingCost / totalShares) : 0;
    const marketValue = currentPrice ? (totalShares * currentPrice) : 0;
    const unrealizedProfit = totalShares > 0 ? (marketValue - remainingCost) : 0;
    const totalDividends = dividends.reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.fee || 0)), 0);
    const totalNetProfit = realizedProfit + unrealizedProfit + totalDividends;

    // 4. 漲跌樣式處理 (解決 NaN 與重複宣告問題)
    const finalChangePercent = (priceInfo && !isNaN(priceInfo.changePercent)) ? parseFloat(priceInfo.changePercent) : 0;
    const changeColor = finalChangePercent >= 0 ? 'text-red-500' : 'text-green-600';
    const changeIcon = finalChangePercent >= 0 ? '▲' : '▼';
    const profitColor = totalNetProfit >= 0 ? 'text-red-500' : 'text-green-600';

    // 5. 【渲染總結面板】
    if (summaryPanel) {
        summaryPanel.innerHTML = `
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div class="text-xs font-bold text-gray-400 uppercase mb-1">目前股價 / 均價</div>
                <div class="flex items-baseline space-x-2">
                    <span class="text-lg font-black text-slate-700">${currentPrice || '---'}</span>
                    <span class="text-[10px] font-bold ${changeColor}">
                        ${currentPrice ? `${changeIcon}${Math.abs(finalChangePercent).toFixed(2)}%` : ''}
                    </span>
                </div>
                <div class="text-sm font-bold text-slate-400">Avg: $${avgCost.toFixed(2)}</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div class="text-xs font-bold text-gray-400 uppercase mb-1">目前持股 / 市值</div>
                <div class="text-lg font-black text-slate-700">${totalShares.toLocaleString()} 股</div>
                <div class="text-sm font-bold text-blue-600">$${Math.round(marketValue).toLocaleString()}</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div class="text-xs font-bold text-gray-400 uppercase mb-1">累計領取股利</div>
                <div class="text-lg font-black text-emerald-600">$${Math.round(totalDividends).toLocaleString()}</div>
                <div class="text-[10px] text-gray-400">已扣費用</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div class="text-xs font-bold text-gray-400 uppercase mb-1">已實現損益</div>
                <div class="text-lg font-black ${realizedProfit >= 0 ? 'text-red-500' : 'text-green-600'}">$${Math.round(realizedProfit).toLocaleString()}</div>
                <div class="text-[10px] text-gray-400">離場獲利</div>
            </div>

            <div class="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 bg-blue-50/30">
                <div class="text-xs font-bold text-blue-400 uppercase mb-1">總預估損益</div>
                <div class="text-xl font-black ${profitColor}">$${Math.round(totalNetProfit).toLocaleString()}</div>
                <div class="text-[10px] font-bold ${profitColor}">
                    ${totalNetProfit >= 0 ? '▲' : '▼'} ${remainingCost > 0 ? (totalNetProfit/remainingCost*100).toFixed(2) : '0.00'}%
                </div>
            </div>
        `;
    }
    renderTables(trades, dividends, currentPrice);

    // 6. 【渲染交易清單】(顯示順序：最新日期在上)
    const displayTrades = [...trades].reverse();
    tradeBody.innerHTML = displayTrades.map(t => {
        const absShares = Math.abs(t.shares);
        const unitPrice = absShares > 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
        let profitHTML = '<span class="text-gray-400">---</span>';
        
        if (currentPrice && t.shares > 0) {
            const p = (absShares * currentPrice) - t.total_price;
            const color = p >= 0 ? 'text-red-500' : 'text-green-600';
            profitHTML = `<div class="${color} font-bold">$${Math.round(p).toLocaleString()}</div>`;
        } else if (t.shares < 0) {
            profitHTML = '<span class="text-xs text-slate-300 italic bg-slate-100 px-2 py-0.5 rounded">已結算</span>';
        }

        return `
            <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
                <td class="px-4 py-4 text-gray-400 text-xs">${t.trade_date}</td>
                <td class="px-4 py-4 font-bold ${t.shares > 0 ? 'text-red-500' : 'text-green-600'}">${t.shares > 0 ? '買入' : '賣出'}</td>
                <td class="px-4 py-4 text-slate-700">
                    <div class="font-medium">${absShares.toLocaleString()} 股</div>
                    <div class="text-[10px] text-gray-400">@${unitPrice.toFixed(2)}</div>
                </td>
                <td class="px-4 py-4 font-bold text-slate-700">$${Math.round(t.total_price).toLocaleString()}</td>
                <td class="px-4 py-4 text-right">${profitHTML}</td>
                <td class="px-4 py-4 text-right">
                    <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' 
                            class="text-blue-500 font-bold text-xs border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
                        編輯
                    </button>
                </td>
            </tr>`;
    }).join('');

    // 7. 【渲染股利清單】
    const displayDividends = [...dividends].reverse();
    divBody.innerHTML = displayDividends.map(d => `
        <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
            <td class="px-4 py-4 text-gray-400 text-xs">${d.pay_date}</td>
            <td class="px-4 py-4 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
            <td class="px-4 py-4 text-gray-400 text-xs">$${d.fee || 0}</td>
            <td class="px-4 py-4 text-right">
                <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' 
                        class="text-blue-500 font-bold text-xs border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
                    編輯
                </button>
            </td>
        </tr>`).join('');
}
/**
 * 核心功能：渲染趨勢圖 (含資料庫同步機制)
 */
/**
 * 核心功能：渲染趨勢圖 (含資料庫同步機制) - Debug 版
 */
async function renderTrendChart(symbol, trades, dividends) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const loadingMsg = document.getElementById('chart-loading');
    
    try {
        console.log("1. 開始檢查歷史數據狀態...");
        
        // 1. 從 Supabase 抓取資料庫中「最新」的紀錄
        const { data: latestRecord, error: dbError } = await _supabase
            .from('daily_stats')
            .select('date')
            .eq('symbol', symbol)
            .order('date', { ascending: false })
            .limit(1)
            .single();

        if (dbError && dbError.code !== 'PGRST116') { // PGRST116 代表查無資料，非錯誤
            console.error("資料庫讀取錯誤:", dbError);
            loadingMsg.innerText = "資料庫連線錯誤，請檢查 RLS 設定";
            return;
        }

        const lastDbDate = latestRecord ? latestRecord.date : null;
        const today = new Date().toISOString().split('T')[0];
        console.log(`2. 資料庫最新日期: ${lastDbDate || '無 (首次執行)'}`);

        // 2. 決定起始日期
        // trades 陣列在 loadHistory 是按 trade_date 升序排列 (0 是最早, length-1 是最新)
        let startDate = null;
        if (!lastDbDate) {
            if (trades.length > 0) {
                // 修正：從「最早」的一筆交易開始算
                startDate = trades[0].trade_date; 
            } else {
                loadingMsg.innerText = "尚無交易紀錄，無法繪製圖表";
                return;
            }
        } else {
            const d = new Date(lastDbDate);
            d.setDate(d.getDate() + 1);
            startDate = d.toISOString().split('T')[0];
        }

        console.log(`3. 預計補算範圍: ${startDate} ~ ${today}`);

        // 3. 執行同步 (如果 startDate <= today)
        if (startDate <= today) {
            loadingMsg.innerText = `正在同步數據 (${startDate} ~ ${today})...`;
            // 注意：這裡加入了 await 確保同步完成才繼續
            await syncDailyDataToDB(symbol, startDate, today, trades, dividends);
        }

        // 4. 讀取完整歷史資料
        loadingMsg.innerText = "正在繪製圖表...";
        const { data: historyData, error: loadError } = await _supabase
            .from('daily_stats')
            .select('*')
            .eq('symbol', symbol)
            .order('date', { ascending: true })
            .limit(730);

        if (loadError) {
            console.error("讀取歷史失敗:", loadError);
            loadingMsg.innerText = "讀取失敗";
            return;
        }

        if (!historyData || historyData.length === 0) {
            loadingMsg.innerText = "無數據可顯示 (可能是 API 抓不到股價)";
            return;
        }

        loadingMsg.style.display = 'none';
        console.log(`5. 成功讀取 ${historyData.length} 筆資料，開始繪圖`);

        // 5. 繪圖 (先銷毀舊圖表，避免疊加)
        if (window.myTrendChart) {
            window.myTrendChart.destroy();
        }

        const dates = historyData.map(d => d.date);
        const costs = historyData.map(d => d.total_cost);
        const values = historyData.map(d => d.total_value);

        window.myTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: '總權益',
                        data: values,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHitRadius: 10
                    },
                    {
                        label: '投入成本',
                        data: costs,
                        borderColor: 'rgb(100, 116, 139)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHitRadius: 10
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ctx.dataset.label + ': $' + Math.round(ctx.raw).toLocaleString()
                        }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { beginAtZero: false }
                }
            }
        });

    } catch (err) {
        console.error("圖表流程嚴重錯誤:", err);
        loadingMsg.innerText = "發生錯誤，請查看 Console";
    }
}

/**
 * 輔助功能：計算並寫入資料庫
 */
async function syncDailyDataToDB(symbol, startDate, endDate, allTrades, allDividends) {
    const stockId = symbol.split('.')[0];
    console.log(`   -> 呼叫 API 抓取股價: ${stockId}, ${startDate} ~ ${endDate}`);

    // 使用 try-catch 包裹 API 請求
    let prices = [];
    try {
        const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&end_date=${endDate}&token=${FINMIND_TOKEN}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
        
        const res = await fetch(proxyUrl);
        const raw = await res.json();
        
        // 檢查 proxy 回傳狀態
        if (!raw.contents) throw new Error("Proxy 無回應內容");
        
        const json = JSON.parse(raw.contents);
        if (json.msg && json.msg !== 'success') {
            console.error("FinMind API Error:", json.msg);
        }
        
        if (json.data && json.data.length > 0) {
            prices = json.data;
            console.log(`   -> API 抓取成功，共 ${prices.length} 天股價`);
        } else {
            console.warn("   -> API 回傳資料為空 (可能是假日或太過久遠)");
            return;
        }
    } catch (e) {
        console.error("   -> 歷史股價 API 失敗:", e);
        return;
    }

    // 準備寫入資料
    let upsertData = [];
    
    // 為了加速計算，先把 trades 和 dividends 轉為好處理的格式
    // 注意：這裡每次迴圈都重算會比較精確，雖然慢一點點
    for (let p of prices) {
        const currDate = p.date;
        const closePrice = p.close;
        const stats = calculateStatsUntilDate(currDate, allTrades, allDividends, closePrice);
        
        upsertData.push({
            symbol: symbol,
            date: currDate,
            total_cost: stats.totalCost,
            total_value: stats.totalValue
        });
    }

    // 分批寫入 (避免一次寫入太大包被 Supabase 拒絕)
    if (upsertData.length > 0) {
        // 一次寫入 100 筆
        const BATCH_SIZE = 100;
        for (let i = 0; i < upsertData.length; i += BATCH_SIZE) {
            const batch = upsertData.slice(i, i + BATCH_SIZE);
            const { error } = await _supabase
                .from('daily_stats')
                .upsert(batch, { onConflict: 'symbol, date' });
            
            if (error) {
                console.error("   -> DB 寫入失敗:", error);
            } else {
                console.log(`   -> 成功寫入批次 ${i} ~ ${i + batch.length}`);
            }
        }
    }
}
/**
 * 純邏輯計算：給定日期與股價，算出當下的資產狀況
 * (這會複用 loadHistory 的 FIFO 邏輯，但只計算到特定日期)
 */
function calculateStatsUntilDate(targetDate, trades, dividends, currentPrice) {
    // 1. 篩選出該日期(含)以前的紀錄
    const validTrades = trades.filter(t => t.trade_date <= targetDate);
    const validDividends = dividends.filter(d => d.pay_date <= targetDate);

    // 2. FIFO 計算
    let totalShares = 0;
    let realizedProfit = 0;
    let buys = [];

    // 注意：trades 傳進來時是按照日期降序的 (newest first)，計算 FIFO 需要升序 (oldest first)
    // 這裡我們用 [...validTrades].reverse() 轉成升序
    [...validTrades].reverse().forEach(t => {
        const shares = parseFloat(t.shares);
        const totalPrice = parseFloat(t.total_price);
        
        if (shares > 0) {
            buys.push({ remaining: shares, pricePerShare: totalPrice / shares });
            totalShares += shares;
        } else {
            let sellQty = Math.abs(shares);
            const sellPricePerShare = totalPrice / sellQty;
            totalShares -= sellQty;

            while (sellQty > 0 && buys.length > 0) {
                let first = buys[0];
                if (first.remaining <= sellQty) {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * first.remaining;
                    sellQty -= first.remaining;
                    buys.shift();
                } else {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * sellQty;
                    first.remaining -= sellQty;
                    sellQty = 0;
                }
            }
        }
    });

    // 3. 計算結果
    const remainingCost = buys.reduce((sum, b) => sum + (b.pricePerShare * b.remaining), 0);
    const marketValue = totalShares * currentPrice;
    const totalDivs = validDividends.reduce((sum, d) => sum + (parseFloat(d.amount) - (d.fee || 0)), 0);
    
    // 總權益 = 目前市值 + 已落袋為安(已實現損益) + 已領股利
    // 這代表如果今天全部清倉，手上會有的總資金變化 (相較於原始投入)
    // 或是你想顯示：總權益 = 原始成本 + 總損益
    // 這裡我們定義 total_value = (市值 - 成本) + 成本 + 已實現 + 股利 = 市值 + 已實現 + 股利
    const totalValue = marketValue + realizedProfit + totalDivs;

    return {
        totalCost: remainingCost,
        totalValue: totalValue
    };
}
