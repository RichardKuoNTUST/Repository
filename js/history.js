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

// 趨勢圖邏輯 (含補算與繪製)
async function renderTrendChart(symbol, trades, dividends) {
    
    const ctx = document.getElementById('trendChart').getContext('2d');
    const loadingMsg = document.getElementById('chart-loading');
    
    try {
        // 修改 renderTrendChart 內部的前幾行
        const { data: records, error: dbError } = await _supabase
            .from('daily_stats')
            .select('date')
            .eq('symbol', symbol)
            .order('date', { ascending: false })
            .limit(1); // 取消 .single() 改用 limit(1)
        
        if (dbError) {
            console.error("資料庫讀取錯誤 (406 可能是欄位名稱不符):", dbError);
            loadingMsg.innerText = "資料庫連線錯誤，請確認 SQL 表格已建立";
            return;
        }
        
        const lastDbDate = (records && records.length > 0) ? records[0].date : null;

        const lastDbDate = latestRecord ? latestRecord.date : null;
        const today = new Date().toISOString().split('T')[0];

        let startDate = null;
        if (!lastDbDate) {
            if (trades.length > 0) {
                startDate = trades[0].trade_date; // 從第一筆交易日開始
            } else {
                loadingMsg.innerText = "尚無交易紀錄";
                return;
            }
        } else {
            const d = new Date(lastDbDate);
            d.setDate(d.getDate() + 1);
            startDate = d.toISOString().split('T')[0];
        }

        // 如果需要同步新天數
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
            loadingMsg.innerText = "無歷史股價數據";
            return;
        }

        loadingMsg.style.display = 'none';

        if (window.myTrendChart) window.myTrendChart.destroy();
        window.myTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historyData.map(d => d.date),
                datasets: [
                    {
                        label: '總權益',
                        data: historyData.map(d => d.total_value),
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: '投入成本',
                        data: historyData.map(d => d.total_cost),
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
                scales: { x: { display: false }, y: { beginAtZero: false } }
            }
        });
    } catch (err) {
        console.error("圖表錯誤:", err);
    }
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
