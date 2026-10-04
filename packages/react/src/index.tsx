import React, { useRef, useEffect } from 'react';
import type { GanttTask, GanttOptions, ColumnDef } from '@gantry/core';
import '@gantry/vanilla';

export interface GantryProps {
  tasks: GanttTask[];
  columns?: ColumnDef[];
  options?: GanttOptions;
  onTaskUpdated?: (task: GanttTask) => void;
}

export function Gantry({ tasks, columns, options, onTaskUpdated }: GantryProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.tasks = tasks;
    }
  }, [tasks]);

  useEffect(() => {
    if (ref.current && columns) {
      ref.current.columns = columns;
    }
  }, [columns]);

  useEffect(() => {
    if (ref.current && options) {
      ref.current.options = options;
    }
  }, [options]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onTaskUpdated) return;
    
    const handler = (e: CustomEvent) => {
      onTaskUpdated(e.detail);
    };
    el.addEventListener('taskUpdated', handler);
    return () => el.removeEventListener('taskUpdated', handler);
  }, [onTaskUpdated]);

  return <gantry-element ref={ref} style={{ width: '100%', height: '100%', display: 'block' }}></gantry-element>;
}
