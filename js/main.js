/**
 * main.js - 核心損益計算與數據渲染邏輯
 */

// 當 DOM 加載完成後啟動
document.addEventListener('DOMContentLoaded', () => {
    loadDetailData();
});

async function loadDetailData() {
    const list = document.getElementById('stock-list');
    const totalAssetsDisplay = document.getElementById('total-assets');
    
    // 顯示載入中狀態
    list.innerHTML = `
        <tr>
            <td colspan="8" class="p-12 text-center text-gray-400 animate-pulse">
                <div class="flex flex-col items-center">
                    <span class="text-sm font-medium">正在計算精準損益...</span>
                </div>
            </td>
        </tr>`;

    try {
        // 1. 同步抓取持股與股利資料
        const [holdingsRes, dividendsRes] = await Promise.all([
            _supabase.from('holdings').select('*').order('trade_date', { ascending: true }),
            _supabase.from('dividends').select('*')
        ]);

        if (holdingsRes.error) throw holdingsRes.error;

        // 2. FIFO 演算法邏輯：計算剩餘股數與平均成本
        const groupedData = {};
        holdingsRes.data.forEach(item => {
            const symbol = item.symbol;
            if (!groupedData[symbol]) {
                groupedData[symbol] = { symbol, buys: [], totalShares: 0, realizedProfit: 0 };
            }
            const group = groupedData[symbol];
            const shares = parseFloat(item.shares);
            const totalPrice = parseFloat(item.total_price);

            if (shares > 0) { 
                // 買入紀錄
                group.buys.push({ remainingShares: shares, pricePerShare: totalPrice / shares });
                group.totalShares += shares;
            } else if (shares < 0) {
                // 賣出紀錄 (執行 FIFO)
                let sellQty = Math.abs(shares);
                const sellPricePerShare = totalPrice / sellQty;
                group.totalShares -= sellQty;
                
                while (sellQty > 0 && group.buys.length > 0) {
                    let firstBuy = group.buys[0];
                    if (firstBuy.remainingShares <= sellQty) {
                        group.realizedProfit += (sellPricePerShare - firstBuy.pricePerShare) * firstBuy.remainingShares;
                        sellQty -= firstBuy.remainingShares;
                        group.buys.shift();
                    } else {
                        group.realizedProfit += (sellPricePerShare - firstBuy.pricePerShare) * sellQty;
                        firstBuy.remainingShares -= sellQty;
                        sellQty = 0;
                    }
                }
            }
        });

        // 3. 遍歷每支股票，結合即時股價計算
        let tableRows = "";
        let grandTotalMarketValue = 0;

        for (const symbol in groupedData) {
            const group = groupedData[symbol];
            if (group.totalShares <= 0 && group.realizedProfit === 0) continue; // 過濾掉已清空且無損益的

            const priceInfo = await getLivePrice(symbol);
            const price = priceInfo ? priceInfo.price : null;
            const changeAmount = priceInfo ? (priceInfo.changeAmount || 0) : 0;
            const changePercent = priceInfo ? (priceInfo.changePercent || 0) : 0;

            // 計算現有庫存成本
            const currentRemainingCost = group.buys.reduce((sum, b) => sum + (b.pricePerShare * b.remainingShares), 0);
            const avgPrice = group.totalShares > 0 ? (currentRemainingCost / group.totalShares) : 0;
            const marketVal = price ? (price * group.totalShares) : 0;
            
            // 計算該股總股利
            const stockDividends = (dividendsRes.data || [])
                .filter(d => d.symbol === symbol)
                .reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.fee || 0)), 0);

            // 未實現損益 (現值 - 剩餘成本)
            const unrealizedProfit = group.totalShares > 0 ? (marketVal - currentRemainingCost) : 0;
            const unrealizedPercent = currentRemainingCost > 0 ? (unrealizedProfit / currentRemainingCost * 100).toFixed(2) : "0.00";

            // 總獲利 (未實現 + 已實現 + 股利)
            const totalRealized = group.realizedProfit + stockDividends;
            const totalProfit = unrealizedProfit + totalRealized;
            const totalPercent = currentRemainingCost > 0 ? (totalProfit / currentRemainingCost * 100).toFixed(2) : "0.00";

            grandTotalMarketValue += marketVal;

            // --- 介面顏色與符號判定 ---
            const isUp = changePercent > 0;
            const isDown = changePercent < 0;
            const dailyColor = isUp ? 'text-red-500' : (isDown ? 'text-green-600' : 'text-gray-500');
            const dailySign = isUp ? '▲' : (isDown ? '▼' : '');

            const unColor = unrealizedProfit >= 0 ? 'text-red-500' : 'text-green-600';
            const totalColor = totalProfit >= 0 ? 'text-red-500' : 'text-green-600';

            tableRows += `
                <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
                    <td class="px-4 py-4 font-bold text-slate-700">${symbol}</td>
                    <td class="px-4 py-4">
                        <div class="flex items-baseline space-x-1">
                            <span class="text-emerald-600 font-bold">${price ? '$' + price.toLocaleString() : '---'}</span>
                            ${price ? `
                                <span class="${dailyColor} text-[10px] font-bold">
                                    ${dailySign}${Math.abs(changeAmount).toFixed(2)} (${Math.abs(changePercent).toFixed(2)}%)
                                </span>
                            ` : ''}
                        </div>
                        <div class="text-[10px] text-gray-400 font-medium mt-1">均價 $${avgPrice.toFixed(2)}</div>
                    </td>
                    <td class="px-4 py-4 text-center font-medium text-slate-600">${group.totalShares.toLocaleString()}</td>
                    <td class="px-4 py-4 text-right">
                        <div class="font-bold text-slate-800">$${Math.round(marketVal).toLocaleString()}</div>
                        <div class="text-[10px] text-gray-400">成本 $${Math.round(currentRemainingCost).toLocaleString()}</div>
                    </td>
                    <td class="px-4 py-4 text-right text-blue-600 font-medium">$${Math.round(totalRealized).toLocaleString()}</td>
                    <td class="px-4 py-4 text-right">
                        <div class="${unColor} font-bold">$${Math.round(unrealizedProfit).toLocaleString()}</div>
                        <div class="${unColor} text-[10px] font-bold">${unrealizedProfit >= 0 ? '▲' : '▼'} ${unrealizedPercent}%</div>
                    </td>
                    <td class="px-4 py-4 text-right">
                        <div class="${totalColor} font-black text-base">$${Math.round(totalProfit).toLocaleString()}</div>
                        <div class="${totalColor} text-[10px] font-bold">${totalProfit >= 0 ? '▲' : '▼'} ${totalPercent}%</div>
                    </td>
                    <td class="px-4 py-4 text-right">
                        <button onclick='alert("明細功能開發中")' class="bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 hover:text-white transition">
                            明細
                        </button>
                    </td>
                </tr>`;
        }

        // 更新畫面
        list.innerHTML = tableRows || "<tr><td colspan='8' class='p-8 text-center text-gray-400'>尚無持股紀錄，請點擊右上方新增</td></tr>";
        totalAssetsDisplay.innerText = `$ ${Math.round(grandTotalMarketValue).toLocaleString()}`;

    } catch (err) {
        console.error("資料加載失敗:", err);
        list.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">載入失敗: ${err.message}</td></tr>`;
    }
}

// 供其他檔案調用重新整理介面
window.refreshData = loadDetailData;
