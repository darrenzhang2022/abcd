// --- Core Accounting Engine & Supabase Integrated Store --- //

let isCloud = window.SUPABASE_URL && window.SUPABASE_URL !== 'YOUR_SUPABASE_URL';
let supabase = null;

if (isCloud) {
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// Data Store
let accounts = { assets: [], incomes: [], expenses: [], equity: [] };
let journals = [];
let nextId = Math.floor(Math.random() * 1000000);

const formatMoney = (val) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(val);
};

// Initial Memory Fallback Seed
function seedLocalData() {
    accounts = {
        assets: [ { id: 'a1', name: 'Cash (现金)' }, { id: 'a2', name: 'Bank Card' } ],
        incomes: [ { id: 'i1', name: 'Salary (工资)' } ],
        expenses: [ { id: 'e1', name: 'Food (餐饮)' }, { id: 'e2', name: 'Rent (房租)' } ],
        equity: [ { id: 'eq1', name: 'Owner Capital' } ]
    };
    journals = [
        { id: `TX-1`, date: '2023-01-01', type: 'system', fromId: 'eq1', toId: 'a2', amount: 50000, memo: 'Initial Balance', lines: [ { acc: 'a2', amount: 50000 }, { acc: 'eq1', amount: -50000 } ] }
    ];
}

async function loadData() {
    if (!isCloud) {
        console.warn("No Supabase Config found. Using Local Memory Mode.");
        seedLocalData();
        return;
    }

    try {
        // Load Accounts
        const { data: dbAccs, error: e1 } = await supabase.from('accounts').select('*');
        if (e1) throw e1;
        accounts = { assets: [], incomes: [], expenses: [], equity: [] };
        dbAccs.forEach(a => { if (accounts[a.category]) accounts[a.category].push(a); });

        // Load Journals
        const { data: dbJours, error: e2 } = await supabase.from('journals').select('*').order('date', { ascending: true });
        if (e2) throw e2;
        journals = dbJours.map(tx => {
            // Recompute lines artificially for ledger calculation
            let lines = [];
            if (tx.type === 'expense') { lines.push({ acc: tx.to_id, amount: tx.amount }); lines.push({ acc: tx.from_id, amount: -tx.amount }); }
            else if (tx.type === 'income') { lines.push({ acc: tx.to_id, amount: tx.amount }); lines.push({ acc: tx.from_id, amount: -tx.amount }); }
            else if (tx.type === 'transfer') { lines.push({ acc: tx.to_id, amount: tx.amount }); lines.push({ acc: tx.from_id, amount: -tx.amount }); }
            else if (tx.type === 'system') { lines.push({ acc: tx.to_id, amount: tx.amount }); lines.push({ acc: tx.from_id, amount: -tx.amount }); }
            return { id: tx.id, date: tx.date, type: tx.type, fromId: tx.from_id, toId: tx.to_id, amount: tx.amount, memo: tx.memo, lines };
        });
    } catch (err) {
        alert("云数据加载失败: " + err.message);
        seedLocalData(); // fallback
    }
}

async function recordTransaction(date, type, fromId, toId, amount, memo) {
    amount = parseFloat(amount);
    if (!amount || amount <= 0) throw new Error("金额必须大于0 (Amount must be > 0)");
    if (fromId === toId && type === 'transfer') throw new Error("相同账户无法转账 (Cannot transfer to same account)");

    const newId = `TX-${Date.now()}`;
    const txObj = { id: newId, date, type, from_id: fromId, to_id: toId, amount, memo };

    if (isCloud) {
        const { error } = await supabase.from('journals').insert([txObj]);
        if (error) throw new Error("云端保存失败: " + error.message);
    }

    // Update local memory representations smoothly
    let lines = [];
    lines.push({ acc: toId, amount: amount });
    lines.push({ acc: fromId, amount: -amount });
    journals.push({ id: newId, date, type, fromId, toId, amount, memo, lines });
}

async function addAccount(category, name) {
    const id = (category.charAt(0)) + Math.floor(Math.random() * 10000);
    if (isCloud) {
        const { error } = await supabase.from('accounts').insert([{ id, name, category }]);
        if (error) throw new Error("建账失败: " + error.message);
    }
    accounts[category].push({ id, name, category });
}

