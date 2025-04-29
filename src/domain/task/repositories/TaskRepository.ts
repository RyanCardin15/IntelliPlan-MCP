import type { Task } from '../entities/Task.js';

/**
 * Task Repository interface
 * Defines the contract for interacting with task persistence
 */
export interface TaskRepository {
  /**
   * Get all tasks
   */
  getAllTasks(): Task[];
  
  /**
   * Get a task by its ID
   */
  getTaskById(id: string): Task | undefined;
  
  /**
   * Add a new task
   * @returns success status
   */
  addTask(task: Task): boolean;
  
  /**
   * Update an existing task
   * @returns success status
   */
  updateTask(id: string, task: Task): boolean;
  
  /**
   * Delete a task
   * @returns success status
   */
  deleteTask(id: string): boolean;
  
  /**
   * Save all tasks to persistent storage
   */
  saveTasks(): Promise<void>;
  
  /**
   * Load tasks from persistent storage
   */
  loadTasks(): Promise<void>;
} 