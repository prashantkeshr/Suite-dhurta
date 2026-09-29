/** To-do list model and ordering (pure, unit-tested). */

export type Priority = 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  /** Local date "YYYY-MM-DD". */
  due?: string;
  priority: Priority;
  created: number;
  doneAt?: number;
}

const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export const isOverdue = (t: Task, today: string) => !t.done && !!t.due && t.due < today;

/**
 * Open tasks first; among them, dated tasks by due date (overdue first), then
 * undated ones; ties by priority, then newest. Completed tasks last, most
 * recently completed first.
 */
export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return RANK[a.priority] - RANK[b.priority] || b.created - a.created;
  });
}