const getAccountMap = () => {
    const map = {};
    [...accounts.assets, ...accounts.incomes, ...accounts.expenses, ...accounts.equity].forEach(a => map[a.id] = a.name);
    return map;
};

// Calculate all balances
function getLedger() {
    const ledger = {};
    [...accounts.assets, ...accounts.incomes, ...accounts.expenses, ...accounts.equity].forEach(a => ledger[a.id] = 0);
    journals.forEach(tx => {
        tx.lines.forEach(line => { if (ledger[line.acc] !== undefined) ledger[line.acc] += line.amount; });
    });
    return ledger;
}


// --- UI Logic & Controllers --- //

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('today-date').innerText = new Date().toLocaleDateString('zh-CN');
    
    // Load Data
    document.getElementById('view-title').innerText = "加载中 (Loading Cloud)...";
    await loadData();
    document.getElementById('view-title').innerText = "仪表盘概览";
    
    // Nav Switcher
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.view;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
            document.getElementById(`view-${target}`).classList.remove('hidden');

            const titles = { dashboard: '仪表盘概览', entry: '快速记账 (Easy Entry)', reports: '财务状况报表', settings: '科目管理与设置' };
            document.getElementById('view-title').innerText = titles[target];

            if (target === 'dashboard') renderDashboard();
            if (target === 'reports') renderReports();
            if (target === 'settings') renderSettings();
        });
    });

    const populateSelect = (selectEl, dataList) => {
        selectEl.innerHTML = '';
        dataList.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id; opt.innerText = item.name; selectEl.appendChild(opt);
        });
    };

    window.setupFormForType = (type) => {
        document.getElementById('entry-mode').value = type;
        document.getElementById('input-date').valueAsDate = new Date();
        document.getElementById('input-amount').value = '';
        document.getElementById('input-memo').value = '';
        
        const lblFrom = document.getElementById('label-from');
        const lblTo = document.getElementById('label-to');
        const selectFrom = document.getElementById('input-from');
        const selectTo = document.getElementById('input-to');

        if (type === 'expense') {
            lblFrom.innerText = '支出账户 (Pay From)'; lblTo.innerText = '资金去向 (Category)';
            populateSelect(selectFrom, accounts.assets); populateSelect(selectTo, accounts.expenses);
        } else if (type === 'income') {
            lblFrom.innerText = '资金来源 (Income Source)'; lblTo.innerText = '存入账户 (Deposit To)';
            populateSelect(selectFrom, accounts.incomes); populateSelect(selectTo, accounts.assets);
        } else if (type === 'transfer') {
            lblFrom.innerText = '转出账户 (Transfer From)'; lblTo.innerText = '转入账户 (Transfer To)';
            populateSelect(selectFrom, accounts.assets); populateSelect(selectTo, accounts.assets);
        }
    };

    document.querySelectorAll('.tx-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.tx-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            setupFormForType(e.currentTarget.dataset.type);
        });
    });

    document.getElementById('entry-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('entry-mode').value;
        const date = document.getElementById('input-date').value;
        const amount = document.getElementById('input-amount').value;
        const from = document.getElementById('input-from').value;
        const to = document.getElementById('input-to').value;
        const memo = document.getElementById('input-memo').value;

        const btn = e.submitter;
        const originText = btn.innerText;
        btn.innerText = '⏳ 保存中...';
        btn.disabled = true;

        try {
            await recordTransaction(date, type, from, to, amount, memo);
            btn.innerText = '✓ 记账成功!';
            btn.style.background = 'var(--success)';
            setTimeout(() => { btn.innerText = originText; btn.style.background = ''; btn.disabled=false; setupFormForType(type); }, 1000);
        } catch (err) {
            alert(err.message);
            btn.innerText = originText; btn.disabled=false;
        }
    });

    // Report render triggers
    document.querySelectorAll('.rpt-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`report-${e.currentTarget.dataset.report}`).classList.remove('hidden');
        });
    });

    setupFormForType('expense');
    renderDashboard();
    bindSettingEvents();
    bindExportEvents();
});

