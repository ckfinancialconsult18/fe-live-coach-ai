// Hand-authored to match supabase/migrations/*.sql exactly.
// Regenerate with `supabase gen types typescript --linked` once the project
// is linked to a CLI session, and diff against this file.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'admin' | 'agent' | 'viewer';
          phone: string | null;
          agency_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']> & { id: string; email: string };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          age: number | null;
          dob: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          status: 'lead' | 'client' | 'inactive';
          source: string | null;
          tags: string[];
          notes: string | null;
          existing_coverage: string | null;
          medical_notes: string | null;
          last_call_at: string | null;
          score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['contacts']['Row']> & {
          user_id: string;
          first_name: string;
          last_name: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Row']>;
      };
      leads: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
          source: string | null;
          tags: string[];
          notes: string | null;
          assigned_to: string | null;
          age: number | null;
          state: string | null;
          city: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['leads']['Row']> & {
          user_id: string;
          first_name: string;
          last_name: string;
        };
        Update: Partial<Database['public']['Tables']['leads']['Row']>;
      };
      appointments: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          lead_id: string | null;
          title: string;
          description: string | null;
          start_time: string;
          end_time: string;
          type: 'phone' | 'video' | 'in_person';
          status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
          location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['appointments']['Row']> & {
          user_id: string;
          title: string;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database['public']['Tables']['appointments']['Row']>;
      };
      calls: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          lead_id: string | null;
          call_type: 'sales' | 'coaching' | 'role_play';
          outcome: 'policy_written' | 'follow_up' | 'not_interested' | 'no_answer' | null;
          duration_seconds: number;
          transcript: Json;
          underwriting: Json;
          metrics: Json;
          recording_path: string | null;
          started_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['calls']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['calls']['Row']>;
      };
      call_scores: {
        Row: {
          id: string;
          call_id: string;
          user_id: string;
          overall_score: number;
          scores: Json;
          strengths: string[];
          missed_opportunities: string[];
          buying_signals: string[];
          objections: string[];
          summary: string | null;
          follow_up_text: string | null;
          follow_up_email: string | null;
          crm_notes: string | null;
          improvement_plan: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['call_scores']['Row']> & {
          call_id: string;
          user_id: string;
          overall_score: number;
        };
        Update: Partial<Database['public']['Tables']['call_scores']['Row']>;
      };
      reports: {
        Row: {
          id: string;
          user_id: string;
          report_type: 'weekly' | 'monthly' | 'analytics' | 'custom';
          period_start: string;
          period_end: string;
          data: Json;
          generated_at: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['reports']['Row']> & {
          user_id: string;
          report_type: 'weekly' | 'monthly' | 'analytics' | 'custom';
          period_start: string;
          period_end: string;
        };
        Update: Partial<Database['public']['Tables']['reports']['Row']>;
      };
      commissions: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          policy_number: string | null;
          client_name: string;
          carrier: string;
          policy_type: 'final_expense' | 'mortgage_protection' | 'term' | 'whole_life' | 'universal_life';
          face_amount: number | null;
          premium: number | null;
          amount: number;
          commission_rate: number | null;
          status: 'paid' | 'pending' | 'chargeback';
          paid_date: string | null;
          month: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['commissions']['Row']> & {
          user_id: string;
          client_name: string;
          carrier: string;
          policy_type: 'final_expense' | 'mortgage_protection' | 'term' | 'whole_life' | 'universal_life';
          amount: number;
          month: string;
        };
        Update: Partial<Database['public']['Tables']['commissions']['Row']>;
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          priority: 'low' | 'medium' | 'high' | 'urgent';
          completed: boolean;
          related_to: string | null;
          related_type: 'lead' | 'client' | 'contact' | 'policy' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['tasks']['Row']> & { user_id: string; title: string };
        Update: Partial<Database['public']['Tables']['tasks']['Row']>;
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          name: string;
          category: 'application' | 'policy' | 'id' | 'medical' | 'beneficiary' | 'other';
          storage_path: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['documents']['Row']> & {
          user_id: string;
          name: string;
          storage_path: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Row']>;
      };
      knowledge_base: {
        Row: {
          id: string;
          user_id: string;
          source_call_id: string | null;
          job_id: string | null;
          type: string;
          target_file: string;
          section: string | null;
          summary: string;
          content: string;
          evidence: string | null;
          markdown_entry: string | null;
          confidence: number;
          tags: string[];
          status: 'pending' | 'approved' | 'rejected';
          is_duplicate: boolean;
          original_filename: string | null;
          call_score: number | null;
          reviewed_at: string | null;
          review_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['knowledge_base']['Row']> & {
          user_id: string;
          type: string;
          target_file: string;
          summary: string;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['knowledge_base']['Row']>;
      };
      templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: 'email' | 'sms';
          subject: string | null;
          body: string;
          merge_fields: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['templates']['Row']> & {
          user_id: string;
          name: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['templates']['Row']>;
      };
      settings: {
        Row: {
          id: string;
          user_id: string;
          profile: Json;
          agency: Json;
          notifications: Json;
          integrations: Json;
          billing: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['settings']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['settings']['Row']>;
      };
    };
  };
}
