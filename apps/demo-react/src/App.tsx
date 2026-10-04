import React, { useState } from 'react';
import { Gantry } from '@gantry/react';
import { DEMO_TASKS } from '@gantry/core';
import type { GanttTask } from '@gantry/core';

export default function App() {
  const [tasks, setTasks] = useState<GanttTask[]>(DEMO_TASKS);
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month'>('Month');
  
  const columns = [
    { key: 'name', label: 'Initiative', width: 250 },
    { key: 'progress', label: 'Progress (%)', width: 100 }
  ];

  const handleTaskUpdate = (task: GanttTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? task : t));
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f1f5f9', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 14px', background: '#1e293b', borderBottom: '1px solid #334155', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Features</span>
          <button style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', background: '#334155', color: '#f1f5f9', border: '1px solid #475569' }}>Baseline</button>
          <button style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', background: '#334155', color: '#f1f5f9', border: '1px solid #475569' }}>Critical path</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>View</span>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as any)} style={{ padding: '4px', borderRadius: '4px', background: '#334155', color: 'white', border: '1px solid #475569' }}>
            <option value="Day">Day</option>
            <option value="Week">Week</option>
            <option value="Month">Month</option>
          </select>
        </div>
      </header>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Gantry 
          tasks={tasks} 
          columns={columns}
          options={{ viewMode }} 
          onTaskUpdated={handleTaskUpdate} 
        />
      </div>
    </div>
  );
}