// Render logic
function renderDashboard() {
    const ledger = getLedger();
    let netWorth = 0, totalIncome = 0, totalExpense = 0;
    accounts.assets.forEach(a => netWorth += ledger[a.id]);
    accounts.incomes.forEach(a => totalIncome += -ledger[a.id]); 
    accounts.expenses.forEach(a => totalExpense += ledger[a.id]); 

    document.getElementById('dash-net-worth').innerText = formatMoney(netWorth);
    document.getElementById('dash-income').innerText = formatMoney(totalIncome);
    document.getElementById('dash-expense').innerText = formatMoney(totalExpense);

    const tb = document.getElementById('recent-tx-table');
    tb.innerHTML = '';
    const accMap = getAccountMap();

    const recent = [...journals].filter(j => j.type !== 'system').reverse().slice(0, 7);
    recent.forEach(tx => {
        let typeLabel = '', amountClass = '';
        if (tx.type === 'expense') { typeLabel = '支出'; amountClass = 'text-red'; }
        if (tx.type === 'income') { typeLabel = '收入'; amountClass = 'text-green'; }
        if (tx.type === 'transfer') { typeLabel = '转账'; }
        tb.innerHTML += `<tr><td class="text-muted" style="font-size:0.9rem">${tx.date}</td><td><span class="date-chip" style="font-size:0.75rem">${typeLabel}</span></td><td>${accMap[tx.fromId]} <span style="opacity:0.5">➔</span> ${accMap[tx.toId]}</td><td>${tx.memo || '-'}</td><td class="text-right ${amountClass}" style="font-family: var(--font-heading); font-weight: 500;">${tx.type === 'income' ? '+' : (tx.type === 'expense'?'-':'')}${formatMoney(tx.amount)}</td></tr>`;
    });
}

function renderReports() {
    const ledger = getLedger();
    let assetsHtml = '', liabsHtml = '<div class="r-row text-muted"><span>无负债记录</span></div>', equityHtml = '';
    let totAssets = 0, totIncome = 0, totExpense = 0, totEquityOrig = 0;

    accounts.assets.forEach(a => { if (ledger[a.id] !== 0) { assetsHtml += `<div class="r-row"><span>${a.name}</span><span>${formatMoney(ledger[a.id])}</span></div>`; totAssets += ledger[a.id]; } });
    accounts.equity.forEach(a => { if (ledger[a.id] !== 0) { equityHtml += `<div class="r-row"><span>${a.name}</span><span>${formatMoney(-ledger[a.id])}</span></div>`; totEquityOrig += -ledger[a.id]; } });
    accounts.incomes.forEach(a => { if (ledger[a.id] !== 0) { totIncome += -ledger[a.id]; } });
    accounts.expenses.forEach(a => { if (ledger[a.id] !== 0) { totExpense += ledger[a.id]; } });

    const netIncome = totIncome - totExpense;
    equityHtml += `<div class="r-row text-green"><span>本期保留盈余 (Net Income)</span><span>${formatMoney(netIncome)}</span></div>`;
    
    document.getElementById('bs-assets').innerHTML = assetsHtml;
    document.getElementById('bs-total-asset').innerText = formatMoney(totAssets);
    document.getElementById('bs-liabs').innerHTML = liabsHtml;
    document.getElementById('bs-total-liab').innerText = formatMoney(0);
    document.getElementById('bs-equity').innerHTML = equityHtml;
    document.getElementById('bs-total-equity').innerText = formatMoney(totEquityOrig + netIncome);
    document.getElementById('bs-total-le').innerText = formatMoney(totEquityOrig + netIncome); 

    let revHtml = '', expHtml = '';
    accounts.incomes.forEach(a => { if (ledger[a.id] !== 0) { revHtml += `<div class="r-row"><span>${a.name}</span><span class="text-green">${formatMoney(-ledger[a.id])}</span></div>`; }});
    accounts.expenses.forEach(a => { if (ledger[a.id] !== 0) { expHtml += `<div class="r-row"><span>${a.name}</span><span>${formatMoney(ledger[a.id])}</span></div>`; }});
    
    document.getElementById('is-revenue').innerHTML = revHtml || '<div class="r-row text-muted">无记录</div>';
    document.getElementById('is-expense').innerHTML = expHtml || '<div class="r-row text-muted">无记录</div>';
    document.getElementById('is-total-rev').innerText = formatMoney(totIncome);
    document.getElementById('is-total-exp').innerText = formatMoney(totExpense);
    document.getElementById('is-net-income').innerText = formatMoney(netIncome);
}

