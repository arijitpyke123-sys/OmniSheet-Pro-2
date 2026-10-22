import React, { useState } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { SheetCells, evaluateFormula } from '../utils/formulaEngine';
import { 
  BarChart, Bar, LineChart as RechartsLine, Line, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, AreaChart, Area
} from 'recharts';

interface ChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cells: SheetCells;
  theme?: 'dark' | 'light';
}

const COLORS = ['#10b981', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7', '#ec4899'];

export const ChartModal: React.FC<ChartModalProps> = ({ isOpen, onClose, cells, theme = 'dark' }) => {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'area'>('bar');
  const [labelCol, setLabelCol] = useState('A');
  const [valueCol, setValueCol] = useState('B');
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow] = useState(10);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  // Gather data points from cells
  const data: Array<{ name: string; value: number }> = [];
  for (let r = startRow; r <= endRow; r++) {
    const labelKey = `${labelCol}${r}`;
    const valueKey = `${valueCol}${r}`;
    const labelCell = cells[labelKey];
    const valueCell = cells[valueKey];

    if (labelCell || valueCell) {
      const label = labelCell?.formula ? String(evaluateFormula(labelCell.formula, cells)) : (labelCell?.value || `Row ${r}`);
      const rawVal = valueCell?.formula ? evaluateFormula(valueCell.formula, cells) : (valueCell?.value || 0);
      const val = Number(rawVal);
      if (!isNaN(val)) {
        data.push({ name: String(label), value: val });
      }
    }
  }

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const controlBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`flex flex-col w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden max-h-[90vh] transition-colors ${modalBg}`}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-500" />
            <h2 className="text-base font-bold">Data Visualization & Charts</h2>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`flex flex-wrap items-center gap-4 border-b px-6 py-3 text-xs ${controlBg}`}>
          <div className="flex items-center gap-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Chart Type:</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              className={`rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
            >
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="area">Area Chart</option>
              <option value="pie">Pie Chart</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Labels Col:</span>
            <input
              type="text"
              value={labelCol}
              onChange={(e) => setLabelCol(e.target.value.toUpperCase())}
              className={`w-12 rounded-lg px-2 py-1 text-center font-bold border ${inputBg}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Values Col:</span>
            <input
              type="text"
              value={valueCol}
              onChange={(e) => setValueCol(e.target.value.toUpperCase())}
              className={`w-12 rounded-lg px-2 py-1 text-center font-bold border ${inputBg}`}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Rows:</span>
            <input
              type="number"
              value={startRow}
              onChange={(e) => setStartRow(Number(e.target.value))}
              className={`w-14 rounded-lg px-2 py-1 text-center border ${inputBg}`}
            />
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>to</span>
            <input
              type="number"
              value={endRow}
              onChange={(e) => setEndRow(Number(e.target.value))}
              className={`w-14 rounded-lg px-2 py-1 text-center border ${inputBg}`}
            />
          </div>
        </div>

        <div className="flex-1 p-6 min-h-[350px] flex items-center justify-center">
          {data.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <BarChart3 className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No valid numeric data found in the selected range.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              {chartType === 'bar' ? (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#475569' : '#cbd5e1', color: isDark ? '#fff' : '#0f172a' }} />
                  <Legend />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chartType === 'line' ? (
                <RechartsLine data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#475569' : '#cbd5e1', color: isDark ? '#fff' : '#0f172a' }} />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} />
                </RechartsLine>
              ) : chartType === 'area' ? (
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} />
                  <Tooltip contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#475569' : '#cbd5e1', color: isDark ? '#fff' : '#0f172a' }} />
                  <Legend />
                  <Area type="monotone" dataKey="value" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.3} />
                </AreaChart>
              ) : (
                <RechartsPie>
                  <Tooltip contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#475569' : '#cbd5e1', color: isDark ? '#fff' : '#0f172a' }} />
                  <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </RechartsPie>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
