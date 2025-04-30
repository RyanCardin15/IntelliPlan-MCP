/**
 * Task domain entities
 * These types represent the core domain objects in the task management system
 */

/**
 * Status options for Tasks and Epics
 */
export type Status = 'todo' | 'in-progress' | 'done';

/**
 * Priority levels for Tasks and Epics
 */
export type Priority = 'low' | 'medium' | 'high';

/**
 * Represents a file attached to a Task or Epic
 */
export interface AssociatedFile {
  filePath: string;
  description?: string;
  addedAt: string;
}

/**
 * Represents a Subtask nested within a Task
 */
export interface Subtask {
  id: string;
  description: string;
  status: 'todo' | 'done';
  createdAt: string;
}

/**
 * Represents a Task nested within an Epic
 */
export interface Task {
  id: string;
  description: string;
  status: Status;
  priority?: Priority;
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
  files: AssociatedFile[];
  dependencies?: string[];
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * The main Epic entity that represents a large unit of work
 */
export interface Epic {
  id: string;
  description: string;
  status: Status;
  priority?: Priority;
  complexity?: number;
  createdAt: string;
  updatedAt: string;
  tasks: Task[]; // Epics contain Tasks
  files: AssociatedFile[];
  dependencies?: string[]; // Epic dependencies
  testStrategy?: string;
  implementationPlan?: string;
}

/**
 * A hash map of Epic IDs to Epics
 */
export interface EpicStore {
  [id: string]: Epic;
}

/**
 * A hash map of task IDs to tasks
 */
export interface TaskStore {
  [id: string]: Task;
} 