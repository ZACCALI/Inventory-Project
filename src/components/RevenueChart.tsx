'use client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface MonthlyData {
  month: string;
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
  orders: number;
  collections: number;
}

export default function RevenueChart({ data, formatCurrency }: { data: MonthlyData[], formatCurrency: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0061FF" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#0061FF" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#2ECC71" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8ECF0" />
        <XAxis dataKey="month" tick={{ fill: '#7F8C8D', fontSize: 12 }} />
        <YAxis tick={{ fill: '#7F8C8D', fontSize: 12 }} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name).charAt(0).toUpperCase() + String(name).slice(1)]} />
        <Area type="monotone" dataKey="revenue" stroke="#0061FF" fillOpacity={1} fill="url(#colorRevenue)" />
        <Area type="monotone" dataKey="profit" stroke="#2ECC71" fillOpacity={1} fill="url(#colorProfit)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
