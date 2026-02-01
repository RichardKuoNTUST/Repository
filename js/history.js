document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol');

    if (!symbol) {
        alert("找不到股票代號");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('stock-title').innerText = `股票明細: ${symbol}`;
    
    // 確保環境準備好後載入
    setTimeout(() => {
        loadHistory(symbol);
    }, 100);
});

let currentEditData = { table: '', id: '', symbol: '' };

/**
 * 核心功能：載入股票明細、計算損益並渲染看板
 */
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');
    const summaryPanel = document.getElementById('stock-summary-panel');

    // 1. 抓取即時資料與資料庫紀錄
    const priceInfo = await getLivePrice(symbol);
    const currentPrice = priceInfo ? priceInfo.price : null;

    const [holdingsRes, dividendsRes] = await Promise.all([
        _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: true }),
        _supabase.from('dividends').select('*').eq('symbol', symbol)
    ]);

    const trades = holdingsRes.data || [];
    const dividends = dividendsRes.data || [];

    // 2. FIFO 演算法計算當前狀態
    let totalShares = 0;
    let realizedProfit = 0;
    let buys = [];

    trades.forEach(t => {
        const shares = parseFloat(t.shares);
        const totalPrice = parseFloat(t.total_price);
        
        if (shares > 0) {
            buys.push({ remaining: shares, pricePerShare: totalPrice / shares });
            totalShares += shares;
        } else if (shares < 0) {
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

    // 3. 計算各項統計數值
    const remainingCost = buys.reduce((sum, b) => sum + (b.pricePerShare * b.remaining), 0);
    const avgCost = totalShares > 0 ? (remainingCost / totalShares) : 0;
    const marketValue = currentPrice ? (totalShares * currentPrice) : 0;
    const unrealizedProfit = totalShares > 0 ? (marketValue - remainingCost) : 0;
    const totalDividends = dividends.reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.fee || 0)), 0);
    const totalNetProfit = realizedProfit + unrealizedProfit + totalDividends;

    const finalChangePercent = (priceInfo && !isNaN(priceInfo.changePercent)) ? parseFloat(priceInfo.changePercent) : 0;
    const changeColor = finalChangePercent >= 0 ? 'text-red-500' : 'text-green-600';
    const changeIcon = finalChangePercent >= 0 ? '▲' : '▼';
    const profitColor = totalNetProfit >= 0 ? 'text-red-500' : 'text-green-600';

    // 4. 渲染總結面板
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
            </div>
            <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div class="text-xs font-bold text-gray-400 uppercase mb-1">已實現損益</div>
                <div class="text-lg font-black ${realizedProfit >= 0 ? 'text-red-500' : 'text-green-600'}">$${Math.round(realizedProfit).toLocaleString()}</div>
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

    // 5. 渲染表格紀錄
    renderHistoryTables(tradeBody, divBody, trades, dividends, currentPrice);

    // --- 關鍵：啟動圖表流程 ---
    await renderTrendChart(symbol, trades, dividends);
}

function renderHistoryTables(tradeBody, divBody, trades, dividends, currentPrice) {
    const displayTrades = [...trades].reverse();
    tradeBody.innerHTML = displayTrades.map(t => {
        const absShares = Math.abs(t.shares);
        const unitPrice = absShares > 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
        let profitHTML = t.shares > 0 && currentPrice 
            ? `<div class="${(absShares * currentPrice - t.total_price) >= 0 ? 'text-red-500' : 'text-green-600'} font-bold">$${Math.round(absShares * currentPrice - t.total_price).toLocaleString()}</div>`
            : '<span class="text-gray-400">---</span>';

        return `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="px-4 py-4 text-xs text-gray-400">${t.trade_date}</td>
                <td class="px-4 py-4 font-bold ${t.shares > 0 ? 'text-red-500' : 'text-green-600'}">${t.shares > 0 ? '買入' : '賣出'}</td>
                <td class="px-4 py-4 text-slate-700">
                    <div>${absShares.toLocaleString()} 股</div>
                    <div class="text-[10px] text-gray-400">@${unitPrice.toFixed(2)}</div>
                </td>
                <td class="px-4 py-4 font-bold">$${Math.round(t.total_price).toLocaleString()}</td>
                <td class="px-4 py-4 text-right">${profitHTML}</td>
                <td class="px-4 py-4 text-right">
                    <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' class="text-blue-500 text-xs border border-blue-100 px-3 py-1.5 rounded-lg">編輯</button>
                </td>
            </tr>`;
    }).join('');

    const displayDividends = [...dividends].reverse();
    divBody.innerHTML = displayDividends.map(d => `
        <tr class="hover:bg-gray-50 border-b border-gray-50">
            <td class="px-4 py-4 text-xs text-gray-400">${d.pay_date}</td>
            <td class="px-4 py-4 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
            <td class="px-4 py-4 text-gray-400 text-xs">$${d.fee || 0}</td>
            <td class="px-4 py-4 text-right">
                <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' class="text-blue-500 text-xs border border-blue-100 px-3 py-1.5 rounded-lg">編輯</button>
            </td>
        </tr>`).join('');
}

