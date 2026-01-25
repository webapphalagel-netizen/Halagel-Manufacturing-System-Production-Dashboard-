
import React, { useMemo, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { StorageService } from '../../services/storageService';
import { ProductionEntry, OffDay, ProductionStatus, OffDayType } from '../../types';
import { PROCESSES } from '../../constants';
import { 
  ClipboardList, List, Calendar, 
  Download, Pencil, Trash2, Layers,
  Palmtree, MessageSquare, ArrowUpDown, Clock, CheckCircle, ShieldAlert, Coffee, Ban
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDate, getCurrentMonthISO, getWeeklyOffDayType } from '../../utils/dateUtils';

type SortConfig = {
    key: keyof ProductionEntry;
    direction: 'asc' | 'desc';
} | null;

export const Dashboard: React.FC = () => {
  const { category, refreshKey, triggerRefresh } = useDashboard();
  const { user, hasPermission } = useAuth();
  
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthISO());
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const { productionData, offDays } = useMemo(() => {
    return {
      productionData: StorageService.getProductionData(),
      offDays: StorageService.getOffDays(),
    };
  }, [refreshKey]);

  const handleSort = (key: keyof ProductionEntry) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const dashboardData = useMemo(() => {
    const relevant = productionData.filter(d => d && d.category === category && d.date);
    let selectedMonthPlan = 0;
    let selectedMonthActual = 0;
    const selectedMonthProcessMap = new Map<string, {process: string, Plan: number, Actual: number}>();
    const validProcesses = ['Toothpaste', 'Rocksalt', 'Cosmetic'].includes(category)
      ? PROCESSES.filter(p => p !== 'Encapsulation')
      : [...PROCESSES];

    validProcesses.forEach(proc => {
      selectedMonthProcessMap.set(proc, { process: proc, Plan: 0, Actual: 0 });
    });

    relevant.forEach(d => {
      const dateStr = (d.date || '').trim().substring(0, 7);
      if (dateStr === selectedMonth) {
        selectedMonthPlan += (d.planQuantity || 0);
        selectedMonthActual += (d.actualQuantity || 0);
        const procName = d.process || 'Other';
        if (selectedMonthProcessMap.has(procName)) {
          const p = selectedMonthProcessMap.get(procName)!;
          p.Plan += (d.planQuantity || 0);
          p.Actual += (d.actualQuantity || 0);
        }
      }
    });

    return {
      filteredData: relevant.sort((a,b) => (b.date || '').localeCompare(a.date || '')),
      selectedMonthStats: { 
        plan: selectedMonthPlan, 
        actual: selectedMonthActual,
        efficiency: selectedMonthPlan > 0 ? (selectedMonthActual / selectedMonthPlan) * 100 : 0
      },
      chartData: Array.from(selectedMonthProcessMap.values())
    };
  }, [productionData, category, selectedMonth]);

  const dailyGroups = useMemo(() => {
    const baseData = dashboardData.filteredData;
    const filteredEntries = baseData.filter(d => d && d.date && d.date.trim().startsWith(selectedMonth));
    const dates = new Set<string>();
    
    // 1. Add dates that have production entries
    filteredEntries.forEach(e => {
        if (e.date) dates.add(e.date.trim().substring(0, 10));
    });
    
    // 2. Add manual off days (holidays etc)
    offDays.forEach(od => {
        if (od.date && od.date.trim().startsWith(selectedMonth)) {
            dates.add(od.date.trim().substring(0, 10));
        }
    });

    const sortedDates = Array.from(dates).sort((a, b) => (b || '').localeCompare(a || ''));
    const statusWeight: Record<string, number> = { 'In Progress': 1, 'Completed': 2 };

    return sortedDates.map(dateKey => {
        let entriesForDate = filteredEntries.filter(d => d.date && d.date.trim().substring(0, 10) === dateKey);
        
        if (sortConfig) {
            entriesForDate = [...entriesForDate].sort((a, b) => {
                let aValue: any = a[sortConfig.key];
                let bValue: any = b[sortConfig.key];
                if (sortConfig.key === 'status') {
                    aValue = statusWeight[a.status as ProductionStatus] || 0;
                    bValue = statusWeight[b.status as ProductionStatus] || 0;
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Manual holiday check takes priority
        let offDayInfo = offDays.find(od => od.date && od.date.trim().substring(0, 10) === dateKey);
        
        if (!offDayInfo) {
           const autoType = getWeeklyOffDayType(dateKey);
           if (autoType) {
               offDayInfo = {
                   id: `auto-${dateKey}`,
                   date: dateKey,
                   type: autoType,
                   description: autoType === 'Rest Day' ? 'Friday Weekly Rest' : 'Saturday Weekly Off',
                   createdBy: 'System'
               };
           }
        }

        // Fix: Corrected totalActualFor to totalActualForDate (136)
        const totalActualForDate = entriesForDate.reduce((sum, entry) => sum + (entry.actualQuantity || 0), 0);
        
        return {
            date: dateKey,
            totalActualForDate,
            entries: entriesForDate,
            offDay: offDayInfo
        };
    });
  }, [dashboardData.filteredData, offDays, selectedMonth, sortConfig]);

  // Fix: Added missing logic for delete and edit actions
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      const { deletedItem } = StorageService.deleteProductionEntry(id);
      if (deletedItem) {
        StorageService.addLog({
          userId: user!.id,
          userName: user!.name,
          action: 'DELETE_PRODUCTION',
          details: `Deleted entry: ${deletedItem.productName} for ${deletedItem.date}`
        });
        triggerRefresh();
        window.dispatchEvent(new CustomEvent('app-notification', { 
          detail: { message: 'Entry deleted successfully', type: 'success' } 
        }));
      }
    }
  };

  const handleEdit = (entry: ProductionEntry) => {
    window.dispatchEvent(new CustomEvent('edit-production-entry', { detail: entry }));
  };

  // Fix: Added missing return statement for Dashboard component (19)
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
            <Layers className="w-8 h-8 text-indigo-600" />
            {category} <span className="text-slate-400 font-medium">Dashboard</span>
          </h2>
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest mt-1">Real-time production monitoring & statistics</p>
        </div>

        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
          <Calendar className="w-5 h-5 text-slate-400 ml-2" />
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-sm font-black text-slate-700 dark:text-white focus:ring-0 cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
            <ClipboardList className="w-24 h-24 text-indigo-600" />
          </div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Plan Units</p>
          <h3 className="text-4xl font-black text-slate-800 dark:text-white font-mono">{dashboardData.selectedMonthStats.plan.toLocaleString()}</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 uppercase">Scheduled for {selectedMonth}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
            <CheckCircle className="w-24 h-24 text-emerald-500" />
          </div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Actual Units</p>
          <h3 className="text-4xl font-black text-emerald-500 font-mono">{dashboardData.selectedMonthStats.actual.toLocaleString()}</h3>
          <p className="text-xs font-bold text-slate-400 mt-2 uppercase">Produced in {selectedMonth}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
            <ShieldAlert className="w-24 h-24 text-indigo-600" />
          </div>
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Average Efficiency</p>
          <h3 className="text-4xl font-black text-indigo-600 font-mono">{dashboardData.selectedMonthStats.efficiency.toFixed(1)}%</h3>
          <div className="mt-4 w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 rounded-full transition-all duration-1000" 
              style={{ width: `${Math.min(dashboardData.selectedMonthStats.efficiency, 100)}%` }} 
            />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {dailyGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
              <Layers className="w-12 h-12 text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">No Production Records</h3>
            <p className="text-sm font-medium text-slate-400 mt-2">Start by adding a production plan for {selectedMonth}</p>
          </div>
        ) : (
          dailyGroups.map((group) => (
            <div key={group.date} className="relative">
               <div className="sticky top-0 z-10 py-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md">
                 <div className="flex items-center gap-4">
                    <div className="px-6 py-2 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/10 flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-black uppercase tracking-widest font-mono">
                        {formatDisplayDate(group.date)}
                      </span>
                    </div>
                    {group.offDay && (
                      <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${
                        group.offDay.type === 'Public Holiday' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                        group.offDay.type === 'Rest Day' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {group.offDay.type === 'Public Holiday' ? <Palmtree className="w-4 h-4" /> : 
                         group.offDay.type === 'Rest Day' ? <Coffee className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">{group.offDay.description}</span>
                      </div>
                    )}
                 </div>
               </div>

               {group.entries.length === 0 ? (
                  <div className="mt-2 p-8 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-gray-100 dark:border-slate-700 flex flex-col items-center justify-center text-center opacity-60">
                     <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">No Operations recorded for this day</p>
                  </div>
               ) : (
                 <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {group.entries.map((entry) => (
                      <div key={entry.id} className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-xl transition-all group/card">
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800">
                              {entry.process}
                            </span>
                            <h4 className="text-xl font-black text-slate-800 dark:text-white mt-3 leading-tight uppercase tracking-tighter">
                              {entry.productName}
                            </h4>
                          </div>
                          
                          {user && (
                            <div className="flex gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleEdit(entry)}
                                className="p-2.5 bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {hasPermission(['admin', 'manager']) && (
                                <button 
                                  onClick={() => handleDelete(entry.id)}
                                  className="p-2.5 bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-rose-500 rounded-xl transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                           <div className="space-y-1">
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Plan</p>
                              <p className="text-lg font-black text-slate-700 dark:text-white font-mono">{entry.planQuantity.toLocaleString()} <span className="text-[10px] font-sans opacity-50">{entry.unit}</span></p>
                           </div>
                           <div className="space-y-1 text-right">
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Actual</p>
                              <p className="text-lg font-black text-emerald-500 font-mono">{entry.actualQuantity.toLocaleString()} <span className="text-[10px] font-sans opacity-50 text-slate-400">{entry.unit}</span></p>
                           </div>
                        </div>

                        <div className="flex items-center justify-between pt-6 border-t border-gray-50 dark:border-slate-700/50">
                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase border ${
                              entry.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                            }`}>
                              {entry.status === 'Completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3 animate-pulse" />}
                              {entry.status}
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency</span>
                              <p className={`text-sm font-black ${
                                (entry.actualQuantity / entry.planQuantity) * 100 >= 90 ? 'text-emerald-500' : 
                                (entry.actualQuantity / entry.planQuantity) * 100 >= 70 ? 'text-indigo-600' : 'text-rose-500'
                              }`}>
                                {((entry.actualQuantity / (entry.planQuantity || 1)) * 100).toFixed(1)}%
                              </p>
                            </div>
                        </div>
                        
                        {(entry.planRemark || entry.actualRemark) && (
                          <div className="mt-4 pt-4 border-t border-gray-50 dark:border-slate-700/50 space-y-2">
                             {entry.planRemark && (
                               <div className="flex items-start gap-2 text-[10px] font-medium text-slate-500 italic">
                                 <MessageSquare className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                                 <span>{entry.planRemark}</span>
                               </div>
                             )}
                             {entry.actualRemark && (
                               <div className="flex items-start gap-2 text-[10px] font-medium text-emerald-600 italic">
                                 <MessageSquare className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                                 <span>{entry.actualRemark}</span>
                               </div>
                             )}
                          </div>
                        )}
                      </div>
                   ))}
                 </div>
               )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
