import React, { useState, useMemo, useEffect } from 'react';
import { StorageService } from '../../services/storageService';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboard } from '../../contexts/DashboardContext';
import { CATEGORIES, PROCESSES } from '../../constants';
import { ProductionEntry, ProductionStatus, OffDayType } from '../../types';
import { Trash2, Download, Calendar, List, Filter, XCircle, Palmtree, BarChart2, MessageSquare, ArrowUpDown, Clock, CheckCircle, ShieldAlert, Coffee, Ban } from 'lucide-react';
import { getTodayISO, isWeeklyRestDay, getWeeklyOffDayType } from '../../utils/dateUtils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, LineChart, Line, AreaChart, Area, ComposedChart,
  Cell
} from 'recharts';

type SortConfig = {
    key: keyof ProductionEntry;
    direction: 'asc' | 'desc';
} | null;

export const ProductionLog: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { refreshKey, triggerRefresh, isDarkMode } = useDashboard();
  const [data, setData] = useState<ProductionEntry[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const offDays = useMemo(() => StorageService.getOffDays(), []);
  
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [category, setCategory] = useState('All');
  const [processType, setProcessType] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    setData(StorageService.getProductionData());
  }, [refreshKey]);

  const handleSort = (key: keyof ProductionEntry) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let result = data.filter(d => {
      if (!d) return false;
      const matchCat = category === 'All' || d.category === category;
      const matchProc = processType === 'All' || d.process === processType;
      const matchStatus = statusFilter === 'All' || d.status === statusFilter;
      const matchStart = !dateRange.start || (d.date && d.date >= dateRange.start);
      const matchEnd = !dateRange.end || (d.date && d.date <= dateRange.end);
      return matchCat && matchProc && matchStatus && matchStart && matchEnd;
    });

    const statusWeight: Record<string, number> = { 'In Progress': 1, 'Completed': 2 };

    if (sortConfig) {
        result = [...result].sort((a, b) => {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];
            if (sortConfig.key === 'status') {
                aVal = statusWeight[a.status as ProductionStatus] || 0;
                bVal = statusWeight[b.status as ProductionStatus] || 0;
            } else {
                aVal = (aVal || '').toString();
                bVal = (bVal || '').toString();
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    return result;
  }, [data, dateRange, category, processType, statusFilter, sortConfig]);

  const monthlyData = useMemo(() => {
    const groups: Record<string, { plan: number, actual: number, count: number, month: string, process: string }> = {};
    filteredData.forEach(d => {
        if (!d.date) return;
        const monthKey = d.date.substring(0, 7); 
        const procKey = d.process || 'Other';
        const compositeKey = `${monthKey}_${procKey}`;
        if (!groups[compositeKey]) {
            groups[compositeKey] = { plan: 0, actual: 0, count: 0, month: monthKey, process: procKey };
        }
        groups[compositeKey].plan += (d.planQuantity || 0);
        groups[compositeKey].actual += (d.actualQuantity || 0);
        groups[compositeKey].count++;
    });
    return Object.values(groups).map((stats) => ({
        name: stats.month, process: stats.process, plan: stats.plan, actual: stats.actual,
        efficiency: stats.plan > 0 ? Number(((stats.actual / stats.plan) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.name.localeCompare(a.name)); 
  }, [filteredData]);

  const monthlyChartSummaryData = useMemo(() => {
    const groups: Record<string, { plan: number, actual: number }> = {};
    filteredData.forEach(d => {
      if (!d.date) return;
      const monthKey = d.date.substring(0, 7);
      if (!groups[monthKey]) groups[monthKey] = { plan: 0, actual: 0 };
      groups[monthKey].plan += (d.planQuantity || 0);
      groups[monthKey].actual += (d.actualQuantity || 0);
    });
    return Object.entries(groups).map(([month, stats]) => ({
        name: month, plan: stats.plan, actual: stats.actual,
        efficiency: stats.plan > 0 ? Number(((stats.actual / stats.plan) * 100).toFixed(1)) : 0
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredData]);

  const chartDailyData = useMemo(() => {
    const products: Record<string, { plan: number, actual: number }> = {};
    filteredData.forEach(d => {
        const key = d.productName;
        if (!products[key]) products[key] = { plan: 0, actual: 0 };
        products[key].plan += d.planQuantity;
        products[key].actual += d.actualQuantity;
    });
    return Object.entries(products).map(([name, stats]) => ({
        name: name.length > 15 ? name.substring(0, 15) + '...' : name,
        fullName: name, plan: stats.plan, actual: stats.actual
    })).sort((a, b) => b.plan - a.plan).slice(0, 10);
  }, [filteredData]);

  const calculateEfficiency = (actual: number, plan: number) => plan > 0 ? ((actual / plan) * 100).toFixed(1) : '0';

  const resetFilters = () => {
    setDateRange({ start: '', end: '' });
    setCategory('All');
    setProcessType('All');
    setStatusFilter('All');
    setSortConfig(null);
  };

  const downloadCSV = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filename = '';
    const today = getTodayISO();

    if (viewMode === 'daily') {
        headers = ["Date", "Category", "Process", "Product", "Plan", "Actual", "Unit", "Efficiency %", "Batch No", "Manpower", "Status", "Plan Remark", "Actual Remark"];
        rows = filteredData.map(d => [
            d.date, d.category, d.process, `"${d.productName}"`, d.planQuantity || 0, d.actualQuantity || 0, d.unit || 'KG',
            calculateEfficiency(d.actualQuantity || 0, d.planQuantity || 0), d.batchNo || '', Number(d.manpower || 0), d.status || 'In Progress', 
            `"${(d.planRemark || '').replace(/"/g, '""')}"`, `"${(d.actualRemark || '').replace(/"/g, '""')}"`
        ]);
        filename = `production_log_daily_${today}.csv`;
    } else {
        headers = ["Month", "Process", "Total Plan", "Total Actual", "Overall Efficiency %"];
        rows = monthlyData.map(m => [ m.name, m.process, m.plan || 0, m.actual || 0, (m.efficiency || 0).toFixed(2) ]);
        filename = `production_summary_monthly_${today}.csv`;
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: 'REPORT EXPORTED SUCCESSFULLY', type: 'success' } 
    }));
  };

  const SortHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: keyof ProductionEntry, align?: 'left' | 'right' | 'center' }) => (
    <th className={`px-8 py-5 cursor-pointer group text-${align}`} onClick={() => handleSort(sortKey)}>
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
            <span className={sortConfig?.key === sortKey ? 'text-indigo-600' : ''}>{label}</span>
            <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortConfig?.key === sortKey ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`} />
        </div>
    </th>
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-black text-gray-800 dark:text-white">Production Analytics</h2>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl p-1.5 border border-gray-200 dark:border-slate-700 shadow-sm">
              <button onClick={() => setViewMode('daily')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition ${viewMode === 'daily' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500'}`}><List className="w-4 h-4" /> Daily</button>
              <button onClick={() => setViewMode('monthly')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition ${viewMode === 'monthly' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500'}`}><Calendar className="w-4 h-4" /> Monthly</button>
          </div>

          <button 
            onClick={downloadCSV} 
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 flex flex-wrap gap-6 items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Filter className="w-3 h-3" /> Date From</label>
          <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none dark:text-white font-bold" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Filter className="w-3 h-3" /> Date To</label>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none dark:text-white font-bold" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Filter className="w-3 h-3" /> Department</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none dark:text-white font-bold w-full md:w-auto">
            <option value="All">All Departments</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Filter className="w-3 h-3" /> Process Stage</label>
          <select value={processType} onChange={e => setProcessType(e.target.value)} className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none dark:text-white font-bold w-full md:w-auto">
            <option value="All">All Processes</option>
            {PROCESSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Filter className="w-3 h-3" /> Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none dark:text-white font-bold w-full md:w-auto">
            <option value="All">All Statuses</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <button onClick={resetFilters} className="flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-50 rounded-xl transition"><XCircle className="w-4 h-4" /> Reset</button>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={viewMode === 'daily' ? chartDailyData : monthlyChartSummaryData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#f1f5f9'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: '16px', border: 'none', fontSize: '12px', fontWeight: 'bold' }} />
                    <Bar dataKey="plan" name="Target Plan" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={viewMode === 'daily' ? 30 : 50} />
                    <Bar dataKey="actual" name="Total Actual" fill="#10b981" radius={[6, 6, 0, 0]} barSize={viewMode === 'daily' ? 30 : 50} />
                    {viewMode === 'monthly' && <Line type="monotone" dataKey="efficiency" name="Eff. %" stroke="#f59e0b" strokeWidth={3} />}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50/50 dark:bg-slate-900/50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b dark:border-slate-700">
              {viewMode === 'daily' ? (
                  <tr>
                    <SortHeader label="Date" sortKey="date" />
                    <SortHeader label="Dept" sortKey="category" align="center" />
                    <SortHeader label="Product" sortKey="productName" />
                    <th className="px-8 py-5 text-right">Plan</th>
                    <th className="px-8 py-5 text-right">Actual</th>
                    <th className="px-8 py-5 text-right">Eff. %</th>
                    <SortHeader label="Status" sortKey="status" align="center" />
                  </tr>
              ) : (
                  <tr>
                    <th className="px-8 py-5">Month</th>
                    <th className="px-8 py-5">Process</th>
                    <th className="px-8 py-5 text-right">Plan</th>
                    <th className="px-8 py-5 text-right">Actual</th>
                    <th className="px-8 py-5 text-right">Efficiency %</th>
                  </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {viewMode === 'daily' ? (
                  filteredData.map(entry => {
                    const eff = Number(calculateEfficiency(entry.actualQuantity || 0, entry.planQuantity || 0));
                    
                    // Priority 1: Manual Holiday check
                    const manualOffDay = offDays.find(od => od.date === entry.date);
                    // Priority 2: Automatic Weekly check
                    const autoOffType = getWeeklyOffDayType(entry.date || '');
                    
                    const labelType = manualOffDay?.type || autoOffType;
                    const labelDesc = manualOffDay?.description || (autoOffType === 'Rest Day' ? 'Weekly Rest' : 'Weekly Off');

                    return (
                      <tr key={entry.id} className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors ${labelType ? 'bg-amber-50/10' : ''}`}>
                        <td className="px-8 py-6">
                            <div className="font-black text-slate-800 dark:text-white font-mono text-xs">{entry.date}</div>
                            {labelType ? (
                              <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase ${
                                labelType === 'Public Holiday' ? 'text-rose-500' : 
                                labelType === 'Rest Day' ? 'text-indigo-500' : 'text-amber-500'
                              }`}>
                                {labelType === 'Public Holiday' ? <Palmtree className="w-3 h-3" /> : 
                                 labelType === 'Rest Day' ? <Coffee className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                {labelDesc}
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase text-slate-300">Operational</span>
                            )}
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-500 border dark:border-slate-800">{entry.category}</span>
                        </td>
                        <td className="px-8 py-6"><div className="font-black text-slate-800 dark:text-white">{entry.productName}</div></td>
                        <td className="px-8 py-6 text-right font-black font-mono text-slate-700 dark:text-slate-200">{(entry.planQuantity || 0).toLocaleString()}</td>
                        <td className="px-8 py-6 text-right font-black font-mono text-emerald-500">{(entry.actualQuantity || 0).toLocaleString()}</td>
                        <td className="px-8 py-6 text-right font-black">{eff}%</td>
                        <td className="px-8 py-6 text-center">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${entry.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {entry.status === 'Completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3 animate-pulse" />} {entry.status}
                            </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                  monthlyData.map(m => (
                      <tr key={`${m.name}-${m.process}`} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition">
                          <td className="px-8 py-6 font-black text-slate-800 dark:text-white text-lg">{m.name}</td>
                          <td className="px-8 py-6"><span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100">{m.process}</span></td>
                          <td className="px-8 py-6 text-right font-mono font-black text-slate-700 dark:text-slate-200">{(m.plan || 0).toLocaleString()}</td>
                          <td className="px-8 py-6 text-right font-mono font-black text-emerald-500">{(m.actual || 0).toLocaleString()}</td>
                          <td className="px-8 py-6 text-right font-black"><div className={`inline-flex px-4 py-2 rounded-2xl font-black text-base ${m.efficiency >= 85 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{m.efficiency.toFixed(1)}%</div></td>
                      </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