// 全域變數，用來儲存從資料庫抓下來的完整歷史
let fullHistoryData = [];

async function renderTrendChart(symbol, trades, dividends) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const loadingMsg = document.getElementById('chart-loading');
    
    try {
        console.log("1. 開始檢查歷史數據狀態...");
        
        // --- 修正區域：確保變數只宣告一次 ---
        const { data: records, error: dbError } = await _supabase
            .from('daily_stats')
            .select('date')
            .eq('symbol', symbol)
            .order('date', { ascending: false })
            .limit(1);

        if (dbError) {
            console.error("資料庫讀取錯誤:", dbError);
            loadingMsg.innerText = "資料庫連線錯誤";
            return;
        }

        // 這裡宣告一次就好
        const lastDbDate = (records && records.length > 0) ? records[0].date : null;
        // ----------------------------------

        const today = new Date().toISOString().split('T')[0];
        console.log(`2. 資料庫最新日期: ${lastDbDate || '無'}`);

        let startDate = null;
        if (!lastDbDate) {
            if (trades.length > 0) {
                // 注意：這裡直接抓 trades[0].trade_date，前提是 trades 已經是升序
                startDate = trades[0].trade_date; 
            } else {
                loadingMsg.innerText = "尚無交易紀錄";
                return;
            }
        } else {
            const d = new Date(lastDbDate);
            d.setDate(d.getDate() + 1);
            startDate = d.toISOString().split('T')[0];
        }

        if (startDate <= today) {
            loadingMsg.innerText = `正在更新數據...`;
            await syncDailyDataToDB(symbol, startDate, today, trades, dividends);
        }
        
        const { data: historyData } = await _supabase
            .from('daily_stats')
            .select('*')
            .eq('symbol', symbol)
            .order('date', { ascending: true })
            .limit(730);

        if (!historyData || historyData.length === 0) {
            loadingMsg.innerText = "無歷史數據";
            return;
        }

        fullHistoryData = historyData;
        loadingMsg.style.display = 'none';

        // --- 關鍵：確保這行在最後執行 ---
        updateChartRange('5D'); 

    } catch (err) {
        console.error("圖表錯誤:", err);
    }
}

// 抽取出來的繪圖邏輯，讓代碼更整潔
function renderLineChart(ctx, data) {
    if (window.myTrendChart) window.myTrendChart.destroy();
    window.myTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [
                {
                    label: '總權益',
                    data: data.map(d => d.total_value),
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: '投入成本',
                    data: data.map(d => d.total_cost),
                    borderColor: 'rgb(100, 116, 139)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { x: { display: false }, y: { beginAtZero: false } }
        }
    });
}

