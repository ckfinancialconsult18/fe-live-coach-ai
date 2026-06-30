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
        Relationships: [];
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
          middle_name: string | null;
          gender: 'male' | 'female' | 'other' | 'unspecified' | null;
          secondary_phone: string | null;
          county: string | null;
          marital_status: 'single' | 'married' | 'divorced' | 'widowed' | 'unspecified' | null;
          occupation: string | null;
          beneficiary_name: string | null;
          beneficiary_relationship: string | null;
          medicare: boolean | null;
          tobacco: boolean | null;
          prescription_notes: string | null;
          current_carrier: string | null;
          agent_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['contacts']['Row']> & {
          user_id: string;
          first_name: string;
          last_name: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Row']>;
        Relationships: [];
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
          lead_vendor: string | null;
          cost: number | null;
          lead_type: 'fresh' | 'aged' | 'internet' | 'direct_mail' | 'referral' | 'other' | null;
          purchased_date: string | null;
          lead_score: number | null;
          last_contact_at: string | null;
          disposition: string | null;
          attempts: number;
          appointment_date: string | null;
          policy_sold: boolean;
          close_probability: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['leads']['Row']> & {
          user_id: string;
          first_name: string;
          last_name: string;
        };
        Update: Partial<Database['public']['Tables']['leads']['Row']>;
        Relationships: [];
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
        Relationships: [];
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
          status: 'in_progress' | 'completed' | 'abandoned';
          live_state: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['calls']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['calls']['Row']>;
        Relationships: [];
      };
      call_scores: {
        Row: {
          id: string;
          call_id: string;
          user_id: string;
          overall_score: number;
          scores: Json;
          quality_scores: Json;
          timeline: Json;
          report_details: Json;
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
        Relationships: [];
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
        Relationships: [];
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
          policy_id: string | null;
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
        Relationships: [];
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
        Relationships: [];
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
          carrier_id: string | null;
          folder: string;
          tags: string[];
          version: number;
          scan_status: 'pending' | 'clean' | 'flagged' | 'error';
          original_filename: string | null;
          file_hash: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['documents']['Row']> & {
          user_id: string;
          name: string;
          storage_path: string;
        };
        Update: Partial<Database['public']['Tables']['documents']['Row']>;
        Relationships: [];
      };
      document_versions: {
        Row: {
          id: string;
          document_id: string;
          user_id: string;
          version: number;
          storage_path: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['document_versions']['Row']> & {
          document_id: string;
          user_id: string;
          version: number;
          storage_path: string;
        };
        Update: Partial<Database['public']['Tables']['document_versions']['Row']>;
        Relationships: [];
      };
      knowledge_base: {
        Row: {
          id: string;
          user_id: string;
          source_call_id: string | null;
          job_id: string | null;
          knowledge_job_id: string | null;
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      carriers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          naic: string | null;
          customer_service_phone: string | null;
          agent_support_phone: string | null;
          underwriting_contact: string | null;
          commission_schedule: Json;
          products: string[];
          states_available: string[];
          application_link: string | null;
          training_docs_url: string | null;
          website: string | null;
          contact_name: string | null;
          contact_email: string | null;
          notes: string | null;
          active_contracts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['carriers']['Row']> & { user_id: string; name: string };
        Update: Partial<Database['public']['Tables']['carriers']['Row']>;
        Relationships: [];
      };
      policies: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          carrier_id: string | null;
          carrier_name: string;
          product: string;
          policy_type: 'final_expense' | 'mortgage_protection' | 'term' | 'whole_life' | 'universal_life';
          face_amount: number | null;
          premium: number | null;
          premium_mode: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | null;
          application_number: string | null;
          policy_number: string | null;
          status: 'pending' | 'issued' | 'declined' | 'withdrawn' | 'lapsed' | 'cancelled';
          effective_date: string | null;
          issue_date: string | null;
          writing_agent: string | null;
          commission_amount: number | null;
          commission_rate: number | null;
          renewal_schedule: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['policies']['Row']> & {
          user_id: string;
          carrier_name: string;
          product: string;
          policy_type: 'final_expense' | 'mortgage_protection' | 'term' | 'whole_life' | 'universal_life';
        };
        Update: Partial<Database['public']['Tables']['policies']['Row']>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['audit_logs']['Row']> & { action: string; entity_type: string };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'task_due' | 'appointment_reminder' | 'lead_assigned' | 'commission_paid' | 'system' | 'policy_status_change';
          title: string;
          body: string | null;
          link: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          user_id: string;
          type: 'task_due' | 'appointment_reminder' | 'lead_assigned' | 'commission_paid' | 'system' | 'policy_status_change';
          title: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
        Relationships: [];
      };
      activity_feed: {
        Row: {
          id: string;
          user_id: string;
          type: 'lead' | 'client' | 'policy' | 'appointment' | 'commission' | 'task' | 'call';
          entity_id: string | null;
          text: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['activity_feed']['Row']> & {
          user_id: string;
          type: 'lead' | 'client' | 'policy' | 'appointment' | 'commission' | 'task' | 'call';
          text: string;
        };
        Update: Partial<Database['public']['Tables']['activity_feed']['Row']>;
        Relationships: [];
      };
      knowledge_categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['knowledge_categories']['Row']> & { user_id: string; name: string };
        Update: Partial<Database['public']['Tables']['knowledge_categories']['Row']>;
        Relationships: [];
      };
      knowledge_documents: {
        Row: {
          id: string;
          user_id: string;
          category_id: string | null;
          carrier_id: string | null;
          title: string;
          source_type: 'carrier_guide' | 'underwriting_manual' | 'script' | 'objection_handling' | 'closing_technique' | 'compliance' | 'product_doc' | 'training' | 'other';
          storage_path: string | null;
          mime_type: string | null;
          file_size: number | null;
          raw_text: string | null;
          status: 'processing' | 'ready' | 'failed';
          version: number;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['knowledge_documents']['Row']> & {
          user_id: string;
          title: string;
          source_type: 'carrier_guide' | 'underwriting_manual' | 'script' | 'objection_handling' | 'closing_technique' | 'compliance' | 'product_doc' | 'training' | 'other';
        };
        Update: Partial<Database['public']['Tables']['knowledge_documents']['Row']>;
        Relationships: [];
      };
      knowledge_chunks: {
        Row: {
          id: string;
          user_id: string;
          document_id: string | null;
          knowledge_base_id: string | null;
          chunk_index: number;
          content: string;
          token_count: number | null;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['knowledge_chunks']['Row']> & { user_id: string; content: string };
        Update: Partial<Database['public']['Tables']['knowledge_chunks']['Row']>;
        Relationships: [];
      };
      embedding_queue: {
        Row: {
          id: string;
          user_id: string;
          target_type: 'knowledge_document' | 'knowledge_base';
          target_id: string;
          status: 'pending' | 'processing' | 'done' | 'failed';
          attempts: number;
          error: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['embedding_queue']['Row']> & {
          user_id: string;
          target_type: 'knowledge_document' | 'knowledge_base';
          target_id: string;
        };
        Update: Partial<Database['public']['Tables']['embedding_queue']['Row']>;
        Relationships: [];
      };
      search_analytics: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          result_count: number;
          clicked_chunk_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['search_analytics']['Row']> & { user_id: string; query: string };
        Update: Partial<Database['public']['Tables']['search_analytics']['Row']>;
        Relationships: [];
      };
      coaching_history: {
        Row: {
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          stats: Json;
          recommendations: Json;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['coaching_history']['Row']> & {
          user_id: string;
          period_start: string;
          period_end: string;
        };
        Update: Partial<Database['public']['Tables']['coaching_history']['Row']>;
        Relationships: [];
      };
      pipeline_logs: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: 'upload_failure' | 'extraction_failure' | 'embedding_failure' | 'queue_failure' | 'processing_complete' | 'search_latency';
          target_type: string | null;
          target_id: string | null;
          duration_ms: number | null;
          message: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['pipeline_logs']['Row']> & {
          event_type: 'upload_failure' | 'extraction_failure' | 'embedding_failure' | 'queue_failure' | 'processing_complete' | 'search_latency';
        };
        Update: Partial<Database['public']['Tables']['pipeline_logs']['Row']>;
        Relationships: [];
      };
      knowledge_jobs: {
        Row: {
          id: string;
          user_id: string;
          original_name: string;
          format: string;
          status: 'queued' | 'parsing' | 'extracting' | 'deduplicating' | 'pending_review' | 'completed' | 'failed';
          progress: number;
          error: string | null;
          retry_count: number;
          word_count: number | null;
          extracted_count: number | null;
          new_knowledge_count: number | null;
          call_type: string | null;
          call_outcome: string | null;
          call_score: number | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['knowledge_jobs']['Row']> & {
          user_id: string;
          original_name: string;
          format: string;
        };
        Update: Partial<Database['public']['Tables']['knowledge_jobs']['Row']>;
        Relationships: [];
      };
    };
    Views: {
      clients: {
        Row: Database['public']['Tables']['contacts']['Row'];
        Relationships: [];
      };
    };
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding: number[];
          match_user_id: string;
          match_count?: number;
          min_similarity?: number;
        };
        Returns: {
          id: string;
          content: string;
          similarity: number;
          document_id: string | null;
          knowledge_base_id: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
