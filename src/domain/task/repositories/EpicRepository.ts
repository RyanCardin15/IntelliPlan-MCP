import type { Epic } from '../entities/Task.js';

/**
 * Epic Repository interface
 * Defines the contract for interacting with Epic persistence
 */
export interface EpicRepository {
  /**
   * Get all Epics
   */
  getAllEpics(): Epic[];
  
  /**
   * Get an Epic by its ID
   */
  getEpicById(id: string): Epic | undefined;
  
  /**
   * Add a new Epic
   * @returns success status (Promise for async implementations)
   */
  addEpic(epic: Epic): boolean | Promise<boolean>;
  
  /**
   * Update an existing Epic
   * @returns success status (Promise for async implementations)
   */
  updateEpic(id: string, epic: Epic): boolean | Promise<boolean>;
  
  /**
   * Delete an Epic
   * @returns success status (Promise for async implementations)
   */
  deleteEpic(id: string): boolean | Promise<boolean>;
  
  /**
   * Save all Epics to persistent storage
   */
  saveEpics(): Promise<void>;
  
  /**
   * Load Epics from persistent storage
   */
  loadEpics(): Promise<void>;
} 