// Settings & Exports
function renderSettings() {
    const renderList = (domId, arr) => {
        document.getElementById(domId).innerHTML = arr.map(a => `<div class="r-row" style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:5px;"><span>${a.name}</span></div>`).join('');
    };
    renderList('set-assets-list', accounts.assets);
    renderList('set-incomes-list', accounts.incomes);
    renderList('set-expenses-list', accounts.expenses);
}

function bindSettingEvents() {
    document.querySelectorAll('.btn-add-acc').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const cat = e.target.dataset.cat;
            let inputId = '';
            if (cat === 'assets') inputId = 'new-asset-name';
            else if (cat === 'incomes') inputId = 'new-income-name';
            else if (cat === 'expenses') inputId = 'new-expense-name';
            
            const input = document.getElementById(inputId);
            const name = input.value.trim();
            if (!name) return alert('请输入科目名称！');

            e.target.innerText = "⏳";
            try {
                await addAccount(cat, name);
                input.value = '';
                renderSettings();
                if(window.setupFormForType) window.setupFormForType(document.getElementById('entry-mode').value);
                alert('科目添加成功!');
            } catch(err) {
                alert(err.message);
            }
            e.target.innerText = "添加";
        });
    });
}

function downloadCSV(csv, filename) {
    const blob = new Blob(["\uFEFF"+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function bindExportEvents() {
    document.querySelectorAll('.btn-export').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.export;
            let csv = '';
            if (type === 'journals') {
                csv = "Transaction ID,Date,Type,From Account,To Account,Amount,Memo\n";
                const accMap = getAccountMap();
                journals.forEach(tx => {
                    const fName = accMap[tx.fromId] || tx.fromId;
                    const tName = accMap[tx.toId] || tx.toId;
                    csv += `${tx.id},${tx.date},${tx.type},"${fName}","${tName}",${tx.amount},"${tx.memo}"\n`;
                });
                downloadCSV(csv, "EasyBook_Raw_Journals.csv");
            } else if (type === 'bs') {
                csv = "Category,Account,Amount\n";
                const ledger = getLedger();
                accounts.assets.forEach(a => { if(ledger[a.id]!==0) csv += `Asset,"${a.name}",${ledger[a.id]}\n`; });
                let eqOrig = 0; accounts.equity.forEach(a => { if(ledger[a.id]!==0) { csv += `Equity,"${a.name}",${-ledger[a.id]}\n`; eqOrig += -ledger[a.id]; }});
                let totInc = 0, totExp = 0;
                accounts.incomes.forEach(a => totInc += -ledger[a.id]);
                accounts.expenses.forEach(a => totExp += ledger[a.id]);
                csv += `Equity,"Net Income",${totInc - totExp}\n\nTotal Assets,,${totInc - totExp + eqOrig}\n`;
                downloadCSV(csv, "EasyBook_Balance_Sheet.csv");
            } else if (type === 'is') {
                csv = "Type,Account,Amount\n";
                const ledger = getLedger();
                let totInc = 0, totExp = 0;
                accounts.incomes.forEach(a => { if(ledger[a.id]!==0) { csv += `Revenue,"${a.name}",${-ledger[a.id]}\n`; totInc += -ledger[a.id]; } });
                accounts.expenses.forEach(a => { if(ledger[a.id]!==0) { csv += `Expense,"${a.name}",${ledger[a.id]}\n`; totExp += ledger[a.id]; } });
                csv += `\nNet Income,,${totInc - totExp}\n`;
                downloadCSV(csv, "EasyBook_Income_Statement.csv");
            }
        });
    });
}