async function syncDailyDataToDB(symbol, startDate, endDate, allTrades, allDividends) {
    const stockId = symbol.split('.')[0];
    try {
        const finMindUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&end_date=${endDate}&token=${FINMIND_TOKEN}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(finMindUrl)}`;
        const res = await fetch(proxyUrl);
        const raw = await res.json();
        const json = JSON.parse(raw.contents);

        if (json.data && json.data.length > 0) {
            let upsertData = json.data.map(p => {
                const stats = calculateStatsUntilDate(p.date, allTrades, allDividends, p.close);
                return {
                    symbol: symbol,
                    date: p.date,
                    total_cost: stats.totalCost,
                    total_value: stats.totalValue
                };
            });

            await _supabase.from('daily_stats').upsert(upsertData, { onConflict: 'symbol, date' });
        }
    } catch (e) {
        console.error("API 同步失敗", e);
    }
}

function calculateStatsUntilDate(targetDate, trades, dividends, currentPrice) {
    const validTrades = trades.filter(t => t.trade_date <= targetDate);
    const validDividends = dividends.filter(d => d.pay_date <= targetDate);

    let totalShares = 0;
    let realizedProfit = 0;
    let buys = [];

    validTrades.forEach(t => {
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

    const remainingCost = buys.reduce((sum, b) => sum + (b.pricePerShare * b.remaining), 0);
    const totalValue = (totalShares * currentPrice) + realizedProfit + validDividends.reduce((sum, d) => sum + (parseFloat(d.amount) - (d.fee || 0)), 0);

    return { totalCost: remainingCost, totalValue: totalValue };
}

/**
 * 切換時間範圍的函式
 */
function updateChartRange(range) {
    if (!fullHistoryData || fullHistoryData.length === 0) return;

    // 更新按鈕樣式
    const buttons = document.querySelectorAll('#chart-filter-group button');
    buttons.forEach(btn => {
        btn.className = "px-3 py-1.5 rounded-lg transition hover:bg-white";
        if (btn.getAttribute('data-range') === range) {
            btn.className = "px-3 py-1.5 rounded-lg transition bg-white text-blue-600 shadow-sm";
        }
    });

    // 計算篩選日期
    const now = new Date();
    let filterDate = new Date();
    let tickStep = 1; // 預設每 1 點顯示一個標籤

    switch(range) {
        case '5D': filterDate.setDate(now.getDate() - 5); break;
        case '1M': filterDate.setMonth(now.getMonth() - 1); break;
        case '3M': filterDate.setMonth(now.getMonth() - 3); break;
        case '6M': filterDate.setMonth(now.getMonth() - 6); break;
        case '1Y': filterDate.setFullYear(now.getFullYear() - 1); break;
        case '2Y': filterDate.setFullYear(now.getFullYear() - 2); break;
    }

    const filteredData = fullHistoryData.filter(d => new Date(d.date) >= filterDate);
    
    // 渲染圖表
    renderFilteredChart(filteredData, range);
}

function renderFilteredChart(data, range) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (window.myTrendChart) window.myTrendChart.destroy();

    window.myTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [
                {
                    label: '總權益',
                    data: data.map(d => d.total_value),
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: range === '5D' ? 5 : 0, // 5天模式下點大一點
                    pointBackgroundColor: 'rgb(239, 68, 68)'
                },
                {
                    label: '投入成本',
                    data: data.map(d => d.total_cost),
                    borderColor: 'rgb(100, 116, 139)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    ticks: {
                        autoSkip: range !== '5D', // 5D 模式下「不」自動跳過任何標籤
                        maxRotation: 45, // 日期多時稍微傾斜
                        minRotation: 0,
                        callback: function(val, index) {
                            const dateStr = this.getLabelForValue(val); // 格式如 "2024-05-20"
                            const date = new Date(dateStr);
                            const m = date.getMonth() + 1;
                            const d = date.getDate();

                            // --- 5天模式：強迫回傳每一天的 月/日 ---
                            if (range === '5D') {
                                return `${m}/${d}`; 
                            }
                            
                            // 1個月：每週標示 (1, 8, 15, 22, 29 號)
                            if (range === '1M') {
                                return [1, 8, 15, 22, 29].includes(d) ? `${m}/${d}` : null;
                            }
                            
                            // 3個月：每兩週標示 (1, 15 號)
                            if (range === '3M') {
                                return [1, 15].includes(d) ? `${m}/${d}` : null;
                            }
                            
                            // 6個月：每個月標示
                            if (range === '6M') {
                                return d === 1 ? `${m}月` : null;
                            }
                            
                            // 1年：每兩個月標示
                            if (range === '1Y') {
                                return (d === 1 && m % 2 !== 0) ? `${m}月` : null;
                            }
                            
                            // 2年：每三個月標示
                            if (range === '2Y') {
                                return (d === 1 && [1, 4, 7, 10].includes(m)) ? `${m}月` : null;
                            }
                            return null;
                        }
                    },
                    grid: {
                        display: range === '5D' // 5天模式顯示垂直線，更有對齊感
                    }
                },
                y: {
                    position: 'right',
                    ticks: {
                        callback: (val) => '$' + Math.round(val).toLocaleString()
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}
