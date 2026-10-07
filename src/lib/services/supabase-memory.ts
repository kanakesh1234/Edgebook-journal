import { clearWorkingMemoryAccessToken, createClient } from '@/utils/supabase/client';

export type DraftType = 'entry' | 'plan' | 'reflection' | 'review' | 'settings' | 'journal_snapshot';

export interface WorkingDraft {
  id: string;
  draftType: DraftType;
  draftKey: string;
  payload: unknown;
  status: 'active' | 'persisting' | 'persisted' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ActiveSession {
  id: string;
  tabId: string;
  currentView: string | null;
  lastHeartbeat: string;
}

export interface QueuedOperation {
  id: string;
  operation: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export class SupabaseWorkingMemory {
  private supabase;
  public userId: string; // Public so the factory can check it
  private tabId: string;
  private readonly enabled: boolean;

  constructor(userId: string) {
    this.supabase = createClient();
    this.userId = userId;
    // Browser-local u_ identities are development-only and have no
    // server-verifiable session. Keep them in IndexedDB instead of giving a
    // caller-controlled identity access to remote working memory.
    this.enabled = userId.startsWith('g_');
    this.tabId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2);
  }

  // ── Draft Management ──

  async saveDraft(type: DraftType, key: string, payload: unknown): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('working_drafts')
        .upsert({
          user_id: this.userId,
          draft_type: type,
          draft_key: key,
          payload,
          status: 'active',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,draft_type,draft_key'
        });

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to save draft:', err);
    }
  }

  async loadDraft<T = unknown>(type: DraftType, key: string): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const { data, error } = await this.supabase
        .from('working_drafts')
        .select('payload')
        .eq('user_id', this.userId)
        .eq('draft_type', type)
        .eq('draft_key', key)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
      return (data?.payload as T) || null;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to load draft:', err);
      return null;
    }
  }

  async loadDrafts(type: DraftType): Promise<WorkingDraft[]> {
    if (!this.enabled) return [];
    try {
      const { data, error } = await this.supabase
        .from('working_drafts')
        .select('*')
        .eq('user_id', this.userId)
        .eq('draft_type', type)
        .neq('status', 'persisted');

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        draftType: row.draft_type as DraftType,
        draftKey: row.draft_key,
        payload: row.payload,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to load drafts:', err);
      return [];
    }
  }

  async markDraftPersisted(type: DraftType, key: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('working_drafts')
        .update({
          status: 'persisted',
          drive_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId)
        .eq('draft_type', type)
        .eq('draft_key', key);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to mark draft persisted:', err);
    }
  }

  async deleteDraft(type: DraftType, key: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('working_drafts')
        .delete()
        .eq('user_id', this.userId)
        .eq('draft_type', type)
        .eq('draft_key', key);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to delete draft:', err);
    }
  }

  async cleanupPersistedDrafts(): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('working_drafts')
        .delete()
        .eq('user_id', this.userId)
        .eq('status', 'persisted');

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to cleanup persisted drafts:', err);
    }
  }

  // ── Session Tracking ──

  async registerSession(view?: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('active_sessions')
        .insert({
          user_id: this.userId,
          tab_id: this.tabId,
          current_view: view || null,
          last_heartbeat: new Date().toISOString()
        });
      
      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to register session:', err);
    }
  }

  async heartbeat(view?: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('active_sessions')
        .update({
          current_view: view || null,
          last_heartbeat: new Date().toISOString()
        })
        .eq('user_id', this.userId)
        .eq('tab_id', this.tabId);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to heartbeat session:', err);
    }
  }

  async endSession(): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('active_sessions')
        .delete()
        .eq('user_id', this.userId)
        .eq('tab_id', this.tabId);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to end session:', err);
    }
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    if (!this.enabled) return [];
    try {
      const { data, error } = await this.supabase
        .from('active_sessions')
        .select('*')
        .eq('user_id', this.userId);

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        tabId: row.tab_id,
        currentView: row.current_view,
        lastHeartbeat: row.last_heartbeat
      }));
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to get active sessions:', err);
      return [];
    }
  }

  // ── Processing Queue ──

  async enqueueOperation(operation: string, payload: unknown): Promise<string> {
    if (!this.enabled) return '';
    try {
      const { data, error } = await this.supabase
        .from('processing_queue')
        .insert({
          user_id: this.userId,
          operation,
          payload,
          status: 'pending',
          attempts: 0
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to enqueue operation:', err);
      return '';
    }
  }

  async markOperationComplete(id: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { error } = await this.supabase
        .from('processing_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('user_id', this.userId)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to mark operation complete:', err);
    }
  }

  async markOperationFailed(id: string, errorMsg: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { data: current } = await this.supabase
        .from('processing_queue')
        .select('attempts')
        .eq('id', id)
        .single();
        
      const { error } = await this.supabase
        .from('processing_queue')
        .update({
          status: 'failed',
          last_error: errorMsg,
          attempts: (current?.attempts || 0) + 1
        })
        .eq('user_id', this.userId)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to mark operation failed:', err);
    }
  }

  async getPendingOperations(): Promise<QueuedOperation[]> {
    if (!this.enabled) return [];
    try {
      const { data, error } = await this.supabase
        .from('processing_queue')
        .select('*')
        .eq('user_id', this.userId)
        .eq('status', 'pending');

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        operation: row.operation,
        payload: row.payload,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        createdAt: row.created_at
      }));
    } catch (err) {
      console.warn('[SUPABASE]', 'Failed to get pending operations:', err);
      return [];
    }
  }
}

let _instance: SupabaseWorkingMemory | null = null;

export function getWorkingMemory(userId: string): SupabaseWorkingMemory {
  if (!_instance || _instance.userId !== userId) {
    _instance = new SupabaseWorkingMemory(userId);
  }
  return _instance;
}

export function clearWorkingMemory(): void {
  _instance = null;
  clearWorkingMemoryAccessToken();
}
