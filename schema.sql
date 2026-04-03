-- Supabase Schema for EasyBook
-- 1. 禁用不需要的特性，创建基础账本数据模型

-- 创建账户表 Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL -- 'assets', 'incomes', 'expenses', 'equity'
);

-- 创建记账凭证表 Journals
CREATE TABLE IF NOT EXISTS journals (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    type TEXT NOT NULL, -- 'expense', 'income', 'transfer', 'system'
    from_id TEXT REFERENCES accounts(id),
    to_id TEXT REFERENCES accounts(id),
    amount DECIMAL(15, 2) NOT NULL,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 初始化基础默认账户数据
INSERT INTO accounts (id, name, category) VALUES
('a1', 'Cash (现金)', 'assets'),
('a2', 'Bank Card (银行卡)', 'assets'),
('a3', 'Alipay/WeChat (支付宝/微信)', 'assets'),
('i1', 'Salary (工资收入)', 'incomes'),
('i2', 'Sales (销售收入)', 'incomes'),
('i3', 'Investment (投资收益)', 'incomes'),
('i4', 'Other Income (其它收入)', 'incomes'),
('e1', 'Food & Dining (餐饮美食)', 'expenses'),
('e2', 'Housing & Rent (住宿房租)', 'expenses'),
('e3', 'Transport (交通出行)', 'expenses'),
('e4', 'Shopping (购物消费)', 'expenses'),
('e5', 'Utilities/Bills (水电杂费)', 'expenses'),
('eq1', 'Owner Capital (初始资本/净值)', 'equity'),
('eq2', 'Retained Earnings (留存收益)', 'equity')
ON CONFLICT (id) DO NOTHING;

-- 设置安全策略（为本次演示项目，允许匿名读写）
-- 注意：如果是真实生产环境，请开启并且绑定 Auth 用户的 RLS 规则
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for anon users on accounts" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon users on journals" ON journals FOR ALL USING (true) WITH CHECK (true);
