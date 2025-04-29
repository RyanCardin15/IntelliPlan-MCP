import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Task, TaskStore } from '../../domain/task/entities/Task.js';
import type { TaskRepository } from '../../domain/task/repositories/TaskRepository.js';

/**
 * File-based implementation of the TaskRepository
 * Handles persistence of tasks to the filesystem
 */
export class FileTaskRepository implements TaskRepository {
  private taskStore: TaskStore = {};
  private storageDir: string;
  private storageFile: string;
  
  constructor(private useHiddenStorage: boolean = true) {
    const homeDir = os.homedir();
    const hiddenDirName = '.intelliplan';
    const visibleDirName = 'intelliplan';
    
    this.storageDir = path.join(
      homeDir, 
      this.useHiddenStorage ? hiddenDirName : visibleDirName
    );
    
    this.storageFile = path.join(this.storageDir, 'tasks.json');
  }
  
  /**
   * Configure storage settings
   */
  configureStorage(useHidden: boolean): string {
    this.useHiddenStorage = useHidden;
    
    const homeDir = os.homedir();
    const hiddenDirName = '.intelliplan';
    const visibleDirName = 'intelliplan';
    
    this.storageDir = path.join(
      homeDir, 
      this.useHiddenStorage ? hiddenDirName : visibleDirName
    );
    
    this.storageFile = path.join(this.storageDir, 'tasks.json');
    return this.storageDir;
  }
  
  /**
   * Get current storage path
   */
  getStoragePath(): string {
    return this.storageDir;
  }
  
  /**
   * Check if using hidden storage
   */
  isStorageHidden(): boolean {
    return this.useHiddenStorage;
  }
  
  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Object.values(this.taskStore);
  }
  
  /**
   * Get a task by ID
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
  updateTask(id: string, updatedTask: Task): boolean {
    if (!this.taskStore[id]) {
      return false;
    }
    
    this.taskStore[id] = updatedTask;
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
    return true;
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
   * Save tasks to persistent storage
   */
  async saveTasks(): Promise<void> {
    try {
      await this.ensureStorageDir();
      await fs.writeFile(
        this.storageFile, 
        JSON.stringify(this.taskStore, null, 2), 
        'utf-8'
      );
    } catch (error) {
      throw new Error(`Failed to save tasks: ${error}`);
    }
  }
  
  /**
   * Load tasks from persistent storage
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
          // Create an initial empty file
          await this.saveTasks();
        } else {
          this.taskStore = {}; // Start fresh on load error
          await this.saveTasks();
        }
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Toggle between hidden and visible storage
   */
  async toggleStorageVisibility(): Promise<string> {
    const currentDir = this.storageDir;
    const newUseHidden = !this.useHiddenStorage;
    
    const homeDir = os.homedir();
    const hiddenDirName = '.intelliplan';
    const visibleDirName = 'intelliplan';
    
    const newDir = path.join(
      homeDir, 
      newUseHidden ? hiddenDirName : visibleDirName
    );
    
    const newFile = path.join(newDir, 'tasks.json');
    
    try {
      // Save current data if it exists
      const hasExistingData = await this.fileExists(this.storageFile);
      
      // Update configuration
      this.useHiddenStorage = newUseHidden;
      this.storageDir = newDir;
      this.storageFile = newFile;
      
      // Ensure new directory exists
      await this.ensureStorageDir();
      
      // If we have data, migrate it
      if (hasExistingData) {
        try {
          // Read from old location
          const data = await fs.readFile(path.join(currentDir, 'tasks.json'), 'utf-8');
          // Write to new location
          await fs.writeFile(this.storageFile, data, 'utf-8');
        } catch (error: any) {
          // If we can't migrate, at least save current in-memory data
          if (Object.keys(this.taskStore).length > 0) {
            await this.saveTasks();
          }
        }
      } else if (Object.keys(this.taskStore).length > 0) {
        // No existing file but we have in-memory data
        await this.saveTasks();
      }
      
      return this.storageDir;
    } catch (error) {
      throw error;
    }
  }
} 