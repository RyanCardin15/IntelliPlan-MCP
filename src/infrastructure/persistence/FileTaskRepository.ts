import * as fs from 'fs/promises';
import * as path from 'path';
import type { Task, TaskStore } from '../../domain/task/entities/Task.js';
import type { TaskRepository } from '../../domain/task/repositories/TaskRepository.js';

/**
 * File-based implementation of the TaskRepository
 * Handles persistence of tasks to the filesystem
 */
export class FileTaskRepository implements TaskRepository {
  private taskStore: TaskStore = {};
  private baseDir: string;
  private storageDir: string;
  private storageFile: string;
  
  /**
   * Creates a new FileTaskRepository instance
   * @param basePath Base directory path where intelliplan directory will be created (required)
   */
  constructor(private basePath: string) {
    if (!basePath) {
      throw new Error('Base path is required for storage configuration');
    }
    
    const baseDirName = 'intelliplan';
    const tasksDirName = 'tasks';
    
    this.baseDir = path.join(basePath, baseDirName);
    this.storageDir = path.join(this.baseDir, tasksDirName);
    this.storageFile = path.join(this.storageDir, 'tasks.json');
  }
  
  /**
   * Configure storage settings with a new base path
   */
  configureStorage(basePath: string): string {
    if (!basePath) {
      throw new Error('Base path is required for storage configuration');
    }
    
    this.basePath = basePath;
    
    const baseDirName = 'intelliplan';
    const tasksDirName = 'tasks';
    
    this.baseDir = path.join(this.basePath, baseDirName);
    this.storageDir = path.join(this.baseDir, tasksDirName);
    this.storageFile = path.join(this.storageDir, 'tasks.json');
    
    return this.storageDir;
  }
  
  /**
   * Get path to a specific task folder
   */
  getTaskFolder(taskId: string): string {
    return path.join(this.storageDir, taskId);
  }
  
  /**
   * Get current storage path
   */
  getStoragePath(): string {
    return this.storageDir;
  }
  
  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }
  
  /**
   * Helper to check if a file exists
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
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create storage directory: ${error}`);
    }
  }
  
  /**
   * Ensure task directory exists
   */
  private async ensureTaskDir(taskId: string): Promise<void> {
    try {
      const taskDir = this.getTaskFolder(taskId);
      await fs.mkdir(taskDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create task directory: ${error}`);
    }
  }
  
  /**
   * Loads tasks from storage
   */
  async loadTasks(): Promise<void> {
    try {
      await this.ensureStorageDir();
      
      try {
        const data = await fs.readFile(this.storageFile, 'utf-8');
        this.taskStore = JSON.parse(data);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.taskStore = {};
          await this.saveTasks();
        } else {
          this.taskStore = {};
          throw error;
        }
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Saves tasks to storage
   */
  async saveTasks(): Promise<void> {
    try {
      await this.ensureStorageDir();
      
      // Save main tasks.json file
      await fs.writeFile(
        this.storageFile, 
        JSON.stringify(this.taskStore, null, 2), 
        'utf-8'
      );
      
      // Create individual task files
      for (const taskId in this.taskStore) {
        await this.ensureTaskDir(taskId);
        const taskFile = path.join(this.getTaskFolder(taskId), 'task.json');
        await fs.writeFile(
          taskFile, 
          JSON.stringify(this.taskStore[taskId], null, 2), 
          'utf-8'
        );
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Object.values(this.taskStore);
  }
  
  /**
   * Get task by ID
   */
  getTaskById(id: string): Task | undefined {
    return this.taskStore[id];
  }
  
  /**
   * Add a new task
   */
  addTask(task: Task): boolean {
    if (!task.id) {
      return false;
    }
    
    this.taskStore[task.id] = task;
    return true;
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
    
    // Delete task directory (async operation, but interface requires sync return)
    // We'll do this in the background without awaiting
    const taskDir = this.getTaskFolder(id);
    fs.rm(taskDir, { recursive: true, force: true })
      .catch(error => {
        console.error(`Error deleting task directory for task ${id}:`, error);
      });
    
    return true;
  }
} 