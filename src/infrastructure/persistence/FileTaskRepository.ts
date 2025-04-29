import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Task, TaskStore } from '../../domain/task/entities/Task.js';
import type { TaskRepository } from '../../domain/task/repositories/TaskRepository.js';

// Get dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * File-based implementation of the TaskRepository
 * Handles persistence of tasks to the filesystem
 */
export class FileTaskRepository implements TaskRepository {
  private taskStore: TaskStore = {};
  private storageDir: string;
  private tasksDir: string;
  
  constructor() {
    // Use absolute path based on project root
    this.storageDir = path.resolve(__dirname, '../../..');
    this.tasksDir = path.join(this.storageDir, 'tasks');
  }
  
  /**
   * Get the tasks directory path
   */
  getTasksDir(): string {
    return this.tasksDir;
  }
  
  /**
   * Get the path for a specific task folder
   */
  getTaskDir(taskId: string): string {
    return path.join(this.getTasksDir(), taskId);
  }
  
  /**
   * Get the path for a task data file
   */
  getTaskFilePath(taskId: string): string {
    return path.join(this.getTaskDir(taskId), 'task.json');
  }
  
  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Object.values(this.taskStore);
  }
  
  /**
   * Get a task by its ID
   */
  getTaskById(id: string): Task | undefined {
    return this.taskStore[id];
  }
  
  /**
   * Add a new task
   */
  addTask(task: Task): boolean {
    try {
      if (!task.id) {
        return false;
      }
      
      this.taskStore[task.id] = task;
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Update an existing task
   */
  updateTask(id: string, task: Task): boolean {
    if (!this.taskStore[id]) {
      return false;
    }
    
    this.taskStore[id] = task;
    return true;
  }
  
  /**
   * Delete a task
   */
  deleteTask(id: string): boolean {
    if (!this.taskStore[id]) {
      return false;
    }
    
    delete this.taskStore[id];
    
    // Also delete the task file and directory
    try {
      const taskDir = this.getTaskDir(id);
      fs.rm(taskDir, { recursive: true, force: true }).catch(error => {
        console.error(`Error deleting task directory for ${id}:`, error);
      });
    } catch (error) {
      console.error(`Error deleting task directory for ${id}:`, error);
      // Continue even if directory deletion fails
    }
    
    return true;
  }
  
  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Ensure the tasks directory exists
   */
  private async ensureTasksDir(): Promise<void> {
    try {
      const tasksDir = this.getTasksDir();
      await fs.mkdir(tasksDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  
  /**
   * Ensure a specific task directory exists
   */
  private async ensureTaskDir(taskId: string): Promise<void> {
    try {
      const taskDir = this.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  
  /**
   * Save a specific task to its file
   */
  private async saveTask(task: Task): Promise<void> {
    try {
      await this.ensureTaskDir(task.id);
      await fs.writeFile(
        this.getTaskFilePath(task.id),
        JSON.stringify(task, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Save all tasks to persistent storage
   */
  async saveTasks(): Promise<void> {
    try {
      await this.ensureTasksDir();
      
      // Save each task to its own file
      const savePromises = Object.values(this.taskStore).map(task => this.saveTask(task));
      await Promise.all(savePromises);
    } catch (error) {
      throw new Error(`Failed to save tasks: ${error}`);
    }
  }
  
  /**
   * Load tasks from persistent storage
   */
  async loadTasks(): Promise<void> {
    try {
      // Only read the tasks directory if it exists
      const tasksDir = this.getTasksDir();
      
      // Clear the current store
      this.taskStore = {};
      
      // Check if directory exists before reading
      const exists = await this.fileExists(tasksDir);
      if (!exists) {
        return; // Just return with empty store if no tasks directory exists
      }
      
      // Read the tasks directory
      const taskFolders = await fs.readdir(tasksDir);
      
      // Load each task
      for (const taskId of taskFolders) {
        const taskFilePath = this.getTaskFilePath(taskId);
        
        try {
          if (await this.fileExists(taskFilePath)) {
            const taskData = await fs.readFile(taskFilePath, 'utf-8');
            const task = JSON.parse(taskData);
            
            if (task && task.id) {
              this.taskStore[task.id] = task;
            }
          }
        } catch (error) {
          console.error(`Error loading task ${taskId}:`, error);
          // Continue to next task if one fails
        }
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      this.taskStore = {}; // Start fresh on load error
    }
  }
} 