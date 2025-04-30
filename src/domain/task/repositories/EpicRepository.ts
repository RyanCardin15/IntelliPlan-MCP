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
   * @returns success status
   */
  addEpic(epic: Epic): boolean;
  
  /**
   * Update an existing Epic
   * @returns success status
   */
  updateEpic(id: string, epic: Epic): boolean;
  
  /**
   * Delete an Epic
   * @returns success status
   */
  deleteEpic(id: string): boolean;
  
  /**
   * Save all Epics to persistent storage
   */
  saveEpics(): Promise<void>;
  
  /**
   * Load Epics from persistent storage
   */
  loadEpics(): Promise<void>;
} 