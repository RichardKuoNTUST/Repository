        function openModal() {
            document.getElementById('addModal').classList.remove('hidden');
            document.getElementById('addModal').classList.add('flex');
            document.getElementById('trade-date').value = new Date().toISOString().split('T')[0];
        }
        function closeModal() {
            document.getElementById('addModal').classList.add('hidden');
            document.getElementById('addModal').classList.remove('flex');
        }
        async function openDividendModal() {
            document.getElementById('dividendModal').classList.remove('hidden');
            document.getElementById('dividendModal').classList.add('flex');
            const { data } = await _supabase.from('holdings').select('symbol');
            const uniqueSymbols = [...new Set(data.map(h => h.symbol))];
            document.getElementById('div-stock-symbol').innerHTML = uniqueSymbols.map(s => `<option value="${s}">${s}</option>`).join('');
            document.getElementById('div-date').value = new Date().toISOString().split('T')[0];
        }
        function closeDividendModal() {
            document.getElementById('dividendModal').classList.add('hidden');
            document.getElementById('dividendModal').classList.remove('flex');
        }
