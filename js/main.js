        async function loadDetailData() {
            const list = document.getElementById('stock-list');
            const totalAssetsDisplay = document.getElementById('total-assets');
            list.innerHTML = "<tr><td colspan='8' class='p-12 text-center text-gray-400 animate-pulse'>資料加載中...</td></tr>";

            try {
                const [holdingsRes, dividendsRes] = await Promise.all([
                    _supabase.from('holdings').select('*').order('trade_date', { ascending: true }),
                    _supabase.from('dividends').select('*')
                ]);

                const groupedData = {};
                holdingsRes.data.forEach(item => {
                    const symbol = item.symbol;
                    if (!groupedData[symbol]) groupedData[symbol] = { symbol, buys: [], totalShares: 0, realizedProfit: 0 };
                    const group = groupedData[symbol];
                    const shares = parseFloat(item.shares);
                    const totalPrice = parseFloat(item.total_price);

                    if (shares > 0) { 
                        group.buys.push({ remainingShares: shares, pricePerShare: totalPrice / shares });
                        group.totalShares += shares;
                    } else {
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

                let tableRows = "";
                let grandTotalMarketValue = 0;

                for (const symbol in groupedData) {
                    const group = groupedData[symbol];
                    const priceInfo = await getLivePrice(symbol);
                    const price = priceInfo?.price || null;
                    const changeAmount = priceInfo ? (priceInfo.changeAmount || 0) : 0;
                    const changePercent = priceInfo ? (priceInfo.changePercent || 0) : 0;

                    const currentRemainingCost = group.buys.reduce((sum, b) => sum + (b.pricePerShare * b.remainingShares), 0);
                    const avgPrice = group.totalShares > 0 ? (currentRemainingCost / group.totalShares) : 0;
                    const marketVal = price ? (price * group.totalShares) : 0;
                    
                    const stockDividends = (dividendsRes.data || [])
                        .filter(d => d.symbol === symbol)
                        .reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.fee || 0)), 0);

                    const unrealizedProfit = group.totalShares > 0 ? (marketVal - currentRemainingCost) : 0;
                    const unrealizedPercent = currentRemainingCost > 0 ? (unrealizedProfit / currentRemainingCost * 100).toFixed(2) : "0.00";
                    const totalProfit = unrealizedProfit + group.realizedProfit + stockDividends;
                    const totalPercent = currentRemainingCost > 0 ? (totalProfit / currentRemainingCost * 100).toFixed(2) : "0.00";

                    grandTotalMarketValue += marketVal;

                    // 符號判斷
                    const isUp = changePercent > 0;
                    const isDown = changePercent < 0;
                    const dailyColor = isUp ? 'text-red-500' : (isDown ? 'text-green-600' : 'text-gray-500');
                    const priceSign = isUp ? '▲' : (isDown ? '▼' : '');

                    tableRows += `
                        <tr class="hover:bg-gray-50 border-b transition">
                            <td class="px-4 py-4 font-bold">${symbol}</td>
                            <td class="px-4 py-4">
                                <div class="flex items-baseline space-x-1">
                                    <span class="text-emerald-600 font-bold">${price ? '$' + price.toLocaleString() : '---'}</span>
                                    ${price ? `<span class="${dailyColor} text-[10px] font-bold">${priceSign}${Math.abs(changeAmount).toFixed(2)} (${Math.abs(changePercent).toFixed(2)}%)</span>` : ''}
                                </div>
                                <div class="text-[10px] text-gray-400 mt-1">均價 $${avgPrice.toFixed(2)}</div>
                            </td>
                            <td class="px-4 py-4 text-center">${group.totalShares.toLocaleString()}</td>
                            <td class="px-4 py-4 text-right">
                                <div class="font-bold">$${Math.round(marketVal).toLocaleString()}</div>
                                <div class="text-[10px] text-gray-400">成本 $${Math.round(currentRemainingCost).toLocaleString()}</div>
                            </td>
                            <td class="px-4 py-4 text-right text-blue-600">$${Math.round(group.realizedProfit + stockDividends).toLocaleString()}</td>
                            <td class="px-4 py-4 text-right ${unrealizedProfit >= 0 ? 'text-red-500' : 'text-green-600'}">
                                <div class="font-bold">$${Math.round(unrealizedProfit).toLocaleString()}</div>
                                <div class="text-[10px]">${unrealizedProfit >= 0 ? '▲' : '▼'} ${unrealizedPercent}%</div>
                            </td>
                            <td class="px-4 py-4 text-right ${totalProfit >= 0 ? 'text-red-500' : 'text-green-600'}">
                                <div class="font-bold text-base">$${Math.round(totalProfit).toLocaleString()}</div>
                                <div class="text-[10px]">${totalProfit >= 0 ? '▲' : '▼'} ${totalPercent}%</div>
                            </td>
                            <td class="px-4 py-4 text-right"><button class="bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold">明細</button></td>
                        </tr>`;
                }
                list.innerHTML = tableRows || "<tr><td colspan='8' class='p-8 text-center'>尚無紀錄</td></tr>";
                totalAssetsDisplay.innerText = `$ ${Math.round(grandTotalMarketValue).toLocaleString()}`;
            } catch (err) { console.error(err); }
        }
        document.addEventListener('DOMContentLoaded', loadDetailData);
