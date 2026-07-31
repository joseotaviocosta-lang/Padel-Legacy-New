import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';

export function KpiCard({ icon: Icon, label, value, accent = 'primary', sub }) {
  const colors = {
    primary: 'bg-primary/15 text-primary',
    cyan: 'bg-cyan-500/15 text-cyan-400',
    amber: 'bg-amber-500/15 text-amber-400',
    rose: 'bg-rose-500/15 text-rose-400',
    purple: 'bg-purple-500/15 text-purple-400',
    green: 'bg-green-500/15 text-green-400',
  };
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colors[accent] || colors.primary}`}>
          {Icon && <Icon className="h-4 w-4" />}
        </div>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold leading-tight">{label}</span>
      </div>
      <p className="text-xl md:text-2xl font-black tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function HealthBar({ label, value, icon: Icon }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  const textColor = value >= 70 ? 'text-green-400' : value >= 40 ? 'text-amber-400' : 'text-rose-400';
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </span>
        <span className={`text-sm font-black tabular-nums ${textColor}`}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="text-xs font-bold flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

export function DonutChart({ data, colors, height = 200 }) {
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'hsl(228 30% 9%)', border: '1px solid hsl(228 20% 17%)', borderRadius: 12, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, colors, height = 200, horizontal = false }) {
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>;
  const layout = horizontal ? 'vertical' : 'horizontal';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(228 20% 17% / 0.5)" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fill: 'hsl(220 12% 60%)', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220 12% 60%)', fontSize: 10 }} width={80} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fill: 'hsl(220 12% 60%)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'hsl(220 12% 60%)', fontSize: 10 }} />
          </>
        )}
        <Tooltip contentStyle={{ background: 'hsl(228 30% 9%)', border: '1px solid hsl(228 20% 17%)', borderRadius: 12, fontSize: 12 }} cursor={{ fill: 'hsl(228 20% 17% / 0.3)' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}