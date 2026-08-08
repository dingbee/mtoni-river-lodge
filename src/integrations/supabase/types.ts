export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          module: string | null
          new_value: Json | null
          previous_value: Json | null
          severity: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          severity?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          severity?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_activity_logs: {
        Row: {
          created_at: string
          domains_accessed: string[]
          duration_ms: number | null
          error: string | null
          evidence: Json
          id: string
          model: string | null
          question: string
          recommendation: string | null
          response: string | null
          status: string
          tool_args: Json
          tool_called: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          domains_accessed?: string[]
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          id?: string
          model?: string | null
          question: string
          recommendation?: string | null
          response?: string | null
          status?: string
          tool_args?: Json
          tool_called?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          domains_accessed?: string[]
          duration_ms?: number | null
          error?: string | null
          evidence?: Json
          id?: string
          model?: string | null
          question?: string
          recommendation?: string | null
          response?: string | null
          status?: string
          tool_args?: Json
          tool_called?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_analytics_recommendations: {
        Row: {
          confidence: number | null
          created_at: string
          domain: string
          evidence: Json
          id: string
          impact: string | null
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_action: string | null
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          domain: string
          evidence?: Json
          id?: string
          impact?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_action?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          domain?: string
          evidence?: Json
          id?: string
          impact?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_action?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_brand_reviews: {
        Row: {
          brand_score: number
          consistency_score: number
          content_sample: string
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          issues: Json
          model: string | null
          readability_score: number
          subject_id: string | null
          subject_label: string | null
          subject_type: string
          suggestions: Json
          tone_score: number
        }
        Insert: {
          brand_score?: number
          consistency_score?: number
          content_sample: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          issues?: Json
          model?: string | null
          readability_score?: number
          subject_id?: string | null
          subject_label?: string | null
          subject_type: string
          suggestions?: Json
          tone_score?: number
        }
        Update: {
          brand_score?: number
          consistency_score?: number
          content_sample?: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          issues?: Json
          model?: string | null
          readability_score?: number
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string
          suggestions?: Json
          tone_score?: number
        }
        Relationships: []
      }
      ai_communication_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          booking_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          draft_type: string
          guest_id: string | null
          id: string
          notes: string | null
          reasoning: string | null
          sent_at: string | null
          session_id: string | null
          status: string
          subject: string | null
          supporting_context: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          booking_id?: string | null
          channel: string
          created_at?: string
          created_by?: string | null
          draft_type: string
          guest_id?: string | null
          id?: string
          notes?: string | null
          reasoning?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject?: string | null
          supporting_context?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          booking_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          draft_type?: string
          guest_id?: string | null
          id?: string
          notes?: string | null
          reasoning?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: string
          subject?: string | null
          supporting_context?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_communication_drafts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_attributions: {
        Row: {
          booking_id: string | null
          conversion_type: string
          created_at: string
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          booking_id?: string | null
          conversion_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          booking_id?: string | null
          conversion_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_attributions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_attributions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_attributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_channels: {
        Row: {
          channel: string
          configuration: Json
          created_at: string
          display_name: string
          id: string
          inbound_enabled: boolean
          notes: string | null
          outbound_enabled: boolean
          provider: string | null
          requires_approval: boolean
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          configuration?: Json
          created_at?: string
          display_name: string
          id?: string
          inbound_enabled?: boolean
          notes?: string | null
          outbound_enabled?: boolean
          provider?: string | null
          requires_approval?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          configuration?: Json
          created_at?: string
          display_name?: string
          id?: string
          inbound_enabled?: boolean
          notes?: string | null
          outbound_enabled?: boolean
          provider?: string | null
          requires_approval?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_concierge_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string | null
          rating: string
          session_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          rating: string
          session_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          rating?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_insights: {
        Row: {
          bucket_date: string
          category: string | null
          created_at: string
          escalation_count: number
          evidence: Json | null
          id: string
          impact_score: number | null
          question_count: number
          recommended_action: string | null
          sample_questions: Json
          status: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          bucket_date: string
          category?: string | null
          created_at?: string
          escalation_count?: number
          evidence?: Json | null
          id?: string
          impact_score?: number | null
          question_count?: number
          recommended_action?: string | null
          sample_questions?: Json
          status?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          bucket_date?: string
          category?: string | null
          created_at?: string
          escalation_count?: number
          evidence?: Json | null
          id?: string
          impact_score?: number | null
          question_count?: number
          recommended_action?: string | null
          sample_questions?: Json
          status?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_concierge_intents: {
        Row: {
          confidence: number
          created_at: string
          detected_context: Json | null
          id: string
          intent_level: string
          keywords: string[] | null
          message_id: string | null
          session_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          detected_context?: Json | null
          id?: string
          intent_level: string
          keywords?: string[] | null
          message_id?: string | null
          session_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          detected_context?: Json | null
          id?: string
          intent_level?: string
          keywords?: string[] | null
          message_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_intents_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_intents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_leads: {
        Row: {
          assigned_to: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          intent_level: string
          interests: string[] | null
          name: string | null
          notes: string | null
          party_adults: number | null
          party_children: number | null
          phone: string | null
          session_id: string | null
          status: string
          travel_period_end: string | null
          travel_period_start: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          intent_level?: string
          interests?: string[] | null
          name?: string | null
          notes?: string | null
          party_adults?: number | null
          party_children?: number | null
          phone?: string | null
          session_id?: string | null
          status?: string
          travel_period_end?: string | null
          travel_period_start?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          intent_level?: string
          interests?: string[] | null
          name?: string | null
          notes?: string | null
          party_adults?: number | null
          party_children?: number | null
          phone?: string | null
          session_id?: string | null
          status?: string
          travel_period_end?: string | null
          travel_period_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_leads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_messages: {
        Row: {
          citations: Json
          confidence: number | null
          content: string
          created_at: string
          escalated: boolean
          id: string
          latency_ms: number | null
          model: string | null
          role: string
          session_id: string
          tool_calls: Json
        }
        Insert: {
          citations?: Json
          confidence?: number | null
          content: string
          created_at?: string
          escalated?: boolean
          id?: string
          latency_ms?: number | null
          model?: string | null
          role: string
          session_id: string
          tool_calls?: Json
        }
        Update: {
          citations?: Json
          confidence?: number | null
          content?: string
          created_at?: string
          escalated?: boolean
          id?: string
          latency_ms?: number | null
          model?: string | null
          role?: string
          session_id?: string
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_outcomes: {
        Row: {
          confidence: number | null
          created_at: string
          evidence: Json | null
          id: string
          outcome_type: string
          session_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence?: Json | null
          id?: string
          outcome_type: string
          session_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence?: Json | null
          id?: string
          outcome_type?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_outcomes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_recommendations: {
        Row: {
          booking_id: string | null
          confidence: number
          created_at: string
          evidence: Json | null
          guest_id: string | null
          id: string
          item_name: string
          item_slug: string
          message_id: string | null
          notes: string | null
          reasoning: string
          recommendation_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json | null
          guest_id?: string | null
          id?: string
          item_name: string
          item_slug: string
          message_id?: string | null
          notes?: string | null
          reasoning: string
          recommendation_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json | null
          guest_id?: string | null
          id?: string
          item_name?: string
          item_slug?: string
          message_id?: string | null
          notes?: string | null
          reasoning?: string
          recommendation_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_recommendations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_recommendations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_concierge_sessions: {
        Row: {
          channel: string
          channel_thread_id: string | null
          created_at: string
          escalated: boolean
          escalation_channel: string | null
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          identity_confidence: number
          last_active_at: string
          locale: string | null
          message_count: number
          page_context: Json
          referer: string | null
          session_token: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          channel?: string
          channel_thread_id?: string | null
          created_at?: string
          escalated?: boolean
          escalation_channel?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          identity_confidence?: number
          last_active_at?: string
          locale?: string | null
          message_count?: number
          page_context?: Json
          referer?: string | null
          session_token: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          channel?: string
          channel_thread_id?: string | null
          created_at?: string
          escalated?: boolean
          escalation_channel?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          identity_confidence?: number
          last_active_at?: string
          locale?: string | null
          message_count?: number
          page_context?: Json
          referer?: string | null
          session_token?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_concierge_sessions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_concierge_sessions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_concierge_sessions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_configurations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module: string
          setting_key: string
          setting_value: Json
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          module: string
          setting_key: string
          setting_value: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          setting_key?: string
          setting_value?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      ai_conversation_participants: {
        Row: {
          channel: string
          confidence: number
          created_at: string
          guest_id: string | null
          id: string
          identifier_type: string
          identifier_value: string
          session_id: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          channel: string
          confidence?: number
          created_at?: string
          guest_id?: string | null
          id?: string
          identifier_type: string
          identifier_value: string
          session_id: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          channel?: string
          confidence?: number
          created_at?: string
          guest_id?: string | null
          id?: string
          identifier_type?: string
          identifier_value?: string
          session_id?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string
          note: string | null
          rating: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          note?: string | null
          rating: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          note?: string | null
          rating?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_copilot_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_copilot_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_messages: {
        Row: {
          citations: Json
          confidence: number | null
          content: string
          created_at: string
          domains_used: string[] | null
          duration_ms: number | null
          evidence: Json
          id: string
          model: string | null
          recommendation: string | null
          role: string
          session_id: string
          tools_used: string[] | null
          user_id: string
        }
        Insert: {
          citations?: Json
          confidence?: number | null
          content: string
          created_at?: string
          domains_used?: string[] | null
          duration_ms?: number | null
          evidence?: Json
          id?: string
          model?: string | null
          recommendation?: string | null
          role: string
          session_id: string
          tools_used?: string[] | null
          user_id: string
        }
        Update: {
          citations?: Json
          confidence?: number | null
          content?: string
          created_at?: string
          domains_used?: string[] | null
          duration_ms?: number | null
          evidence?: Json
          id?: string
          model?: string | null
          recommendation?: string | null
          role?: string
          session_id?: string
          tools_used?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_copilot_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_copilot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_sessions: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          role_snapshot: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          role_snapshot?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          role_snapshot?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_escalations: {
        Row: {
          ai_confidence: number | null
          assigned_to: string | null
          channel: string
          created_at: string
          guest_id: string | null
          id: string
          priority: number
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          session_id: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          assigned_to?: string | null
          channel: string
          created_at?: string
          guest_id?: string | null
          id?: string
          priority?: number
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          session_id: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          assigned_to?: string | null
          channel?: string
          created_at?: string
          guest_id?: string | null
          id?: string
          priority?: number
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          session_id?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_escalations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_executive_briefings: {
        Row: {
          briefing_date: string
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          model: string
          sections: Json
          summary: string
          top_recommendations: Json
          updated_at: string
        }
        Insert: {
          briefing_date?: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string
          sections?: Json
          summary: string
          top_recommendations?: Json
          updated_at?: string
        }
        Update: {
          briefing_date?: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string
          sections?: Json
          summary?: string
          top_recommendations?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_executive_kpi_snapshots: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          kpis: Json
          period: string
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          kpis?: Json
          period: string
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          kpis?: Json
          period?: string
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          activity_log_id: string | null
          comment: string | null
          created_at: string
          id: string
          module: string | null
          rating: string
          user_id: string | null
        }
        Insert: {
          activity_log_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          module?: string | null
          rating: string
          user_id?: string | null
        }
        Update: {
          activity_log_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          module?: string | null
          rating?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_activity_log_id_fkey"
            columns: ["activity_log_id"]
            isOneToOne: false
            referencedRelation: "ai_activity_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guest_alerts: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          created_at: string
          detail: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          guest_id: string | null
          id: string
          kind: string
          severity: string
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          guest_id?: string | null
          id?: string
          kind: string
          severity?: string
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          guest_id?: string | null
          id?: string
          kind?: string
          severity?: string
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_guest_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_alerts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_alerts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_guest_alerts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_alerts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ops_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guest_journey_events: {
        Row: {
          booking_id: string | null
          created_at: string
          event_type: string
          guest_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          source: string
          title: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          event_type: string
          guest_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          title?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          event_type?: string
          guest_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          source?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_guest_journey_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_journey_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_journey_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_journey_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_guest_journey_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guest_memories: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence: number
          created_at: string
          guest_id: string | null
          id: string
          memory_key: string
          memory_type: string
          memory_value: string
          notes: string | null
          session_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number
          created_at?: string
          guest_id?: string | null
          id?: string
          memory_key: string
          memory_type: string
          memory_value: string
          notes?: string | null
          session_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence?: number
          created_at?: string
          guest_id?: string | null
          id?: string
          memory_key?: string
          memory_type?: string
          memory_value?: string
          notes?: string | null
          session_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_guest_memories_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_memories_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_guest_memories_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_memories_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_guest_recommendations: {
        Row: {
          action_task_id: string | null
          actioned_at: string | null
          actioned_by: string | null
          body: string | null
          booking_id: string | null
          category: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          evidence: Json
          expected_value: number | null
          guest_id: string | null
          id: string
          kind: string
          model: string | null
          reasoning: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          body?: string | null
          booking_id?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          expected_value?: number | null
          guest_id?: string | null
          id?: string
          kind: string
          model?: string | null
          reasoning?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          body?: string | null
          booking_id?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          expected_value?: number | null
          guest_id?: string | null
          id?: string
          kind?: string
          model?: string | null
          reasoning?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_guest_recommendations_action_task_id_fkey"
            columns: ["action_task_id"]
            isOneToOne: false
            referencedRelation: "ops_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_recommendations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_recommendations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_guest_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_guest_recommendations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_health_events: {
        Row: {
          category: string
          created_at: string
          details: Json
          id: string
          message: string
          module: string | null
          resolved: boolean
          severity: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json
          id?: string
          message: string
          module?: string | null
          resolved?: boolean
          severity?: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json
          id?: string
          message?: string
          module?: string | null
          resolved?: boolean
          severity?: string
        }
        Relationships: []
      }
      ai_knowledge_notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metadata: Json
          notification_type: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          notification_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          notification_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_knowledge_scheduler_config: {
        Row: {
          confidence_threshold: number
          created_at: string
          cron_expression: string
          enabled: boolean
          freshness_rules: Json
          id: number
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          tasks: Json
          updated_at: string
        }
        Insert: {
          confidence_threshold?: number
          created_at?: string
          cron_expression?: string
          enabled?: boolean
          freshness_rules?: Json
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          tasks?: Json
          updated_at?: string
        }
        Update: {
          confidence_threshold?: number
          created_at?: string
          cron_expression?: string
          enabled?: boolean
          freshness_rules?: Json
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          tasks?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_knowledge_search_log: {
        Row: {
          asked_by: string | null
          confidence: number | null
          created_at: string
          id: string
          matched_source_ids: string[]
          query: string
          result_count: number
        }
        Insert: {
          asked_by?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          matched_source_ids?: string[]
          query: string
          result_count?: number
        }
        Update: {
          asked_by?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          matched_source_ids?: string[]
          query?: string
          result_count?: number
        }
        Relationships: []
      }
      ai_knowledge_sources: {
        Row: {
          completeness_score: number | null
          confidence_score: number | null
          content: string
          content_tsv: unknown
          created_at: string
          created_by: string | null
          external_ref: string | null
          freshness_score: number | null
          id: string
          indexed_at: string | null
          last_synced_at: string | null
          last_used_at: string | null
          metadata: Json
          quality_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_type: string
          source_updated_at: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          url: string | null
          usage_count: number
          usage_score: number | null
        }
        Insert: {
          completeness_score?: number | null
          confidence_score?: number | null
          content?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          freshness_score?: number | null
          id?: string
          indexed_at?: string | null
          last_synced_at?: string | null
          last_used_at?: string | null
          metadata?: Json
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type: string
          source_updated_at?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          url?: string | null
          usage_count?: number
          usage_score?: number | null
        }
        Update: {
          completeness_score?: number | null
          confidence_score?: number | null
          content?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          freshness_score?: number | null
          id?: string
          indexed_at?: string | null
          last_synced_at?: string | null
          last_used_at?: string | null
          metadata?: Json
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: string
          source_updated_at?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          usage_count?: number
          usage_score?: number | null
        }
        Relationships: []
      }
      ai_knowledge_sync_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          result: Json
          started_at: string
          status: string
          tasks: Json
          triggered_by: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json
          started_at?: string
          status?: string
          tasks?: Json
          triggered_by?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json
          started_at?: string
          status?: string
          tasks?: Json
          triggered_by?: string
        }
        Relationships: []
      }
      ai_marketing_priorities: {
        Row: {
          confidence: number
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          model: string | null
          priorities: Json
          summary: string | null
          week_start: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          priorities?: Json
          summary?: string | null
          week_start: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          priorities?: Json
          summary?: string | null
          week_start?: string
        }
        Relationships: []
      }
      ai_marketing_recommendations: {
        Row: {
          action: string
          action_task_id: string | null
          actioned_at: string | null
          actioned_by: string | null
          confidence: number
          created_at: string
          evidence: Json
          expected_impact: string | null
          generated_by: string | null
          id: string
          impact_score: number | null
          kind: string
          model: string | null
          reasoning: string
          status: string
          suggested_payload: Json
          target_id: string | null
          target_label: string | null
          target_route: string | null
          title: string
          updated_at: string
        }
        Insert: {
          action: string
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          expected_impact?: string | null
          generated_by?: string | null
          id?: string
          impact_score?: number | null
          kind: string
          model?: string | null
          reasoning: string
          status?: string
          suggested_payload?: Json
          target_id?: string | null
          target_label?: string | null
          target_route?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          action?: string
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          expected_impact?: string | null
          generated_by?: string | null
          id?: string
          impact_score?: number | null
          kind?: string
          model?: string | null
          reasoning?: string
          status?: string
          suggested_payload?: Json
          target_id?: string | null
          target_label?: string | null
          target_route?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          event_type: string
          id: string
          memory_id: string | null
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type: string
          id?: string
          memory_id?: string | null
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type?: string
          id?: string
          memory_id?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_events_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "ai_guest_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operations_alerts: {
        Row: {
          alert_type: string
          booking_id: string | null
          confidence: number | null
          created_at: string
          evidence: Json
          id: string
          notes: string | null
          reasoning: string
          recommended_action: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          booking_id?: string | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          notes?: string | null
          reasoning: string
          recommended_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          booking_id?: string | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          notes?: string | null
          reasoning?: string
          recommended_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_operations_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_operations_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_operations_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operations_briefings: {
        Row: {
          briefing_date: string
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          metrics: Json
          priorities: Json
          recommendations: Json
          risks: Json
          summary: string
          updated_at: string
        }
        Insert: {
          briefing_date: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          metrics?: Json
          priorities?: Json
          recommendations?: Json
          risks?: Json
          summary: string
          updated_at?: string
        }
        Update: {
          briefing_date?: string
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          metrics?: Json
          priorities?: Json
          recommendations?: Json
          risks?: Json
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_operations_insights: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          evidence: Json
          id: string
          impact_score: number | null
          notes: string | null
          reasoning: string | null
          recommendation: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          impact_score?: number | null
          notes?: string | null
          reasoning?: string | null
          recommendation: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          impact_score?: number | null
          notes?: string | null
          reasoning?: string | null
          recommendation?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_operations_patterns: {
        Row: {
          confidence: number
          created_at: string
          description: string
          evidence: Json
          generated_by: string | null
          id: string
          metric_change: number | null
          notes: string | null
          occurrences: number
          pattern_type: string
          recommendation: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          timeframe_days: number
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          description: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          metric_change?: number | null
          notes?: string | null
          occurrences?: number
          pattern_type: string
          recommendation?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          timeframe_days?: number
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          description?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          metric_change?: number | null
          notes?: string | null
          occurrences?: number
          pattern_type?: string
          recommendation?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          timeframe_days?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_organisations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_personalization_events: {
        Row: {
          created_at: string
          detail: Json
          event_type: string
          guest_id: string | null
          id: string
          memory_ids: string[]
          session_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_type: string
          guest_id?: string | null
          id?: string
          memory_ids?: string[]
          session_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          event_type?: string
          guest_id?: string | null
          id?: string
          memory_ids?: string[]
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_personalization_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_personalization_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_personalization_events_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_personalization_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_concierge_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pricing_recommendations: {
        Row: {
          action: string
          action_task_id: string | null
          actioned_at: string | null
          actioned_by: string | null
          confidence: number
          created_at: string
          current_rate: number | null
          delta_pct: number | null
          evidence: Json
          expected_impact: number | null
          id: string
          model: string | null
          reasoning: string
          room_id: string | null
          status: string
          suggested_rate: number | null
          updated_at: string
          window_from: string
          window_to: string
        }
        Insert: {
          action: string
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          current_rate?: number | null
          delta_pct?: number | null
          evidence?: Json
          expected_impact?: number | null
          id?: string
          model?: string | null
          reasoning: string
          room_id?: string | null
          status?: string
          suggested_rate?: number | null
          updated_at?: string
          window_from: string
          window_to: string
        }
        Update: {
          action?: string
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          current_rate?: number | null
          delta_pct?: number | null
          evidence?: Json
          expected_impact?: number | null
          id?: string
          model?: string | null
          reasoning?: string
          room_id?: string | null
          status?: string
          suggested_rate?: number | null
          updated_at?: string
          window_from?: string
          window_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_recommendations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_library: {
        Row: {
          allowed_roles: string[] | null
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          prompt: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          allowed_roles?: string[] | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          allowed_roles?: string[] | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          module: string
          notes: string | null
          prompt_key: string
          prompt_text: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module: string
          notes?: string | null
          prompt_key: string
          prompt_text: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module?: string
          notes?: string | null
          prompt_key?: string
          prompt_text?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ai_properties: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organisation_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organisation_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organisation_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_properties_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "ai_organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reputation_insights: {
        Row: {
          complaints: Json
          compliments: Json
          confidence: number
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          model: string | null
          period_from: string | null
          period_to: string | null
          recommendations: Json
          response_drafts: Json
          scope: string
          sentiment_score: number | null
          source: string | null
          summary: string
          themes: Json
        }
        Insert: {
          complaints?: Json
          compliments?: Json
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          period_from?: string | null
          period_to?: string | null
          recommendations?: Json
          response_drafts?: Json
          scope?: string
          sentiment_score?: number | null
          source?: string | null
          summary: string
          themes?: Json
        }
        Update: {
          complaints?: Json
          compliments?: Json
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          model?: string | null
          period_from?: string | null
          period_to?: string | null
          recommendations?: Json
          response_drafts?: Json
          scope?: string
          sentiment_score?: number | null
          source?: string | null
          summary?: string
          themes?: Json
        }
        Relationships: []
      }
      ai_revenue_alerts: {
        Row: {
          action_task_id: string | null
          actioned_at: string | null
          actioned_by: string | null
          assigned_to: string | null
          created_at: string
          detail: string | null
          evidence: Json
          id: string
          kind: string
          metric: Json
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          detail?: string | null
          evidence?: Json
          id?: string
          kind: string
          metric?: Json
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          detail?: string | null
          evidence?: Json
          id?: string
          kind?: string
          metric?: Json
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_revenue_forecasts: {
        Row: {
          assumptions: Json
          breakdown: Json
          confidence: number
          created_at: string
          evidence: Json
          expected_occupancy: number
          expected_revenue: number
          from_date: string
          generated_by: string | null
          horizon_days: number
          id: string
          model: string | null
          to_date: string
        }
        Insert: {
          assumptions?: Json
          breakdown?: Json
          confidence?: number
          created_at?: string
          evidence?: Json
          expected_occupancy?: number
          expected_revenue?: number
          from_date: string
          generated_by?: string | null
          horizon_days: number
          id?: string
          model?: string | null
          to_date: string
        }
        Update: {
          assumptions?: Json
          breakdown?: Json
          confidence?: number
          created_at?: string
          evidence?: Json
          expected_occupancy?: number
          expected_revenue?: number
          from_date?: string
          generated_by?: string | null
          horizon_days?: number
          id?: string
          model?: string | null
          to_date?: string
        }
        Relationships: []
      }
      ai_revenue_opportunities: {
        Row: {
          action_task_id: string | null
          actioned_at: string | null
          actioned_by: string | null
          confidence: number
          created_at: string
          detail: string | null
          estimated_impact: number | null
          evidence: Json
          id: string
          kind: string
          model: string | null
          recommended_action: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          detail?: string | null
          estimated_impact?: number | null
          evidence?: Json
          id?: string
          kind: string
          model?: string | null
          recommended_action?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_task_id?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          confidence?: number
          created_at?: string
          detail?: string | null
          estimated_impact?: number | null
          evidence?: Json
          id?: string
          kind?: string
          model?: string | null
          recommended_action?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_room_readiness_insights: {
        Row: {
          booking_id: string | null
          confidence: number
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          insight_type: string
          notes: string | null
          priority: string
          reasoning: string
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          insight_type: string
          notes?: string | null
          priority?: string
          reasoning: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          insight_type?: string
          notes?: string | null
          priority?: string
          reasoning?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_room_readiness_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_room_readiness_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_room_readiness_insights_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_service_recovery_insights: {
        Row: {
          booking_id: string | null
          confidence: number
          created_at: string
          evidence: Json
          generated_by: string | null
          guest_id: string | null
          id: string
          notes: string | null
          recommendation: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          signal: string
          signal_source: string
          source_ref: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          guest_id?: string | null
          id?: string
          notes?: string | null
          recommendation: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          signal: string
          signal_source: string
          source_ref?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          guest_id?: string | null
          id?: string
          notes?: string | null
          recommendation?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          signal?: string
          signal_source?: string
          source_ref?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_service_recovery_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_service_recovery_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_service_recovery_insights_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_service_recovery_insights_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "ai_service_recovery_insights_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_staff_operations_insights: {
        Row: {
          affected_area: string | null
          confidence: number
          created_at: string
          evidence: Json
          generated_by: string | null
          id: string
          insight_type: string
          notes: string | null
          reasoning: string
          recommendation: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_area?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          insight_type: string
          notes?: string | null
          reasoning: string
          recommendation: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_area?: string | null
          confidence?: number
          created_at?: string
          evidence?: Json
          generated_by?: string | null
          id?: string
          insight_type?: string
          notes?: string | null
          reasoning?: string
          recommendation?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_stay_insights: {
        Row: {
          booking_id: string
          confidence: number | null
          content: string
          created_at: string
          evidence: Json
          id: string
          insight_type: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          confidence?: number | null
          content: string
          created_at?: string
          evidence?: Json
          id?: string
          insight_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          confidence?: number | null
          content?: string
          created_at?: string
          evidence?: Json
          id?: string
          insight_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_stay_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_stay_insights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_strategic_risks: {
        Row: {
          created_at: string
          detected_at: string
          domains: string[]
          evidence: Json
          id: string
          reasoning: string
          resolved_at: string | null
          resolved_by: string | null
          risk_type: string
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          domains?: string[]
          evidence?: Json
          id?: string
          reasoning: string
          resolved_at?: string | null
          resolved_by?: string | null
          risk_type: string
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          domains?: string[]
          evidence?: Json
          id?: string
          reasoning?: string
          resolved_at?: string | null
          resolved_by?: string | null
          risk_type?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_suggestions: {
        Row: {
          created_at: string
          id: string
          input: Json
          kind: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion: Json
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion?: Json
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["ai_suggestion_kind"]
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_suggestion_status"]
          suggestion?: Json
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_trend_snapshots: {
        Row: {
          captured_at: string
          created_at: string
          current_value: number | null
          delta_pct: number | null
          direction: string | null
          domain: string
          evidence: Json
          id: string
          metric: string
          previous_value: number | null
          updated_at: string
          window_days: number
        }
        Insert: {
          captured_at?: string
          created_at?: string
          current_value?: number | null
          delta_pct?: number | null
          direction?: string | null
          domain: string
          evidence?: Json
          id?: string
          metric: string
          previous_value?: number | null
          updated_at?: string
          window_days: number
        }
        Update: {
          captured_at?: string
          created_at?: string
          current_value?: number | null
          delta_pct?: number | null
          direction?: string | null
          domain?: string
          evidence?: Json
          id?: string
          metric?: string
          previous_value?: number | null
          updated_at?: string
          window_days?: number
        }
        Relationships: []
      }
      ai_usage_metrics: {
        Row: {
          created_at: string
          day: string
          estimated_cost_usd: number
          estimated_tokens: number
          failed: number
          id: string
          module: string
          requests: number
          successful: number
          total_duration_ms: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day: string
          estimated_cost_usd?: number
          estimated_tokens?: number
          failed?: number
          id?: string
          module: string
          requests?: number
          successful?: number
          total_duration_ms?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: string
          estimated_cost_usd?: number
          estimated_tokens?: number
          failed?: number
          id?: string
          module?: string
          requests?: number
          successful?: number
          total_duration_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      analytics_dashboards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          layout: Json
          name: string
          owner_id: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          layout?: Json
          name: string
          owner_id?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          layout?: Json
          name?: string
          owner_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_reports: {
        Row: {
          created_at: string
          generated_by: string | null
          id: string
          kind: string
          payload: Json
          period: string
          period_end: string
          period_start: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_by?: string | null
          id?: string
          kind: string
          payload?: Json
          period: string
          period_end: string
          period_start: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_by?: string | null
          id?: string
          kind?: string
          payload?: Json
          period?: string
          period_end?: string
          period_start?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          created_at: string
          dimensions: Json
          domain: string
          id: string
          metric: string
          period: string
          period_end: string | null
          period_start: string
          source: string | null
          updated_at: string
          value: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          dimensions?: Json
          domain: string
          id?: string
          metric: string
          period?: string
          period_end?: string | null
          period_start?: string
          source?: string | null
          updated_at?: string
          value?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          dimensions?: Json
          domain?: string
          id?: string
          metric?: string
          period?: string
          period_end?: string | null
          period_start?: string
          source?: string | null
          updated_at?: string
          value?: number | null
          value_text?: string | null
        }
        Relationships: []
      }
      analytics_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          id: string
          kind: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          id?: string
          kind: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          id?: string
          kind?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          approval_kind: string
          approver_roles: string[]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          details: Json
          id: string
          requested_by: string | null
          status: string
          subject: string
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          approval_kind: string
          approver_roles?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: Json
          id?: string
          requested_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          approval_kind?: string
          approver_roles?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: Json
          id?: string
          requested_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      arrival_information: {
        Row: {
          accessibility_needs: string | null
          airport: string | null
          arrival_date: string | null
          arrival_mode: string | null
          booking_id: string
          checkin_id: string
          created_at: string
          dietary_requirements: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          estimated_arrival_time: string | null
          flight_arrival_time: string | null
          flight_number: string | null
          id: string
          special_requests: string | null
          transfer_notes: string | null
          transfer_required: boolean
          updated_at: string
          visit_purpose: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          airport?: string | null
          arrival_date?: string | null
          arrival_mode?: string | null
          booking_id: string
          checkin_id: string
          created_at?: string
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          estimated_arrival_time?: string | null
          flight_arrival_time?: string | null
          flight_number?: string | null
          id?: string
          special_requests?: string | null
          transfer_notes?: string | null
          transfer_required?: boolean
          updated_at?: string
          visit_purpose?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          airport?: string | null
          arrival_date?: string | null
          arrival_mode?: string | null
          booking_id?: string
          checkin_id?: string
          created_at?: string
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          estimated_arrival_time?: string | null
          flight_arrival_time?: string | null
          flight_number?: string | null
          id?: string
          special_requests?: string | null
          transfer_notes?: string | null
          transfer_required?: boolean
          updated_at?: string
          visit_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrival_information_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_information_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_information_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "guest_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      arrival_passes: {
        Row: {
          booking_id: string
          checkin_id: string
          created_at: string
          expires_at: string
          guest_id: string | null
          id: string
          issued_at: string
          last_scanned_at: string | null
          metadata: Json
          reservation_snapshot: Json
          scan_count: number
          status: Database["public"]["Enums"]["arrival_pass_status"]
          token: string
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          booking_id: string
          checkin_id: string
          created_at?: string
          expires_at: string
          guest_id?: string | null
          id?: string
          issued_at?: string
          last_scanned_at?: string | null
          metadata?: Json
          reservation_snapshot?: Json
          scan_count?: number
          status?: Database["public"]["Enums"]["arrival_pass_status"]
          token: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          booking_id?: string
          checkin_id?: string
          created_at?: string
          expires_at?: string
          guest_id?: string | null
          id?: string
          issued_at?: string
          last_scanned_at?: string | null
          metadata?: Json
          reservation_snapshot?: Json
          scan_count?: number
          status?: Database["public"]["Enums"]["arrival_pass_status"]
          token?: string
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrival_passes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_passes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_passes_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "guest_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_passes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_passes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "arrival_passes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_extras: {
        Row: {
          booking_id: string
          created_at: string
          extra_id: string
          id: string
          line_total: number
          quantity: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          extra_id: string
          id?: string
          line_total: number
          quantity?: number
          unit_price: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          extra_id?: string
          id?: string
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_holds: {
        Row: {
          check_in: string
          check_out: string
          converted_booking_id: string | null
          created_at: string
          expires_at: string
          guest_email: string | null
          id: string
          metadata: Json
          room_id: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in: string
          check_out: string
          converted_booking_id?: string | null
          created_at?: string
          expires_at: string
          guest_email?: string | null
          id?: string
          metadata?: Json
          room_id: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          converted_booking_id?: string | null
          created_at?: string
          expires_at?: string
          guest_email?: string | null
          id?: string
          metadata?: Json
          room_id?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_converted_booking_id_fkey"
            columns: ["converted_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_converted_booking_id_fkey"
            columns: ["converted_booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_nights: {
        Row: {
          booking_id: string
          created_at: string
          date: string
          id: string
          nightly_rate: number
          room_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          date: string
          id?: string
          nightly_rate: number
          room_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          date?: string
          id?: string
          nightly_rate?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_nights_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_nights_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          balance_amount: number
          balance_due: number
          cancelled_at: string | null
          check_in: string
          check_out: string
          checked_in_at: string | null
          children: number
          children_7_plus: number
          children_below_6: number
          confirmed_at: string | null
          country: string | null
          created_at: string
          currency: string
          deposit_amount: number
          extras_total: number
          guest_email: string
          guest_id: string | null
          guest_name: string
          guest_phone: string | null
          guest_type: Database["public"]["Enums"]["guest_type"]
          id: string
          invoice_number: string | null
          nights: number
          notes: string | null
          paid_amount: number | null
          payment_completed_at: string | null
          payment_failed_at: string | null
          payment_initiated_at: string | null
          payment_method: string | null
          payment_mismatch_at: string | null
          payment_provider: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference: string | null
          pesapal_order_tracking_id: string | null
          reference: string
          room_id: string
          source: string
          special_requests: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal: number
          taxes: number
          total: number
          updated_at: string
          visit_purpose: string | null
        }
        Insert: {
          adults?: number
          balance_amount?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in: string
          check_out: string
          checked_in_at?: string | null
          children?: number
          children_7_plus?: number
          children_below_6?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email: string
          guest_id?: string | null
          guest_name: string
          guest_phone?: string | null
          guest_type?: Database["public"]["Enums"]["guest_type"]
          id?: string
          invoice_number?: string | null
          nights: number
          notes?: string | null
          paid_amount?: number | null
          payment_completed_at?: string | null
          payment_failed_at?: string | null
          payment_initiated_at?: string | null
          payment_method?: string | null
          payment_mismatch_at?: string | null
          payment_provider?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          reference: string
          room_id: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
          visit_purpose?: string | null
        }
        Update: {
          adults?: number
          balance_amount?: number
          balance_due?: number
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          checked_in_at?: string | null
          children?: number
          children_7_plus?: number
          children_below_6?: number
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number
          extras_total?: number
          guest_email?: string
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string | null
          guest_type?: Database["public"]["Enums"]["guest_type"]
          id?: string
          invoice_number?: string | null
          nights?: number
          notes?: string | null
          paid_amount?: number | null
          payment_completed_at?: string | null
          payment_failed_at?: string | null
          payment_initiated_at?: string | null
          payment_method?: string | null
          payment_mismatch_at?: string | null
          payment_provider?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          reference?: string
          room_id?: string
          source?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number
          taxes?: number
          total?: number
          updated_at?: string
          visit_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_tokens: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          label: string
          notes: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          actor_id: string | null
          booking_id: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          event_type: string
          hold_id: string | null
          id: string
          payload: Json
          room_id: string | null
        }
        Insert: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          event_type: string
          hold_id?: string | null
          id?: string
          payload?: Json
          room_id?: string | null
        }
        Update: {
          actor_id?: string | null
          booking_id?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          event_type?: string
          hold_id?: string | null
          id?: string
          payload?: Json
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "booking_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          associated_content: Json
          audience: string | null
          budget: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          end_date: string | null
          id: string
          landing_page: string | null
          name: string
          notes: string | null
          objective: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          associated_content?: Json
          audience?: string | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          landing_page?: string | null
          name: string
          notes?: string | null
          objective?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          associated_content?: Json
          audience?: string | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          end_date?: string | null
          id?: string
          landing_page?: string | null
          name?: string
          notes?: string | null
          objective?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      cms_blocks: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_visible: boolean
          kind: Database["public"]["Enums"]["cms_block_kind"]
          page_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_visible?: boolean
          kind: Database["public"]["Enums"]["cms_block_kind"]
          page_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_visible?: boolean
          kind?: Database["public"]["Enums"]["cms_block_kind"]
          page_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_blocks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          page_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          page_id: string
          snapshot?: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          page_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          route_path: string | null
          scheduled_at: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          route_path?: string | null
          scheduled_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          route_path?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      content_calendar_entries: {
        Row: {
          created_at: string
          ends_at: string | null
          entry_type: Database["public"]["Enums"]["calendar_entry_type"]
          id: string
          linked_id: string | null
          linked_type: string | null
          notes: string | null
          owner: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          entry_type: Database["public"]["Enums"]["calendar_entry_type"]
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          owner?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          entry_type?: Database["public"]["Enums"]["calendar_entry_type"]
          id?: string
          linked_id?: string | null
          linked_type?: string | null
          notes?: string | null
          owner?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          booking_id: string | null
          event_type: string
          id: string
          message_id: string | null
          metadata: Json
          occurred_at: string
          recipient_email: string | null
          template_name: string | null
        }
        Insert: {
          booking_id?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          recipient_email?: string | null
          template_name?: string | null
        }
        Update: {
          booking_id?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          recipient_email?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      extras: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          price: number
          slug: string
          sort_order: number
          unit: Database["public"]["Enums"]["extra_unit"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          price: number
          slug: string
          sort_order?: number
          unit?: Database["public"]["Enums"]["extra_unit"]
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          slug?: string
          sort_order?: number
          unit?: Database["public"]["Enums"]["extra_unit"]
        }
        Relationships: []
      }
      financial_alerts: {
        Row: {
          alert_type: string
          amount: number | null
          booking_id: string | null
          created_at: string
          currency: string | null
          detail: string | null
          id: string
          metadata: Json
          reference: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          reference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          detail?: string | null
          id?: string
          metadata?: Json
          reference?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_checkin_activity: {
        Row: {
          action: string
          booking_id: string | null
          checkin_id: string
          created_at: string
          detail: Json
          id: string
          session_id: string | null
        }
        Insert: {
          action: string
          booking_id?: string | null
          checkin_id: string
          created_at?: string
          detail?: Json
          id?: string
          session_id?: string | null
        }
        Update: {
          action?: string
          booking_id?: string | null
          checkin_id?: string
          created_at?: string
          detail?: Json
          id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_checkin_activity_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkin_activity_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkin_activity_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "guest_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_checkins: {
        Row: {
          booking_id: string
          checked_in_at: string | null
          created_at: string
          draft: Json
          draft_step: number
          expires_at: string
          guest_id: string | null
          id: string
          last_activity_at: string | null
          locked_at: string | null
          metadata: Json
          rejection_reason: string | null
          reservation_snapshot: Json
          reviewed_at: string | null
          reviewed_by: string | null
          room_state_id: string | null
          session_id: string | null
          session_started_at: string | null
          signature_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["checkin_status"]
          submitted_at: string | null
          terms_accepted_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          checked_in_at?: string | null
          created_at?: string
          draft?: Json
          draft_step?: number
          expires_at?: string
          guest_id?: string | null
          id?: string
          last_activity_at?: string | null
          locked_at?: string | null
          metadata?: Json
          rejection_reason?: string | null
          reservation_snapshot?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_state_id?: string | null
          session_id?: string | null
          session_started_at?: string | null
          signature_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["checkin_status"]
          submitted_at?: string | null
          terms_accepted_at?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          checked_in_at?: string | null
          created_at?: string
          draft?: Json
          draft_step?: number
          expires_at?: string
          guest_id?: string | null
          id?: string
          last_activity_at?: string | null
          locked_at?: string | null
          metadata?: Json
          rejection_reason?: string | null
          reservation_snapshot?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_state_id?: string | null
          session_id?: string | null
          session_started_at?: string | null
          signature_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["checkin_status"]
          submitted_at?: string | null
          terms_accepted_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_checkins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkins_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkins_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_checkins_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkins_room_state_id_fkey"
            columns: ["room_state_id"]
            isOneToOne: false
            referencedRelation: "room_states"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_communications: {
        Row: {
          author_id: string | null
          body: string | null
          booking_id: string | null
          channel: string
          created_at: string
          direction: string
          guest_id: string
          id: string
          meta: Json
          occurred_at: string
          subject: string | null
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel: string
          created_at?: string
          direction: string
          guest_id: string
          id?: string
          meta?: Json
          occurred_at?: string
          subject?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          guest_id?: string
          id?: string
          meta?: Json
          occurred_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_communications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_communications_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_documents: {
        Row: {
          booking_id: string | null
          checkin_id: string | null
          created_at: string
          created_by: string | null
          document_expiry: string | null
          document_number: string | null
          file_name: string | null
          file_size: number | null
          guest_id: string | null
          id: string
          kind: string
          label: string | null
          meta: Json
          mime_type: string | null
          rejection_reason: string | null
          status: string
          storage_path: string | null
          updated_at: string
          uploaded_by_guest: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          booking_id?: string | null
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          document_expiry?: string | null
          document_number?: string | null
          file_name?: string | null
          file_size?: number | null
          guest_id?: string | null
          id?: string
          kind: string
          label?: string | null
          meta?: Json
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by_guest?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          booking_id?: string | null
          checkin_id?: string | null
          created_at?: string
          created_by?: string | null
          document_expiry?: string | null
          document_number?: string | null
          file_name?: string | null
          file_size?: number | null
          guest_id?: string | null
          id?: string
          kind?: string
          label?: string | null
          meta?: Json
          mime_type?: string | null
          rejection_reason?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by_guest?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "guest_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          guest_id: string
          history: Json
          id: string
          is_deleted: boolean
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          guest_id: string
          history?: Json
          id?: string
          is_deleted?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          guest_id?: string
          history?: Json
          id?: string
          is_deleted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_notes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_preferences: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          evidence: Json
          guest_id: string
          id: string
          key: string
          kind: string
          last_observed_at: string | null
          observed_count: number
          severity: string | null
          source: string
          state: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          category?: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          guest_id: string
          id?: string
          key: string
          kind?: string
          last_observed_at?: string | null
          observed_count?: number
          severity?: string | null
          source?: string
          state?: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          guest_id?: string
          id?: string
          key?: string
          kind?: string
          last_observed_at?: string | null
          observed_count?: number
          severity?: string | null
          source?: string
          state?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_preferences_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          guest_id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          guest_id: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          guest_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "guest_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      guest_threads: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          last_updated: string
          notes: string | null
          timeline: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          timeline?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          last_updated?: string
          notes?: string | null
          timeline?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guest_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          ai_summary: string | null
          ai_summary_updated_at: string | null
          anniversary: string | null
          avatar_url: string | null
          birthday: string | null
          communication_preference: Database["public"]["Enums"]["communication_preference"]
          country: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          internal_notes: string | null
          is_deleted: boolean
          marketing_consent: boolean
          merged_into: string | null
          nationality: string | null
          phone_e164: string | null
          preferred_language: string | null
          status: Database["public"]["Enums"]["guest_status"]
          status_override: boolean
          time_zone: string | null
          updated_at: string
          vip_since: string | null
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          country?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          marketing_consent?: boolean
          merged_into?: string | null
          nationality?: string | null
          phone_e164?: string | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          status_override?: boolean
          time_zone?: string | null
          updated_at?: string
          vip_since?: string | null
        }
        Update: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          anniversary?: string | null
          avatar_url?: string | null
          birthday?: string | null
          communication_preference?: Database["public"]["Enums"]["communication_preference"]
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          marketing_consent?: boolean
          merged_into?: string | null
          nationality?: string | null
          phone_e164?: string | null
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["guest_status"]
          status_override?: boolean
          time_zone?: string | null
          updated_at?: string
          vip_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "guests_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_actions: {
        Row: {
          action_type: string
          adapter: string | null
          approved_at: string | null
          approved_by: string | null
          automated: boolean
          capability: string | null
          completed_at: string | null
          context_snapshot: Json
          context_status: string
          created_at: string
          decision_id: string | null
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          executed_at: string | null
          execution_key: string | null
          execution_reference: string | null
          id: string
          max_retries: number
          module: Database["public"]["Enums"]["intel_module"]
          payload: Json
          plan_id: string | null
          plan_step_id: string | null
          recommendation_id: string | null
          requested_by: string | null
          requires_approval: boolean
          result: Json
          retry_count: number
          risk_level: Database["public"]["Enums"]["intel_severity"]
          started_at: string | null
          status: Database["public"]["Enums"]["intel_action_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          adapter?: string | null
          approved_at?: string | null
          approved_by?: string | null
          automated?: boolean
          capability?: string | null
          completed_at?: string | null
          context_snapshot?: Json
          context_status?: string
          created_at?: string
          decision_id?: string | null
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_key?: string | null
          execution_reference?: string | null
          id?: string
          max_retries?: number
          module: Database["public"]["Enums"]["intel_module"]
          payload?: Json
          plan_id?: string | null
          plan_step_id?: string | null
          recommendation_id?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          result?: Json
          retry_count?: number
          risk_level?: Database["public"]["Enums"]["intel_severity"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["intel_action_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          adapter?: string | null
          approved_at?: string | null
          approved_by?: string | null
          automated?: boolean
          capability?: string | null
          completed_at?: string | null
          context_snapshot?: Json
          context_status?: string
          created_at?: string
          decision_id?: string | null
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          executed_at?: string | null
          execution_key?: string | null
          execution_reference?: string | null
          id?: string
          max_retries?: number
          module?: Database["public"]["Enums"]["intel_module"]
          payload?: Json
          plan_id?: string | null
          plan_step_id?: string | null
          recommendation_id?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          result?: Json
          retry_count?: number
          risk_level?: Database["public"]["Enums"]["intel_severity"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["intel_action_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_actions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "intelligence_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_actions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_actions_plan_step_id_fkey"
            columns: ["plan_step_id"]
            isOneToOne: false
            referencedRelation: "intelligence_plan_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_actions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "intelligence_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_decisions: {
        Row: {
          action_id: string | null
          assumptions: string[]
          confidence: number
          constraints: Json
          context: Json
          created_at: string
          criteria_weights: Json
          decided_at: string | null
          decided_by: string | null
          decision_key: string
          decision_note: string | null
          domain: string
          evidence: Json
          expected_metrics: Json
          expected_outcomes: Json
          id: string
          insight_ids: string[]
          module: Database["public"]["Enums"]["intel_module"]
          options: Json
          outcome: Json | null
          prediction_ids: string[]
          reasoning: Json
          reasoning_sources: string[]
          recommendation_id: string | null
          recommended_option_key: string | null
          requires_approval: boolean
          risk_level: Database["public"]["Enums"]["intel_severity"]
          risks: string[]
          status: string
          title: string
          trigger: string
          uncertainties: string[]
          updated_at: string
        }
        Insert: {
          action_id?: string | null
          assumptions?: string[]
          confidence?: number
          constraints?: Json
          context?: Json
          created_at?: string
          criteria_weights?: Json
          decided_at?: string | null
          decided_by?: string | null
          decision_key: string
          decision_note?: string | null
          domain: string
          evidence?: Json
          expected_metrics?: Json
          expected_outcomes?: Json
          id?: string
          insight_ids?: string[]
          module: Database["public"]["Enums"]["intel_module"]
          options?: Json
          outcome?: Json | null
          prediction_ids?: string[]
          reasoning?: Json
          reasoning_sources?: string[]
          recommendation_id?: string | null
          recommended_option_key?: string | null
          requires_approval?: boolean
          risk_level?: Database["public"]["Enums"]["intel_severity"]
          risks?: string[]
          status?: string
          title: string
          trigger: string
          uncertainties?: string[]
          updated_at?: string
        }
        Update: {
          action_id?: string | null
          assumptions?: string[]
          confidence?: number
          constraints?: Json
          context?: Json
          created_at?: string
          criteria_weights?: Json
          decided_at?: string | null
          decided_by?: string | null
          decision_key?: string
          decision_note?: string | null
          domain?: string
          evidence?: Json
          expected_metrics?: Json
          expected_outcomes?: Json
          id?: string
          insight_ids?: string[]
          module?: Database["public"]["Enums"]["intel_module"]
          options?: Json
          outcome?: Json | null
          prediction_ids?: string[]
          reasoning?: Json
          reasoning_sources?: string[]
          recommendation_id?: string | null
          recommended_option_key?: string | null
          requires_approval?: boolean
          risk_level?: Database["public"]["Enums"]["intel_severity"]
          risks?: string[]
          status?: string
          title?: string
          trigger?: string
          uncertainties?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_decisions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "intelligence_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_decisions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "intelligence_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_events: {
        Row: {
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          module: Database["public"]["Enums"]["intel_module"]
          occurred_at: string
          payload: Json
          processed_at: string | null
          severity: Database["public"]["Enums"]["intel_severity"]
          source: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          module: Database["public"]["Enums"]["intel_module"]
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          severity?: Database["public"]["Enums"]["intel_severity"]
          source?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          module?: Database["public"]["Enums"]["intel_module"]
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          severity?: Database["public"]["Enums"]["intel_severity"]
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_executions: {
        Row: {
          action_id: string
          adapter: string
          attempt: number
          capability: string
          completed_at: string | null
          created_at: string
          error: string | null
          execution_key: string
          execution_reference: string | null
          id: string
          module: Database["public"]["Enums"]["intel_module"]
          request: Json
          requested_by: string | null
          response: Json
          started_at: string
          status: string
        }
        Insert: {
          action_id: string
          adapter: string
          attempt?: number
          capability: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          execution_key: string
          execution_reference?: string | null
          id?: string
          module: Database["public"]["Enums"]["intel_module"]
          request?: Json
          requested_by?: string | null
          response?: Json
          started_at?: string
          status?: string
        }
        Update: {
          action_id?: string
          adapter?: string
          attempt?: number
          capability?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          execution_key?: string
          execution_reference?: string | null
          id?: string
          module?: Database["public"]["Enums"]["intel_module"]
          request?: Json
          requested_by?: string | null
          response?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_executions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "intelligence_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_feedback: {
        Row: {
          comment: string | null
          correction: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          module: Database["public"]["Enums"]["intel_module"] | null
          rating: number | null
          stage: Database["public"]["Enums"]["intel_stage"] | null
          subject_id: string
          subject_type: string
          updated_at: string
          useful: boolean | null
        }
        Insert: {
          comment?: string | null
          correction?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          module?: Database["public"]["Enums"]["intel_module"] | null
          rating?: number | null
          stage?: Database["public"]["Enums"]["intel_stage"] | null
          subject_id: string
          subject_type: string
          updated_at?: string
          useful?: boolean | null
        }
        Update: {
          comment?: string | null
          correction?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          module?: Database["public"]["Enums"]["intel_module"] | null
          rating?: number | null
          stage?: Database["public"]["Enums"]["intel_stage"] | null
          subject_id?: string
          subject_type?: string
          updated_at?: string
          useful?: boolean | null
        }
        Relationships: []
      }
      intelligence_insights: {
        Row: {
          confidence: number
          context: Json
          created_at: string
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          evidence: Json
          expires_at: string | null
          generated_by: string
          id: string
          importance: number
          insight_key: string | null
          model: string | null
          module: Database["public"]["Enums"]["intel_module"]
          reasoning_sources: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["intel_severity"]
          signal_ids: string[]
          status: Database["public"]["Enums"]["intel_status"]
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          context?: Json
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          expires_at?: string | null
          generated_by?: string
          id?: string
          importance?: number
          insight_key?: string | null
          model?: string | null
          module: Database["public"]["Enums"]["intel_module"]
          reasoning_sources?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["intel_severity"]
          signal_ids?: string[]
          status?: Database["public"]["Enums"]["intel_status"]
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          context?: Json
          created_at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          expires_at?: string | null
          generated_by?: string
          id?: string
          importance?: number
          insight_key?: string | null
          model?: string | null
          module?: Database["public"]["Enums"]["intel_module"]
          reasoning_sources?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["intel_severity"]
          signal_ids?: string[]
          status?: Database["public"]["Enums"]["intel_status"]
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_memory: {
        Row: {
          confidence: number
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          memory_key: string
          memory_tier: string
          memory_type: string
          memory_value: string
          metadata: Json
          module: Database["public"]["Enums"]["intel_module"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope: Database["public"]["Enums"]["intel_memory_scope"]
          scope_id: string | null
          source: string
          source_event_id: string | null
          status: Database["public"]["Enums"]["intel_status"]
          updated_at: string
          use_count: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          memory_key: string
          memory_tier?: string
          memory_type?: string
          memory_value: string
          metadata?: Json
          module?: Database["public"]["Enums"]["intel_module"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: Database["public"]["Enums"]["intel_memory_scope"]
          scope_id?: string | null
          source?: string
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["intel_status"]
          updated_at?: string
          use_count?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          memory_key?: string
          memory_tier?: string
          memory_type?: string
          memory_value?: string
          metadata?: Json
          module?: Database["public"]["Enums"]["intel_module"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: Database["public"]["Enums"]["intel_memory_scope"]
          scope_id?: string | null
          source?: string
          source_event_id?: string | null
          status?: Database["public"]["Enums"]["intel_status"]
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_memory_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_outcomes: {
        Row: {
          achievement: number | null
          action_id: string | null
          actual_value: number | null
          baseline_value: number | null
          comparator: string
          created_at: string
          decision_id: string
          evidence: Json
          id: string
          label: string
          measure_after: string | null
          measured_at: string | null
          metric_key: string
          module: Database["public"]["Enums"]["intel_module"]
          note: string | null
          plan_id: string | null
          result: string
          target_value: number | null
          unit: string | null
          updated_at: string
          variance: number | null
          verification_status: string
        }
        Insert: {
          achievement?: number | null
          action_id?: string | null
          actual_value?: number | null
          baseline_value?: number | null
          comparator?: string
          created_at?: string
          decision_id: string
          evidence?: Json
          id?: string
          label: string
          measure_after?: string | null
          measured_at?: string | null
          metric_key: string
          module: Database["public"]["Enums"]["intel_module"]
          note?: string | null
          plan_id?: string | null
          result?: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          variance?: number | null
          verification_status?: string
        }
        Update: {
          achievement?: number | null
          action_id?: string | null
          actual_value?: number | null
          baseline_value?: number | null
          comparator?: string
          created_at?: string
          decision_id?: string
          evidence?: Json
          id?: string
          label?: string
          measure_after?: string | null
          measured_at?: string | null
          metric_key?: string
          module?: Database["public"]["Enums"]["intel_module"]
          note?: string | null
          plan_id?: string | null
          result?: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          variance?: number | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_outcomes_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "intelligence_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_outcomes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "intelligence_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_outcomes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_plan_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          depends_on: number | null
          expected_outcome: string | null
          id: string
          module: Database["public"]["Enums"]["intel_module"]
          note: string | null
          objective: string
          plan_id: string
          requires_approval: boolean
          responsible_role: string | null
          sequence: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          depends_on?: number | null
          expected_outcome?: string | null
          id?: string
          module: Database["public"]["Enums"]["intel_module"]
          note?: string | null
          objective: string
          plan_id: string
          requires_approval?: boolean
          responsible_role?: string | null
          sequence: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          depends_on?: number | null
          expected_outcome?: string | null
          id?: string
          module?: Database["public"]["Enums"]["intel_module"]
          note?: string | null
          objective?: string
          plan_id?: string
          requires_approval?: boolean
          responsible_role?: string | null
          sequence?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_plan_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_plans: {
        Row: {
          created_at: string
          decision_id: string
          id: string
          objective: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_id: string
          id?: string
          objective: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_id?: string
          id?: string
          objective?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_plans_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "intelligence_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_predictions: {
        Row: {
          accuracy: number | null
          actual_recorded_at: string | null
          actual_value: number | null
          confidence: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          horizon_days: number | null
          id: string
          inputs: Json
          label: string | null
          lower_bound: number | null
          model: string | null
          module: Database["public"]["Enums"]["intel_module"]
          predicted_text: string | null
          predicted_value: number | null
          prediction_key: string
          target_date: string | null
          unit: string | null
          updated_at: string
          upper_bound: number | null
        }
        Insert: {
          accuracy?: number | null
          actual_recorded_at?: string | null
          actual_value?: number | null
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          horizon_days?: number | null
          id?: string
          inputs?: Json
          label?: string | null
          lower_bound?: number | null
          model?: string | null
          module: Database["public"]["Enums"]["intel_module"]
          predicted_text?: string | null
          predicted_value?: number | null
          prediction_key: string
          target_date?: string | null
          unit?: string | null
          updated_at?: string
          upper_bound?: number | null
        }
        Update: {
          accuracy?: number | null
          actual_recorded_at?: string | null
          actual_value?: number | null
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          horizon_days?: number | null
          id?: string
          inputs?: Json
          label?: string | null
          lower_bound?: number | null
          model?: string | null
          module?: Database["public"]["Enums"]["intel_module"]
          predicted_text?: string | null
          predicted_value?: number | null
          prediction_key?: string
          target_date?: string | null
          unit?: string | null
          updated_at?: string
          upper_bound?: number | null
        }
        Relationships: []
      }
      intelligence_recommendations: {
        Row: {
          action_payload: Json
          action_type: string | null
          confidence: number
          context: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entity_id: string | null
          entity_type: string | null
          expected_impact: string | null
          expires_at: string | null
          id: string
          impact_unit: string | null
          impact_value: number | null
          insight_id: string | null
          module: Database["public"]["Enums"]["intel_module"]
          priority: number
          rationale: string
          reasoning_sources: string[]
          recommendation_key: string | null
          status: Database["public"]["Enums"]["intel_status"]
          suggested_action: string | null
          title: string
          updated_at: string
        }
        Insert: {
          action_payload?: Json
          action_type?: string | null
          confidence?: number
          context?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          impact_unit?: string | null
          impact_value?: number | null
          insight_id?: string | null
          module: Database["public"]["Enums"]["intel_module"]
          priority?: number
          rationale: string
          reasoning_sources?: string[]
          recommendation_key?: string | null
          status?: Database["public"]["Enums"]["intel_status"]
          suggested_action?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          action_payload?: Json
          action_type?: string | null
          confidence?: number
          context?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string | null
          entity_type?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          impact_unit?: string | null
          impact_value?: number | null
          insight_id?: string | null
          module?: Database["public"]["Enums"]["intel_module"]
          priority?: number
          rationale?: string
          reasoning_sources?: string[]
          recommendation_key?: string | null
          status?: Database["public"]["Enums"]["intel_status"]
          suggested_action?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_recommendations_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "intelligence_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_signals: {
        Row: {
          confidence: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          label: string | null
          metadata: Json
          module: Database["public"]["Enums"]["intel_module"]
          signal_key: string
          source_event_ids: string[]
          unit: string | null
          updated_at: string
          value: number | null
          value_text: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          module: Database["public"]["Enums"]["intel_module"]
          signal_key: string
          source_event_ids?: string[]
          unit?: string | null
          updated_at?: string
          value?: number | null
          value_text?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          module?: Database["public"]["Enums"]["intel_module"]
          signal_key?: string
          source_event_ids?: string[]
          unit?: string | null
          updated_at?: string
          value?: number | null
          value_text?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      journal_article_tags: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "journal_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "journal_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_article_versions: {
        Row: {
          article_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          article_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot?: Json
          version: number
        }
        Update: {
          article_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "journal_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_articles: {
        Row: {
          author_id: string | null
          category_id: string | null
          content_html: string | null
          content_json: Json | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          featured: boolean
          id: string
          published_at: string | null
          read_minutes: number | null
          scheduled_at: string | null
          seo_description: string | null
          seo_og_image: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          read_minutes?: number | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string | null
          content_json?: Json | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          read_minutes?: number | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_og_image?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "journal_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "journal_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      knowledge_categories: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          id: string
          tsv: unknown
          version: number
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          tsv?: unknown
          version: number
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          tsv?: unknown
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_document_versions: {
        Row: {
          byte_size: number | null
          change_note: string | null
          checksum: string | null
          content_text: string
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          version: number
        }
        Insert: {
          byte_size?: number | null
          change_note?: string | null
          checksum?: string | null
          content_text: string
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          version: number
        }
        Update: {
          byte_size?: number | null
          change_note?: string | null
          checksum?: string | null
          content_text?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][] | null
          byte_size: number | null
          category_id: string | null
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          is_guest_visible: boolean
          slug: string
          source_type: string
          source_url: string | null
          status: string
          storage_path: string | null
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          byte_size?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          is_guest_visible?: boolean
          slug: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][] | null
          byte_size?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          is_guest_visible?: boolean
          slug?: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          caption: string | null
          content_hash: string | null
          created_at: string
          filename: string
          folder_id: string | null
          height: number | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          tags: string[] | null
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          filename: string
          folder_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          content_hash?: string | null
          created_at?: string
          filename?: string
          folder_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_usage: {
        Row: {
          asset_id: string
          created_at: string
          field: string | null
          id: string
          used_in_id: string
          used_in_type: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          field?: string | null
          id?: string
          used_in_id: string
          used_in_type: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          field?: string | null
          id?: string
          used_in_id?: string
          used_in_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_usage_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          delivered_at: string | null
          href: string | null
          id: string
          kind: string | null
          meta: Json
          read_at: string | null
          role: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          href?: string | null
          id?: string
          kind?: string | null
          meta?: Json
          read_at?: string | null
          role?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          delivered_at?: string | null
          href?: string | null
          id?: string
          kind?: string | null
          meta?: Json
          read_at?: string | null
          role?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ops_alert_kind"]
          message: string
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ops_alert_kind"]
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ops_alert_kind"]
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          assignee_id: string | null
          booking_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          priority: number
          status: Database["public"]["Enums"]["ops_task_status"]
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["ops_task_status"]
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["ops_task_status"]
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          booking_id: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          merchant_reference: string | null
          order_tracking_id: string | null
          payment_method: string | null
          provider: string
          raw: Json | null
          status_code: number | null
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          merchant_reference?: string | null
          order_tracking_id?: string | null
          payment_method?: string | null
          provider?: string
          raw?: Json | null
          status_code?: number | null
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          merchant_reference?: string | null
          order_tracking_id?: string | null
          payment_method?: string | null
          provider?: string
          raw?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_notifications: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      pesapal_settings: {
        Row: {
          created_at: string
          env: string
          ipn_id: string
          ipn_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          env: string
          ipn_id: string
          ipn_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          env?: string
          ipn_id?: string
          ipn_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          active: boolean
          adjust_kind: string | null
          adjust_value: number | null
          code: string | null
          created_at: string
          ends_on: string | null
          id: string
          min_stay_nights: number | null
          name: string
          notes: string | null
          priority: number
          room_id: string | null
          rule_type: string
          scope: string
          starts_on: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean
          adjust_kind?: string | null
          adjust_value?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          min_stay_nights?: number | null
          name: string
          notes?: string | null
          priority?: number
          room_id?: string | null
          rule_type: string
          scope?: string
          starts_on?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean
          adjust_kind?: string | null
          adjust_value?: number | null
          code?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          min_stay_nights?: number | null
          name?: string
          notes?: string | null
          priority?: number
          room_id?: string | null
          rule_type?: string
          scope?: string
          starts_on?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_approval_rules: {
        Row: {
          active: boolean
          approver_roles: Database["public"]["Enums"]["restaurant_role"][]
          category: string | null
          created_at: string
          currency: string
          document_type: string
          id: string
          location_id: string | null
          max_amount: number | null
          min_amount: number
          notes: string | null
          priority: number
          property_id: string | null
          require_separation_of_duties: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          approver_roles?: Database["public"]["Enums"]["restaurant_role"][]
          category?: string | null
          created_at?: string
          currency?: string
          document_type?: string
          id?: string
          location_id?: string | null
          max_amount?: number | null
          min_amount?: number
          notes?: string | null
          priority?: number
          property_id?: string | null
          require_separation_of_duties?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          approver_roles?: Database["public"]["Enums"]["restaurant_role"][]
          category?: string | null
          created_at?: string
          currency?: string
          document_type?: string
          id?: string
          location_id?: string | null
          max_amount?: number | null
          min_amount?: number
          notes?: string | null
          priority?: number
          property_id?: string | null
          require_separation_of_duties?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_approval_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_approval_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_approval_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_bundle_components: {
        Row: {
          bundle_product_id: string
          component_product_id: string
          created_at: string
          id: string
          price_allocation: number
          quantity: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          bundle_product_id: string
          component_product_id: string
          created_at?: string
          id?: string
          price_allocation?: number
          quantity?: number
          sort_order?: number
          tenant_id: string
        }
        Update: {
          bundle_product_id?: string
          component_product_id?: string
          created_at?: string
          id?: string
          price_allocation?: number
          quantity?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_bundle_components_bundle_product_id_fkey"
            columns: ["bundle_product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_bundle_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_bundle_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          kind: string
          metadata: Json
          name: string
          parent_id: string | null
          property_id: string | null
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name: string
          parent_id?: string | null
          property_id?: string | null
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string
          parent_id?: string | null
          property_id?: string | null
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "restaurant_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_categories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_currencies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          decimals: number
          id: string
          is_base: boolean
          name: string
          rounding: number
          symbol: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_base?: boolean
          name?: string
          rounding?: number
          symbol?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_base?: boolean
          name?: string
          rounding?: number
          symbol?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_daily_closes: {
        Row: {
          business_date: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          declared_at: string | null
          declared_by: string | null
          declared_totals: Json
          declared_variance: number
          exceptions_open: number
          id: string
          location_id: string | null
          notes: string | null
          opening_float: number
          property_id: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          service_periods: Json
          status: string
          system_totals: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          declared_at?: string | null
          declared_by?: string | null
          declared_totals?: Json
          declared_variance?: number
          exceptions_open?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          opening_float?: number
          property_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          service_periods?: Json
          status?: string
          system_totals?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          declared_at?: string | null
          declared_by?: string | null
          declared_totals?: Json
          declared_variance?: number
          exceptions_open?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          opening_float?: number
          property_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          service_periods?: Json
          status?: string
          system_totals?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_daily_closes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_daily_closes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_daily_closes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_discount_applications: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          basis: Database["public"]["Enums"]["restaurant_charge_basis"]
          created_at: string
          currency: string
          discount_rule_id: string | null
          id: string
          order_id: string | null
          order_item_id: string | null
          reason: string | null
          scope: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id: string
          value: number
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          created_at?: string
          currency?: string
          discount_rule_id?: string | null
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          reason?: string | null
          scope?: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id: string
          value?: number
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          created_at?: string
          currency?: string
          discount_rule_id?: string | null
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          reason?: string | null
          scope?: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_discount_applications_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "restaurant_discount_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_discount_applications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_discount_applications_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_discount_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_discount_rules: {
        Row: {
          active: boolean
          applies_to_categories: string[]
          applies_to_products: string[]
          approval_threshold_percent: number | null
          basis: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string | null
          max_percent: number
          name: string
          property_id: string | null
          requires_reason: boolean
          role_limits: Json
          scope: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_products?: string[]
          approval_threshold_percent?: number | null
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          max_percent?: number
          name: string
          property_id?: string | null
          requires_reason?: boolean
          role_limits?: Json
          scope?: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_products?: string[]
          approval_threshold_percent?: number | null
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          max_percent?: number
          name?: string
          property_id?: string | null
          requires_reason?: boolean
          role_limits?: Json
          scope?: Database["public"]["Enums"]["restaurant_discount_scope"]
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_discount_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_discount_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_discount_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_document_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          document_id: string | null
          document_number: string | null
          document_type: string
          format: string | null
          id: string
          location_id: string | null
          metadata: Json
          property_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          document_number?: string | null
          document_type: string
          format?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          property_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          document_number?: string | null
          document_type?: string
          format?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          property_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_document_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_document_sequences: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          next_number: number
          prefix: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          next_number?: number
          prefix: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          next_number?: number
          prefix?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_document_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_exchange_rates: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          manual_override: boolean
          note: string | null
          rate: number
          source: string
          target_currency: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          manual_override?: boolean
          note?: string | null
          rate: number
          source?: string
          target_currency: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          manual_override?: boolean
          note?: string | null
          rate?: number
          source?: string
          target_currency?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_goods_receipt_items: {
        Row: {
          accepted_quantity: number
          batch_code: string | null
          created_at: string
          currency: string
          damaged_quantity: number
          description: string
          expiry_date: string | null
          id: string
          inventory_item_id: string | null
          notes: string | null
          ordered_quantity: number
          ordered_unit_cost: number
          purchase_order_item_id: string | null
          receipt_id: string
          received_quantity: number
          rejected_quantity: number
          rejection_reason: string | null
          stock_movement_id: string | null
          storage_location_id: string | null
          tenant_id: string
          unit_cost: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_quantity?: number
          batch_code?: string | null
          created_at?: string
          currency?: string
          damaged_quantity?: number
          description: string
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          ordered_quantity?: number
          ordered_unit_cost?: number
          purchase_order_item_id?: string | null
          receipt_id: string
          received_quantity?: number
          rejected_quantity?: number
          rejection_reason?: string | null
          stock_movement_id?: string | null
          storage_location_id?: string | null
          tenant_id: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_quantity?: number
          batch_code?: string | null
          created_at?: string
          currency?: string
          damaged_quantity?: number
          description?: string
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string | null
          notes?: string | null
          ordered_quantity?: number
          ordered_unit_cost?: number
          purchase_order_item_id?: string | null
          receipt_id?: string
          received_quantity?: number
          rejected_quantity?: number
          rejection_reason?: string | null
          stock_movement_id?: string | null
          storage_location_id?: string | null
          tenant_id?: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_goods_receipt_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "restaurant_goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipt_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_goods_receipts: {
        Row: {
          accepted_value: number
          correlation_id: string | null
          created_at: string
          currency: string
          delivery_note_ref: string | null
          document_number: string
          expected_at: string | null
          id: string
          location_id: string | null
          metadata: Json
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          property_id: string | null
          purchase_order_id: string | null
          received_at: string
          received_by: string
          status: Database["public"]["Enums"]["restaurant_receipt_status"]
          subtotal: number
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_value?: number
          correlation_id?: string | null
          created_at?: string
          currency?: string
          delivery_note_ref?: string | null
          document_number: string
          expected_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          property_id?: string | null
          purchase_order_id?: string | null
          received_at?: string
          received_by: string
          status?: Database["public"]["Enums"]["restaurant_receipt_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_value?: number
          correlation_id?: string | null
          created_at?: string
          currency?: string
          delivery_note_ref?: string | null
          document_number?: string
          expected_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          property_id?: string | null
          purchase_order_id?: string | null
          received_at?: string
          received_by?: string
          status?: Database["public"]["Enums"]["restaurant_receipt_status"]
          subtotal?: number
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_goods_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory_batches: {
        Row: {
          batch_number: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          inventory_item_id: string
          location_id: string | null
          notes: string | null
          property_id: string | null
          quantity: number
          received_date: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          unit_cost: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inventory_item_id: string
          location_id?: string | null
          notes?: string | null
          property_id?: string | null
          quantity?: number
          received_date?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string
          location_id?: string | null
          notes?: string | null
          property_id?: string | null
          quantity?: number
          received_date?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_batches_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_batches_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory_items: {
        Row: {
          allergen_reviewed_at: string | null
          allergen_reviewed_by: string | null
          allergen_status: string
          allergens: string[]
          allow_negative: boolean
          average_cost: number
          category_id: string | null
          consumption_unit_id: string | null
          created_at: string
          currency: string
          current_quantity: number
          id: string
          is_beverage: boolean
          item_type: string
          location_id: string | null
          metadata: Json
          name: string
          pack_size: number
          par_level: number | null
          property_id: string | null
          purchase_unit_id: string | null
          reorder_point: number | null
          serving_size: number | null
          serving_unit_id: string | null
          shelf_life_days: number | null
          sku: string | null
          status: string
          tenant_id: string
          track_batches: boolean
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          allergen_reviewed_at?: string | null
          allergen_reviewed_by?: string | null
          allergen_status?: string
          allergens?: string[]
          allow_negative?: boolean
          average_cost?: number
          category_id?: string | null
          consumption_unit_id?: string | null
          created_at?: string
          currency?: string
          current_quantity?: number
          id?: string
          is_beverage?: boolean
          item_type?: string
          location_id?: string | null
          metadata?: Json
          name: string
          pack_size?: number
          par_level?: number | null
          property_id?: string | null
          purchase_unit_id?: string | null
          reorder_point?: number | null
          serving_size?: number | null
          serving_unit_id?: string | null
          shelf_life_days?: number | null
          sku?: string | null
          status?: string
          tenant_id: string
          track_batches?: boolean
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          allergen_reviewed_at?: string | null
          allergen_reviewed_by?: string | null
          allergen_status?: string
          allergens?: string[]
          allow_negative?: boolean
          average_cost?: number
          category_id?: string | null
          consumption_unit_id?: string | null
          created_at?: string
          currency?: string
          current_quantity?: number
          id?: string
          is_beverage?: boolean
          item_type?: string
          location_id?: string | null
          metadata?: Json
          name?: string
          pack_size?: number
          par_level?: number | null
          property_id?: string | null
          purchase_unit_id?: string | null
          reorder_point?: number | null
          serving_size?: number | null
          serving_unit_id?: string | null
          shelf_life_days?: number | null
          sku?: string | null
          status?: string
          tenant_id?: string
          track_batches?: boolean
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_consumption_unit_id_fkey"
            columns: ["consumption_unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_serving_unit_id_fkey"
            columns: ["serving_unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory_reasons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: string
          label: string
          requires_approval: boolean
          requires_note: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind: string
          label: string
          requires_approval?: boolean
          requires_note?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string
          requires_approval?: boolean
          requires_note?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_reasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory_units: {
        Row: {
          base_unit_id: string | null
          code: string
          created_at: string
          dimension: string
          factor: number
          id: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          base_unit_id?: string | null
          code: string
          created_at?: string
          dimension?: string
          factor?: number
          id?: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          base_unit_id?: string | null
          code?: string
          created_at?: string
          dimension?: string
          factor?: number
          id?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_units_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_inventory_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_kitchen_ticket_items: {
        Row: {
          created_at: string
          description: string
          id: string
          menu_item_id: string | null
          notes: string | null
          order_item_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["restaurant_ticket_status"]
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          menu_item_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["restaurant_ticket_status"]
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          menu_item_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["restaurant_ticket_status"]
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_kitchen_ticket_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_ticket_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_ticket_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "restaurant_kitchen_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_kitchen_tickets: {
        Row: {
          course: string | null
          created_at: string
          created_by: string | null
          delay_seconds: number
          id: string
          is_delayed: boolean
          location_id: string | null
          notes: string | null
          order_id: string
          prep_seconds: number | null
          priority: number
          queued_at: string
          ready_at: string | null
          served_at: string | null
          started_at: string | null
          station_id: string | null
          status: Database["public"]["Enums"]["restaurant_ticket_status"]
          target_minutes: number
          tenant_id: string
          ticket_number: string
          updated_at: string
        }
        Insert: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          is_delayed?: boolean
          location_id?: string | null
          notes?: string | null
          order_id: string
          prep_seconds?: number | null
          priority?: number
          queued_at?: string
          ready_at?: string | null
          served_at?: string | null
          started_at?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_ticket_status"]
          target_minutes?: number
          tenant_id: string
          ticket_number: string
          updated_at?: string
        }
        Update: {
          course?: string | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          id?: string
          is_delayed?: boolean
          location_id?: string | null
          notes?: string | null
          order_id?: string
          prep_seconds?: number | null
          priority?: number
          queued_at?: string
          ready_at?: string | null
          served_at?: string | null
          started_at?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_ticket_status"]
          target_minutes?: number
          tenant_id?: string
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_kitchen_tickets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_kitchen_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_locations: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_storage: boolean
          location_type: string
          name: string
          notes: string | null
          parent_id: string | null
          property_id: string
          service_hours: Json
          settings: Json
          slug: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_storage?: boolean
          location_type?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          property_id: string
          service_hours?: Json
          settings?: Json
          slug: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_storage?: boolean
          location_type?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          property_id?: string
          service_hours?: Json
          settings?: Json
          slug?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_locations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          property_id: string | null
          role: Database["public"]["Enums"]["restaurant_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id?: string | null
          role?: Database["public"]["Enums"]["restaurant_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string | null
          role?: Database["public"]["Enums"]["restaurant_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menu_items: {
        Row: {
          allergen_reviewed_at: string | null
          allergen_reviewed_by: string | null
          allergen_status: string
          allergens: string[]
          archived_at: string | null
          availability: Json
          available: boolean
          category_id: string | null
          cost_price: number | null
          created_at: string
          currency: string
          description: string | null
          discontinued_at: string | null
          id: string
          image_url: string | null
          lifecycle_changed_at: string
          lifecycle_changed_by: string | null
          lifecycle_status: string
          menu_id: string
          metadata: Json
          name: string
          price: number
          slug: string
          sort_order: number
          tags: string[]
          tenant_id: string
          unavailable_reason: string | null
          updated_at: string
        }
        Insert: {
          allergen_reviewed_at?: string | null
          allergen_reviewed_by?: string | null
          allergen_status?: string
          allergens?: string[]
          archived_at?: string | null
          availability?: Json
          available?: boolean
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          discontinued_at?: string | null
          id?: string
          image_url?: string | null
          lifecycle_changed_at?: string
          lifecycle_changed_by?: string | null
          lifecycle_status?: string
          menu_id: string
          metadata?: Json
          name: string
          price?: number
          slug: string
          sort_order?: number
          tags?: string[]
          tenant_id: string
          unavailable_reason?: string | null
          updated_at?: string
        }
        Update: {
          allergen_reviewed_at?: string | null
          allergen_reviewed_by?: string | null
          allergen_status?: string
          allergens?: string[]
          archived_at?: string | null
          availability?: Json
          available?: boolean
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          discontinued_at?: string | null
          id?: string
          image_url?: string | null
          lifecycle_changed_at?: string
          lifecycle_changed_by?: string | null
          lifecycle_status?: string
          menu_id?: string
          metadata?: Json
          name?: string
          price?: number
          slug?: string
          sort_order?: number
          tags?: string[]
          tenant_id?: string
          unavailable_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menus: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          location_id: string | null
          name: string
          property_id: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["restaurant_menu_status"]
          tenant_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          location_id?: string | null
          name: string
          property_id?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["restaurant_menu_status"]
          tenant_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          location_id?: string | null
          name?: string
          property_id?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["restaurant_menu_status"]
          tenant_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menus_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_menus_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_modifier_groups: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          max_select: number
          min_select: number
          name: string
          required: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name: string
          required?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          required?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_modifiers: {
        Row: {
          active: boolean
          created_at: string
          effect: Database["public"]["Enums"]["restaurant_modifier_effect"]
          group_id: string
          id: string
          inventory_item_id: string | null
          name: string
          price_delta: number
          quantity: number
          recipe_id: string | null
          sort_order: number
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          effect?: Database["public"]["Enums"]["restaurant_modifier_effect"]
          group_id: string
          id?: string
          inventory_item_id?: string | null
          name: string
          price_delta?: number
          quantity?: number
          recipe_id?: string | null
          sort_order?: number
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          effect?: Database["public"]["Enums"]["restaurant_modifier_effect"]
          group_id?: string
          id?: string
          inventory_item_id?: string | null
          name?: string
          price_delta?: number
          quantity?: number
          recipe_id?: string | null
          sort_order?: number
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "restaurant_modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_modifiers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_modifiers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_modifiers_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_modifiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_modifiers_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_order_items: {
        Row: {
          base_unit_price: number | null
          channel: string | null
          comp_at: string | null
          comp_by: string | null
          comp_reason: string | null
          course: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string
          discount: number
          discount_reason: string | null
          discount_rule_id: string | null
          exchange_rate: number
          guest_notes: string | null
          id: string
          is_comp: boolean
          line_cost: number
          line_total: number
          menu_item_id: string | null
          modifier_total: number
          modifiers: Json
          notes: string | null
          order_id: string
          price_id: string | null
          price_list_id: string | null
          price_source: string | null
          pricing_trace: Json
          product_id: string | null
          promotion_id: string | null
          quantity: number
          recipe_id: string | null
          recipe_version: number | null
          seat_number: number | null
          service_charge_amount: number
          service_charge_id: string | null
          station_id: string | null
          status: string
          tax_amount: number
          tax_inclusive: boolean
          tax_rate: number
          tax_rule_id: string | null
          tenant_id: string
          theoretical_cost: number
          unit_cost: number
          unit_price: number
          updated_at: string
          variant_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          base_unit_price?: number | null
          channel?: string | null
          comp_at?: string | null
          comp_by?: string | null
          comp_reason?: string | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description: string
          discount?: number
          discount_reason?: string | null
          discount_rule_id?: string | null
          exchange_rate?: number
          guest_notes?: string | null
          id?: string
          is_comp?: boolean
          line_cost?: number
          line_total?: number
          menu_item_id?: string | null
          modifier_total?: number
          modifiers?: Json
          notes?: string | null
          order_id: string
          price_id?: string | null
          price_list_id?: string | null
          price_source?: string | null
          pricing_trace?: Json
          product_id?: string | null
          promotion_id?: string | null
          quantity?: number
          recipe_id?: string | null
          recipe_version?: number | null
          seat_number?: number | null
          service_charge_amount?: number
          service_charge_id?: string | null
          station_id?: string | null
          status?: string
          tax_amount?: number
          tax_inclusive?: boolean
          tax_rate?: number
          tax_rule_id?: string | null
          tenant_id: string
          theoretical_cost?: number
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          base_unit_price?: number | null
          channel?: string | null
          comp_at?: string | null
          comp_by?: string | null
          comp_reason?: string | null
          course?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string
          discount?: number
          discount_reason?: string | null
          discount_rule_id?: string | null
          exchange_rate?: number
          guest_notes?: string | null
          id?: string
          is_comp?: boolean
          line_cost?: number
          line_total?: number
          menu_item_id?: string | null
          modifier_total?: number
          modifiers?: Json
          notes?: string | null
          order_id?: string
          price_id?: string | null
          price_list_id?: string | null
          price_source?: string | null
          pricing_trace?: Json
          product_id?: string | null
          promotion_id?: string | null
          quantity?: number
          recipe_id?: string | null
          recipe_version?: number | null
          seat_number?: number | null
          service_charge_amount?: number
          service_charge_id?: string | null
          station_id?: string | null
          status?: string
          tax_amount?: number
          tax_inclusive?: boolean
          tax_rate?: number
          tax_rule_id?: string | null
          tenant_id?: string
          theoretical_cost?: number
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_order_items_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "restaurant_discount_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "restaurant_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "restaurant_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "restaurant_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_service_charge_id_fkey"
            columns: ["service_charge_id"]
            isOneToOne: false
            referencedRelation: "restaurant_service_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_station_fk"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_tax_rule_id_fkey"
            columns: ["tax_rule_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tax_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_orders: {
        Row: {
          base_currency: string | null
          bill_presented_at: string | null
          bill_requested_at: string | null
          bill_requested_by: string | null
          booking_id: string | null
          client_request_id: string | null
          closed_at: string | null
          cost_total: number
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          exchange_rate: number
          external_ref: string | null
          guest_count: number
          guest_name: string | null
          id: string
          location_id: string | null
          notes: string | null
          opened_at: string
          order_number: string
          order_type: Database["public"]["Enums"]["restaurant_order_type"]
          paid_total: number
          payment_state: Database["public"]["Enums"]["restaurant_payment_state"]
          property_id: string | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          server_user_id: string | null
          service_charge: number
          service_period_id: string | null
          source: string
          status: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal: number
          table_id: string | null
          tax_total: number
          tenant_id: string
          terminal_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          base_currency?: string | null
          bill_presented_at?: string | null
          bill_requested_at?: string | null
          bill_requested_by?: string | null
          booking_id?: string | null
          client_request_id?: string | null
          closed_at?: string | null
          cost_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          exchange_rate?: number
          external_ref?: string | null
          guest_count?: number
          guest_name?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          order_number: string
          order_type?: Database["public"]["Enums"]["restaurant_order_type"]
          paid_total?: number
          payment_state?: Database["public"]["Enums"]["restaurant_payment_state"]
          property_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          server_user_id?: string | null
          service_charge?: number
          service_period_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal?: number
          table_id?: string | null
          tax_total?: number
          tenant_id: string
          terminal_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          base_currency?: string | null
          bill_presented_at?: string | null
          bill_requested_at?: string | null
          bill_requested_by?: string | null
          booking_id?: string | null
          client_request_id?: string | null
          closed_at?: string | null
          cost_total?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          exchange_rate?: number
          external_ref?: string | null
          guest_count?: number
          guest_name?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          order_number?: string
          order_type?: Database["public"]["Enums"]["restaurant_order_type"]
          paid_total?: number
          payment_state?: Database["public"]["Enums"]["restaurant_payment_state"]
          property_id?: string | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          server_user_id?: string | null
          service_charge?: number
          service_period_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["restaurant_order_status"]
          subtotal?: number
          table_id?: string | null
          tax_total?: number
          tenant_id?: string
          terminal_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_service_period_id_fkey"
            columns: ["service_period_id"]
            isOneToOne: false
            referencedRelation: "restaurant_service_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payments: {
        Row: {
          amount: number
          booking_id: string | null
          captured_at: string
          change_due: number
          client_request_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          method: string
          order_id: string
          reference: string | null
          refund_of: string | null
          refund_reason: string | null
          state: Database["public"]["Enums"]["restaurant_payment_state"]
          tenant_id: string
          tendered: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          captured_at?: string
          change_due?: number
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string
          order_id: string
          reference?: string | null
          refund_of?: string | null
          refund_reason?: string | null
          state?: Database["public"]["Enums"]["restaurant_payment_state"]
          tenant_id: string
          tendered?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          captured_at?: string
          change_due?: number
          client_request_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string
          order_id?: string
          reference?: string | null
          refund_of?: string | null
          refund_reason?: string | null
          state?: Database["public"]["Enums"]["restaurant_payment_state"]
          tenant_id?: string
          tendered?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_refund_of_fkey"
            columns: ["refund_of"]
            isOneToOne: false
            referencedRelation: "restaurant_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_price_lists: {
        Row: {
          channel: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_default: boolean
          location_id: string | null
          metadata: Json
          name: string
          priority: number
          property_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          location_id?: string | null
          metadata?: Json
          name: string
          priority?: number
          property_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_default?: boolean
          location_id?: string | null
          metadata?: Json
          name?: string
          priority?: number
          property_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_price_lists_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_price_lists_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_price_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_prices: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string | null
          menu_item_id: string | null
          price_list_id: string | null
          product_id: string | null
          property_id: string | null
          reason: string | null
          rejected_reason: string | null
          requires_approval: boolean
          scope: Database["public"]["Enums"]["restaurant_price_scope"]
          status: Database["public"]["Enums"]["restaurant_price_status"]
          supersedes_id: string | null
          tax_inclusive: boolean
          tenant_id: string
          updated_at: string
          variant_id: string | null
          version: number
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          menu_item_id?: string | null
          price_list_id?: string | null
          product_id?: string | null
          property_id?: string | null
          reason?: string | null
          rejected_reason?: string | null
          requires_approval?: boolean
          scope?: Database["public"]["Enums"]["restaurant_price_scope"]
          status?: Database["public"]["Enums"]["restaurant_price_status"]
          supersedes_id?: string | null
          tax_inclusive?: boolean
          tenant_id: string
          updated_at?: string
          variant_id?: string | null
          version?: number
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          menu_item_id?: string | null
          price_list_id?: string | null
          product_id?: string | null
          property_id?: string | null
          reason?: string | null
          rejected_reason?: string | null
          requires_approval?: boolean
          scope?: Database["public"]["Enums"]["restaurant_price_scope"]
          status?: Database["public"]["Enums"]["restaurant_price_status"]
          supersedes_id?: string | null
          tax_inclusive?: boolean
          tenant_id?: string
          updated_at?: string
          variant_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_prices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "restaurant_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "restaurant_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_pricing_audit: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_pricing_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_procurement_audit: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          document_id: string
          document_number: string | null
          document_type: string
          id: string
          metadata: Json
          new_state: string | null
          previous_state: string | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          document_id: string
          document_number?: string | null
          document_type: string
          id?: string
          metadata?: Json
          new_state?: string | null
          previous_state?: string | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          document_id?: string
          document_number?: string | null
          document_type?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          previous_state?: string | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_procurement_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_procurement_variances: {
        Row: {
          actual_value: number | null
          created_at: string
          currency: string | null
          dedupe_key: string | null
          detail: Json
          detected_at: string
          expected_value: number | null
          id: string
          invoice_id: string | null
          label: string
          location_id: string | null
          property_id: string | null
          purchase_order_id: string | null
          receipt_id: string | null
          receipt_item_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: Database["public"]["Enums"]["restaurant_variance_status"]
          supplier_id: string | null
          tenant_id: string
          unit: string | null
          updated_at: string
          variance_pct: number | null
          variance_type: Database["public"]["Enums"]["restaurant_variance_type"]
          variance_value: number | null
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          detail?: Json
          detected_at?: string
          expected_value?: number | null
          id?: string
          invoice_id?: string | null
          label: string
          location_id?: string | null
          property_id?: string | null
          purchase_order_id?: string | null
          receipt_id?: string | null
          receipt_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["restaurant_variance_status"]
          supplier_id?: string | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
          variance_pct?: number | null
          variance_type: Database["public"]["Enums"]["restaurant_variance_type"]
          variance_value?: number | null
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          currency?: string | null
          dedupe_key?: string | null
          detail?: Json
          detected_at?: string
          expected_value?: number | null
          id?: string
          invoice_id?: string | null
          label?: string
          location_id?: string | null
          property_id?: string | null
          purchase_order_id?: string | null
          receipt_id?: string | null
          receipt_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["restaurant_variance_status"]
          supplier_id?: string | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          variance_pct?: number | null
          variance_type?: Database["public"]["Enums"]["restaurant_variance_type"]
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_procurement_variances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "restaurant_goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_receipt_item_id_fkey"
            columns: ["receipt_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_procurement_variances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_variance_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_product_modifier_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          product_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          product_id: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          product_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "restaurant_modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_product_modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          price_is_delta: boolean
          product_id: string
          recipe_id: string | null
          sku: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
          yield_factor: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price?: number
          price_is_delta?: boolean
          product_id: string
          recipe_id?: string | null
          sku?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          yield_factor?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          price_is_delta?: boolean
          product_id?: string
          recipe_id?: string | null
          sku?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          yield_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_product_variants_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_product_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_production_inputs: {
        Row: {
          actual_quantity: number
          created_at: string
          id: string
          inventory_item_id: string
          movement_id: string | null
          notes: string | null
          planned_quantity: number
          production_id: string
          tenant_id: string
          total_cost: number
          unit_cost: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          actual_quantity?: number
          created_at?: string
          id?: string
          inventory_item_id: string
          movement_id?: string | null
          notes?: string | null
          planned_quantity?: number
          production_id: string
          tenant_id: string
          total_cost?: number
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_quantity?: number
          created_at?: string
          id?: string
          inventory_item_id?: string
          movement_id?: string | null
          notes?: string | null
          planned_quantity?: number
          production_id?: string
          tenant_id?: string
          total_cost?: number
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_production_inputs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_production_inputs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_production_inputs_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_production_inputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "restaurant_productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_production_inputs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_production_inputs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_productions: {
        Row: {
          actual_quantity: number | null
          batches: number
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          input_cost: number
          notes: string | null
          output_inventory_item_id: string | null
          output_location_id: string | null
          output_movement_id: string | null
          planned_quantity: number
          production_location_id: string | null
          production_number: string
          property_id: string | null
          recipe_id: string
          recipe_version: number
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["restaurant_production_status"]
          tenant_id: string
          unit_cost: number
          updated_at: string
          yield_variance_percent: number | null
          yield_variance_quantity: number | null
        }
        Insert: {
          actual_quantity?: number | null
          batches?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          input_cost?: number
          notes?: string | null
          output_inventory_item_id?: string | null
          output_location_id?: string | null
          output_movement_id?: string | null
          planned_quantity?: number
          production_location_id?: string | null
          production_number: string
          property_id?: string | null
          recipe_id: string
          recipe_version?: number
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["restaurant_production_status"]
          tenant_id: string
          unit_cost?: number
          updated_at?: string
          yield_variance_percent?: number | null
          yield_variance_quantity?: number | null
        }
        Update: {
          actual_quantity?: number | null
          batches?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          input_cost?: number
          notes?: string | null
          output_inventory_item_id?: string | null
          output_location_id?: string | null
          output_movement_id?: string | null
          planned_quantity?: number
          production_location_id?: string | null
          production_number?: string
          property_id?: string | null
          recipe_id?: string
          recipe_version?: number
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["restaurant_production_status"]
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
          yield_variance_percent?: number | null
          yield_variance_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_productions_output_inventory_item_id_fkey"
            columns: ["output_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_output_inventory_item_id_fkey"
            columns: ["output_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_productions_output_location_id_fkey"
            columns: ["output_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_output_movement_id_fkey"
            columns: ["output_movement_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_production_location_id_fkey"
            columns: ["production_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_productions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_products: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          inventory_item_id: string | null
          location_id: string | null
          menu_item_id: string | null
          name: string
          prep_time_target_minutes: number | null
          price: number
          product_type: Database["public"]["Enums"]["restaurant_product_type"]
          property_id: string | null
          recipe_id: string | null
          service_period_ids: string[]
          sku: string
          sort_order: number
          station_id: string | null
          tax_code: string | null
          tax_rate: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id?: string | null
          menu_item_id?: string | null
          name: string
          prep_time_target_minutes?: number | null
          price?: number
          product_type?: Database["public"]["Enums"]["restaurant_product_type"]
          property_id?: string | null
          recipe_id?: string | null
          service_period_ids?: string[]
          sku: string
          sort_order?: number
          station_id?: string | null
          tax_code?: string | null
          tax_rate?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id?: string | null
          menu_item_id?: string | null
          name?: string
          prep_time_target_minutes?: number | null
          price?: number
          product_type?: Database["public"]["Enums"]["restaurant_product_type"]
          property_id?: string | null
          recipe_id?: string | null
          service_period_ids?: string[]
          sku?: string
          sort_order?: number
          station_id?: string | null
          tax_code?: string | null
          tax_rate?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_profitability_snapshots: {
        Row: {
          actual_cost: number
          computed_at: string
          created_at: string
          currency: string
          food_cost_percent: number | null
          gross_profit: number
          id: string
          location_id: string | null
          margin_percent: number | null
          menu_item_id: string | null
          menu_item_name: string
          period_end: string
          period_start: string
          property_id: string | null
          quantity_sold: number
          revenue: number
          tenant_id: string
          theoretical_cost: number
          variance: number
        }
        Insert: {
          actual_cost?: number
          computed_at?: string
          created_at?: string
          currency?: string
          food_cost_percent?: number | null
          gross_profit?: number
          id?: string
          location_id?: string | null
          margin_percent?: number | null
          menu_item_id?: string | null
          menu_item_name: string
          period_end: string
          period_start: string
          property_id?: string | null
          quantity_sold?: number
          revenue?: number
          tenant_id: string
          theoretical_cost?: number
          variance?: number
        }
        Update: {
          actual_cost?: number
          computed_at?: string
          created_at?: string
          currency?: string
          food_cost_percent?: number | null
          gross_profit?: number
          id?: string
          location_id?: string | null
          margin_percent?: number | null
          menu_item_id?: string | null
          menu_item_name?: string
          period_end?: string
          period_start?: string
          property_id?: string | null
          quantity_sold?: number
          revenue?: number
          tenant_id?: string
          theoretical_cost?: number
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_profitability_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_profitability_snapshots_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_profitability_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_profitability_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_promotions: {
        Row: {
          action: Database["public"]["Enums"]["restaurant_promotion_action"]
          applies_to_categories: string[]
          applies_to_channels: string[]
          applies_to_products: string[]
          code: string
          created_at: string
          created_by: string | null
          currency: string | null
          days_of_week: number[]
          description: string | null
          eligibility: Json
          end_time: string | null
          ends_at: string | null
          id: string
          location_id: string | null
          name: string
          priority: number
          property_id: string | null
          stackable: boolean
          start_time: string | null
          starts_at: string
          status: Database["public"]["Enums"]["restaurant_promotion_status"]
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          action?: Database["public"]["Enums"]["restaurant_promotion_action"]
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_products?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          days_of_week?: number[]
          description?: string | null
          eligibility?: Json
          end_time?: string | null
          ends_at?: string | null
          id?: string
          location_id?: string | null
          name: string
          priority?: number
          property_id?: string | null
          stackable?: boolean
          start_time?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["restaurant_promotion_status"]
          tenant_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          action?: Database["public"]["Enums"]["restaurant_promotion_action"]
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_products?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          days_of_week?: number[]
          description?: string | null
          eligibility?: Json
          end_time?: string | null
          ends_at?: string | null
          id?: string
          location_id?: string | null
          name?: string
          priority?: number
          property_id?: string | null
          stackable?: boolean
          start_time?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["restaurant_promotion_status"]
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_promotions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_promotions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_properties: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          settings: Json
          slug: string
          status: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          status?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          status?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_purchase_order_items: {
        Row: {
          accepted_quantity: number
          confirmed_quantity: number | null
          confirmed_unit_price: number | null
          created_at: string
          description: string
          discount_amount: number
          id: string
          inventory_item_id: string | null
          line_total: number
          purchase_order_id: string
          quantity: number
          received_quantity: number
          rejected_quantity: number
          supplier_product_id: string | null
          tax_amount: number
          tax_rate: number
          tenant_id: string
          unit_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          accepted_quantity?: number
          confirmed_quantity?: number | null
          confirmed_unit_price?: number | null
          created_at?: string
          description: string
          discount_amount?: number
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          supplier_product_id?: string | null
          tax_amount?: number
          tax_rate?: number
          tenant_id: string
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          accepted_quantity?: number
          confirmed_quantity?: number | null
          confirmed_unit_price?: number | null
          created_at?: string
          description?: string
          discount_amount?: number
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          rejected_quantity?: number
          supplier_product_id?: string | null
          tax_amount?: number
          tax_rate?: number
          tenant_id?: string
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_order_items_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_order_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          buyer_id: string | null
          confirmation_status: Database["public"]["Enums"]["restaurant_confirmation_status"]
          confirmed_at: string | null
          correlation_id: string
          created_at: string
          created_by: string | null
          currency: string
          discount_total: number
          document_number: string | null
          expected_at: string | null
          id: string
          location_id: string | null
          metadata: Json
          notes: string | null
          order_date: string
          payment_terms: string | null
          property_id: string | null
          purchase_request_id: string | null
          received_at: string | null
          reference: string
          requested_delivery_date: string | null
          status: Database["public"]["Enums"]["restaurant_po_status"]
          subtotal: number
          supplier_id: string | null
          supplier_reference: string | null
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_id?: string | null
          confirmation_status?: Database["public"]["Enums"]["restaurant_confirmation_status"]
          confirmed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          document_number?: string | null
          expected_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          property_id?: string | null
          purchase_request_id?: string | null
          received_at?: string | null
          reference: string
          requested_delivery_date?: string | null
          status?: Database["public"]["Enums"]["restaurant_po_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_reference?: string | null
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_id?: string | null
          confirmation_status?: Database["public"]["Enums"]["restaurant_confirmation_status"]
          confirmed_at?: string | null
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total?: number
          document_number?: string | null
          expected_at?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          property_id?: string | null
          purchase_request_id?: string | null
          received_at?: string | null
          reference?: string
          requested_delivery_date?: string | null
          status?: Database["public"]["Enums"]["restaurant_po_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_reference?: string | null
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_orders_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_purchase_request_items: {
        Row: {
          approved_quantity: number | null
          created_at: string
          description: string
          estimated_total: number
          estimated_unit_cost: number
          id: string
          inventory_item_id: string | null
          justification: string | null
          preferred_supplier_id: string | null
          purchase_request_id: string
          quantity: number
          recommendation_ref: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          approved_quantity?: number | null
          created_at?: string
          description: string
          estimated_total?: number
          estimated_unit_cost?: number
          id?: string
          inventory_item_id?: string | null
          justification?: string | null
          preferred_supplier_id?: string | null
          purchase_request_id: string
          quantity?: number
          recommendation_ref?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_quantity?: number | null
          created_at?: string
          description?: string
          estimated_total?: number
          estimated_unit_cost?: number
          id?: string
          inventory_item_id?: string | null
          justification?: string | null
          preferred_supplier_id?: string | null
          purchase_request_id?: string
          quantity?: number
          recommendation_ref?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_purchase_request_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_request_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_purchase_request_items_preferred_supplier_id_fkey"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_request_items_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_request_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_request_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_purchase_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          category: string | null
          converted_at: string | null
          converted_purchase_order_id: string | null
          correlation_id: string
          created_at: string
          currency: string
          document_number: string
          estimated_total: number
          id: string
          location_id: string | null
          metadata: Json
          notes: string | null
          priority: Database["public"]["Enums"]["restaurant_pr_priority"]
          property_id: string | null
          reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string
          requested_date: string
          required_by_date: string | null
          status: Database["public"]["Enums"]["restaurant_pr_status"]
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          category?: string | null
          converted_at?: string | null
          converted_purchase_order_id?: string | null
          correlation_id?: string
          created_at?: string
          currency?: string
          document_number: string
          estimated_total?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          priority?: Database["public"]["Enums"]["restaurant_pr_priority"]
          property_id?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by: string
          requested_date?: string
          required_by_date?: string | null
          status?: Database["public"]["Enums"]["restaurant_pr_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          category?: string | null
          converted_at?: string | null
          converted_purchase_order_id?: string | null
          correlation_id?: string
          created_at?: string
          currency?: string
          document_number?: string
          estimated_total?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          notes?: string | null
          priority?: Database["public"]["Enums"]["restaurant_pr_priority"]
          property_id?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string
          requested_date?: string
          required_by_date?: string | null
          status?: Database["public"]["Enums"]["restaurant_pr_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_purchase_requests_converted_purchase_order_id_fkey"
            columns: ["converted_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_purchase_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_receipts: {
        Row: {
          cost_total: number
          created_at: string
          currency: string
          delivered_at: string | null
          delivered_to: string | null
          delivery_channel: string | null
          discount_total: number
          id: string
          issued_at: string
          issued_by: string | null
          last_reprint_at: string | null
          last_reprint_by: string | null
          location_id: string | null
          order_id: string
          paid_total: number
          property_id: string | null
          receipt_number: string
          reprint_count: number
          service_charge: number
          snapshot: Json
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          cost_total?: number
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivered_to?: string | null
          delivery_channel?: string | null
          discount_total?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_reprint_at?: string | null
          last_reprint_by?: string | null
          location_id?: string | null
          order_id: string
          paid_total?: number
          property_id?: string | null
          receipt_number: string
          reprint_count?: number
          service_charge?: number
          snapshot?: Json
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          cost_total?: number
          created_at?: string
          currency?: string
          delivered_at?: string | null
          delivered_to?: string | null
          delivery_channel?: string | null
          discount_total?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          last_reprint_at?: string | null
          last_reprint_by?: string | null
          location_id?: string | null
          order_id?: string
          paid_total?: number
          property_id?: string | null
          receipt_number?: string
          reprint_count?: number
          service_charge?: number
          snapshot?: Json
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recipe_components: {
        Row: {
          component_menu_item_id: string | null
          created_at: string
          id: string
          inventory_item_id: string | null
          menu_item_id: string
          notes: string | null
          quantity: number
          tenant_id: string
          unit_id: string | null
          updated_at: string
          yield_percent: number
        }
        Insert: {
          component_menu_item_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          menu_item_id: string
          notes?: string | null
          quantity?: number
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          yield_percent?: number
        }
        Update: {
          component_menu_item_id?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          menu_item_id?: string
          notes?: string | null
          quantity?: number
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          yield_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recipe_components_component_menu_item_id_fkey"
            columns: ["component_menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_recipe_components_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_components_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recipe_cost_history: {
        Row: {
          breakdown: Json
          computed_at: string
          computed_by: string | null
          cost_per_yield_unit: number
          currency: string
          id: string
          ingredient_cost: number
          recipe_id: string
          recipe_version: number
          sub_recipe_cost: number
          tenant_id: string
          total_cost: number
        }
        Insert: {
          breakdown?: Json
          computed_at?: string
          computed_by?: string | null
          cost_per_yield_unit?: number
          currency?: string
          id?: string
          ingredient_cost?: number
          recipe_id: string
          recipe_version?: number
          sub_recipe_cost?: number
          tenant_id: string
          total_cost?: number
        }
        Update: {
          breakdown?: Json
          computed_at?: string
          computed_by?: string | null
          cost_per_yield_unit?: number
          currency?: string
          id?: string
          ingredient_cost?: number
          recipe_id?: string
          recipe_version?: number
          sub_recipe_cost?: number
          tenant_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recipe_cost_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_cost_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recipe_costs: {
        Row: {
          breakdown: Json
          computed_at: string
          created_at: string
          currency: string
          food_cost_percent: number | null
          id: string
          ingredient_cost: number
          menu_item_id: string
          overhead_cost: number
          suggested_price: number | null
          target_margin: number | null
          tenant_id: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          breakdown?: Json
          computed_at?: string
          created_at?: string
          currency?: string
          food_cost_percent?: number | null
          id?: string
          ingredient_cost?: number
          menu_item_id: string
          overhead_cost?: number
          suggested_price?: number | null
          target_margin?: number | null
          tenant_id: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          breakdown?: Json
          computed_at?: string
          created_at?: string
          currency?: string
          food_cost_percent?: number | null
          id?: string
          ingredient_cost?: number
          menu_item_id?: string
          overhead_cost?: number
          suggested_price?: number | null
          target_margin?: number | null
          tenant_id?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recipe_costs_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recipe_lines: {
        Row: {
          component_kind: Database["public"]["Enums"]["restaurant_recipe_component_kind"]
          created_at: string
          id: string
          inventory_item_id: string | null
          is_optional: boolean
          notes: string | null
          quantity: number
          recipe_id: string
          sort_order: number
          sub_recipe_id: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
          yield_percent: number
        }
        Insert: {
          component_kind?: Database["public"]["Enums"]["restaurant_recipe_component_kind"]
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          is_optional?: boolean
          notes?: string | null
          quantity?: number
          recipe_id: string
          sort_order?: number
          sub_recipe_id?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          yield_percent?: number
        }
        Update: {
          component_kind?: Database["public"]["Enums"]["restaurant_recipe_component_kind"]
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          is_optional?: boolean
          notes?: string | null
          quantity?: number
          recipe_id?: string
          sort_order?: number
          sub_recipe_id?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          yield_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recipe_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_recipe_lines_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_lines_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipe_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recipes: {
        Row: {
          category_id: string | null
          code: string
          computed_cost: number
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string | null
          effective_to: string | null
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["restaurant_recipe_kind"]
          last_reviewed_at: string | null
          lineage_id: string | null
          name: string
          notes: string | null
          produces_inventory_item_id: string | null
          property_id: string | null
          status: Database["public"]["Enums"]["restaurant_recipe_status"]
          supersedes_id: string | null
          target_cost: number | null
          tenant_id: string
          updated_at: string
          version: number
          yield_quantity: number
          yield_unit_id: string | null
        }
        Insert: {
          category_id?: string | null
          code: string
          computed_cost?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["restaurant_recipe_kind"]
          last_reviewed_at?: string | null
          lineage_id?: string | null
          name: string
          notes?: string | null
          produces_inventory_item_id?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_recipe_status"]
          supersedes_id?: string | null
          target_cost?: number | null
          tenant_id: string
          updated_at?: string
          version?: number
          yield_quantity?: number
          yield_unit_id?: string | null
        }
        Update: {
          category_id?: string | null
          code?: string
          computed_cost?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["restaurant_recipe_kind"]
          last_reviewed_at?: string | null
          lineage_id?: string | null
          name?: string
          notes?: string | null
          produces_inventory_item_id?: string | null
          property_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_recipe_status"]
          supersedes_id?: string | null
          target_cost?: number | null
          tenant_id?: string
          updated_at?: string
          version?: number
          yield_quantity?: number
          yield_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recipes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipes_produces_inventory_item_id_fkey"
            columns: ["produces_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipes_produces_inventory_item_id_fkey"
            columns: ["produces_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_recipes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipes_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "restaurant_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_recipes_yield_unit_id_fkey"
            columns: ["yield_unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_reconciliation_audit: {
        Row: {
          action: string
          actor_id: string | null
          business_date: string | null
          created_at: string
          id: string
          metadata: Json
          new_state: string | null
          previous_state: string | null
          reason: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_date?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          previous_state?: string | null
          reason?: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_date?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: string | null
          previous_state?: string | null
          reason?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reconciliation_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_reconciliation_exceptions: {
        Row: {
          business_date: string
          close_id: string | null
          code: string
          created_at: string
          currency: string
          dedupe_key: string
          detected_at: string
          domain: string
          entity_id: string | null
          entity_type: string | null
          evidence: Json
          id: string
          impact_value: number
          location_id: string | null
          property_id: string | null
          required_action: string
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          severity: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
          what_happened: string
        }
        Insert: {
          business_date: string
          close_id?: string | null
          code: string
          created_at?: string
          currency?: string
          dedupe_key: string
          detected_at?: string
          domain: string
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          id?: string
          impact_value?: number
          location_id?: string | null
          property_id?: string | null
          required_action: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          what_happened: string
        }
        Update: {
          business_date?: string
          close_id?: string | null
          code?: string
          created_at?: string
          currency?: string
          dedupe_key?: string
          detected_at?: string
          domain?: string
          entity_id?: string | null
          entity_type?: string | null
          evidence?: Json
          id?: string
          impact_value?: number
          location_id?: string | null
          property_id?: string | null
          required_action?: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          what_happened?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reconciliation_exceptions_close_id_fkey"
            columns: ["close_id"]
            isOneToOne: false
            referencedRelation: "restaurant_daily_closes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reconciliation_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reconciliation_exceptions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reconciliation_exceptions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "restaurant_reconciliation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reconciliation_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_reconciliation_runs: {
        Row: {
          business_date: string
          created_at: string
          exceptions_existing: number
          exceptions_opened: number
          id: string
          location_id: string | null
          run_by: string | null
          scope: string
          summary: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          business_date: string
          created_at?: string
          exceptions_existing?: number
          exceptions_opened?: number
          id?: string
          location_id?: string | null
          run_by?: string | null
          scope: string
          summary?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          created_at?: string
          exceptions_existing?: number
          exceptions_opened?: number
          id?: string
          location_id?: string | null
          run_by?: string | null
          scope?: string
          summary?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_reconciliation_runs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_reconciliation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_requisition_lines: {
        Row: {
          approved_quantity: number | null
          created_at: string
          description: string | null
          id: string
          inventory_item_id: string
          issued_quantity: number
          notes: string | null
          requested_quantity: number
          requisition_id: string
          sort_order: number
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          approved_quantity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id: string
          issued_quantity?: number
          notes?: string | null
          requested_quantity?: number
          requisition_id: string
          sort_order?: number
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_quantity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          inventory_item_id?: string
          issued_quantity?: number
          notes?: string | null
          requested_quantity?: number
          requisition_id?: string
          sort_order?: number
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_requisition_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisition_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_requisition_lines_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "restaurant_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisition_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisition_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          correlation_id: string | null
          created_at: string
          department: string | null
          destination_location_id: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          kind: string
          metadata: Json
          notes: string | null
          property_id: string | null
          reference: string
          rejected_reason: string | null
          requested_by: string | null
          required_date: string | null
          source_location_id: string | null
          status: Database["public"]["Enums"]["restaurant_requisition_status"]
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          correlation_id?: string | null
          created_at?: string
          department?: string | null
          destination_location_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          kind?: string
          metadata?: Json
          notes?: string | null
          property_id?: string | null
          reference: string
          rejected_reason?: string | null
          requested_by?: string | null
          required_date?: string | null
          source_location_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_requisition_status"]
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          correlation_id?: string | null
          created_at?: string
          department?: string | null
          destination_location_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          kind?: string
          metadata?: Json
          notes?: string | null
          property_id?: string | null
          reference?: string
          rejected_reason?: string | null
          requested_by?: string | null
          required_date?: string | null
          source_location_id?: string | null
          status?: Database["public"]["Enums"]["restaurant_requisition_status"]
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_requisitions_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisitions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisitions_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_rounding_rules: {
        Row: {
          active: boolean
          channel: string | null
          code: string
          created_at: string
          created_by: string | null
          currency: string | null
          decimals: number
          effective_from: string
          effective_to: string | null
          id: string
          increment: number
          location_id: string | null
          mode: string
          name: string
          property_id: string | null
          target: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decimals?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          increment?: number
          location_id?: string | null
          mode?: string
          name: string
          property_id?: string | null
          target?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          decimals?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          increment?: number
          location_id?: string | null
          mode?: string
          name?: string
          property_id?: string | null
          target?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_rounding_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_rounding_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_rounding_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_service_charges: {
        Row: {
          active: boolean
          applies_to_categories: string[]
          applies_to_channels: string[]
          applies_to_order_types: string[]
          applies_to_products: string[]
          basis: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fixed_amount: number
          id: string
          location_id: string | null
          name: string
          property_id: string | null
          rate: number
          taxable: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_order_types?: string[]
          applies_to_products?: string[]
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number
          id?: string
          location_id?: string | null
          name: string
          property_id?: string | null
          rate?: number
          taxable?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_order_types?: string[]
          applies_to_products?: string[]
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number
          id?: string
          location_id?: string | null
          name?: string
          property_id?: string | null
          rate?: number
          taxable?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_service_charges_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_service_charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_service_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_service_periods: {
        Row: {
          active: boolean
          code: string
          created_at: string
          end_time: string
          id: string
          location_id: string | null
          name: string
          property_id: string | null
          sort_order: number
          start_time: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          end_time?: string
          id?: string
          location_id?: string | null
          name: string
          property_id?: string | null
          sort_order?: number
          start_time?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          end_time?: string
          id?: string
          location_id?: string | null
          name?: string
          property_id?: string | null
          sort_order?: number
          start_time?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_service_periods_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_service_periods_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_service_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stations: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          location_id: string | null
          name: string
          property_id: string | null
          sort_order: number
          station_type: string
          target_prep_minutes: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          property_id?: string | null
          sort_order?: number
          station_type?: string
          target_prep_minutes?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          property_id?: string | null
          sort_order?: number
          station_type?: string
          target_prep_minutes?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stock_movements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          balance_after: number | null
          batch_id: string | null
          correlation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          dedupe_key: string | null
          destination_location_id: string | null
          id: string
          inventory_item_id: string
          location_id: string | null
          movement_type: Database["public"]["Enums"]["restaurant_stock_movement_type"]
          notes: string | null
          occurred_at: string
          order_item_id: string | null
          production_id: string | null
          property_id: string | null
          quantity: number
          reason: string | null
          reason_code: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_of_id: string | null
          stocktake_id: string | null
          tenant_id: string
          total_cost: number
          transfer_id: string | null
          transfer_line_id: string | null
          unit_cost: number
          unit_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          balance_after?: number | null
          batch_id?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dedupe_key?: string | null
          destination_location_id?: string | null
          id?: string
          inventory_item_id: string
          location_id?: string | null
          movement_type: Database["public"]["Enums"]["restaurant_stock_movement_type"]
          notes?: string | null
          occurred_at?: string
          order_item_id?: string | null
          production_id?: string | null
          property_id?: string | null
          quantity: number
          reason?: string | null
          reason_code?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          stocktake_id?: string | null
          tenant_id: string
          total_cost?: number
          transfer_id?: string | null
          transfer_line_id?: string | null
          unit_cost?: number
          unit_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          balance_after?: number | null
          batch_id?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dedupe_key?: string | null
          destination_location_id?: string | null
          id?: string
          inventory_item_id?: string
          location_id?: string | null
          movement_type?: Database["public"]["Enums"]["restaurant_stock_movement_type"]
          notes?: string | null
          occurred_at?: string
          order_item_id?: string | null
          production_id?: string | null
          property_id?: string | null
          quantity?: number
          reason?: string | null
          reason_code?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          stocktake_id?: string | null
          tenant_id?: string
          total_cost?: number
          transfer_id?: string | null
          transfer_line_id?: string | null
          unit_cost?: number
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "restaurant_productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stocktakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_transfer_line_id_fkey"
            columns: ["transfer_line_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_transfer_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stock_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          expires_at: string | null
          id: string
          inventory_item_id: string
          location_id: string | null
          needed_at: string | null
          notes: string | null
          property_id: string | null
          purpose: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["restaurant_reservation_status"]
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          expires_at?: string | null
          id?: string
          inventory_item_id: string
          location_id?: string | null
          needed_at?: string | null
          notes?: string | null
          property_id?: string | null
          purpose?: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["restaurant_reservation_status"]
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          expires_at?: string | null
          id?: string
          inventory_item_id?: string
          location_id?: string | null
          needed_at?: string | null
          notes?: string | null
          property_id?: string | null
          purpose?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["restaurant_reservation_status"]
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stock_reservations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_reservations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_stock_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_reservations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stock_transfer_lines: {
        Row: {
          batch_id: string | null
          created_at: string
          damaged_quantity: number
          dispatched_quantity: number
          id: string
          inventory_item_id: string
          notes: string | null
          received_quantity: number
          rejected_quantity: number
          requested_quantity: number
          tenant_id: string
          transfer_id: string
          unit_cost: number
          unit_id: string | null
          updated_at: string
          variance_quantity: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          damaged_quantity?: number
          dispatched_quantity?: number
          id?: string
          inventory_item_id: string
          notes?: string | null
          received_quantity?: number
          rejected_quantity?: number
          requested_quantity?: number
          tenant_id: string
          transfer_id: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
          variance_quantity?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          damaged_quantity?: number
          dispatched_quantity?: number
          id?: string
          inventory_item_id?: string
          notes?: string | null
          received_quantity?: number
          rejected_quantity?: number
          requested_quantity?: number
          tenant_id?: string
          transfer_id?: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
          variance_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stock_transfer_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfer_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfer_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfer_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfer_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination_location_id: string
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          notes: string | null
          property_id: string | null
          received_at: string | null
          received_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          requested_by: string | null
          requires_approval: boolean
          source_location_id: string
          status: Database["public"]["Enums"]["restaurant_transfer_status"]
          tenant_id: string
          total_value: number
          transfer_number: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_location_id: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          notes?: string | null
          property_id?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          source_location_id: string
          status?: Database["public"]["Enums"]["restaurant_transfer_status"]
          tenant_id: string
          total_value?: number
          transfer_number: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_location_id?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          notes?: string | null
          property_id?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          source_location_id?: string
          status?: Database["public"]["Enums"]["restaurant_transfer_status"]
          tenant_id?: string
          total_value?: number
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stock_transfers_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfers_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stocktake_lines: {
        Row: {
          batch_id: string | null
          counted_at: string | null
          counted_quantity: number | null
          created_at: string
          expected_quantity: number
          id: string
          inventory_item_id: string
          location_id: string | null
          notes: string | null
          posted_movement_id: string | null
          reason_code: string | null
          stocktake_id: string
          tenant_id: string
          unit_cost: number
          unit_id: string | null
          updated_at: string
          variance_quantity: number | null
        }
        Insert: {
          batch_id?: string | null
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          inventory_item_id: string
          location_id?: string | null
          notes?: string | null
          posted_movement_id?: string | null
          reason_code?: string | null
          stocktake_id: string
          tenant_id: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
          variance_quantity?: number | null
        }
        Update: {
          batch_id?: string | null
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          inventory_item_id?: string
          location_id?: string | null
          notes?: string | null
          posted_movement_id?: string | null
          reason_code?: string | null
          stocktake_id?: string
          tenant_id?: string
          unit_cost?: number
          unit_id?: string | null
          updated_at?: string
          variance_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stocktake_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_posted_movement_id_fkey"
            columns: ["posted_movement_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stocktakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktake_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stocktakes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          counted_at: string | null
          counted_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          location_id: string | null
          notes: string | null
          posted_at: string | null
          property_id: string | null
          reviewed_by: string | null
          scope: Database["public"]["Enums"]["restaurant_stocktake_scope"]
          started_at: string | null
          status: Database["public"]["Enums"]["restaurant_stocktake_status"]
          stocktake_number: string
          tenant_id: string
          updated_at: string
          variance_value: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          counted_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          posted_at?: string | null
          property_id?: string | null
          reviewed_by?: string | null
          scope?: Database["public"]["Enums"]["restaurant_stocktake_scope"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["restaurant_stocktake_status"]
          stocktake_number: string
          tenant_id: string
          updated_at?: string
          variance_value?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          counted_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          posted_at?: string | null
          property_id?: string | null
          reviewed_by?: string | null
          scope?: Database["public"]["Enums"]["restaurant_stocktake_scope"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["restaurant_stocktake_status"]
          stocktake_number?: string
          tenant_id?: string
          updated_at?: string
          variance_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stocktakes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktakes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktakes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stocktakes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          features: Json
          id: string
          plan: string
          seats: number
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          features?: Json
          id?: string
          plan?: string
          seats?: number
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          features?: Json
          id?: string
          plan?: string
          seats?: number
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_confirmation_items: {
        Row: {
          confirmation_id: string
          confirmed_delivery_date: string | null
          confirmed_quantity: number
          confirmed_unit_price: number
          created_at: string
          id: string
          notes: string | null
          ordered_quantity: number
          ordered_unit_price: number
          purchase_order_item_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confirmation_id: string
          confirmed_delivery_date?: string | null
          confirmed_quantity?: number
          confirmed_unit_price?: number
          created_at?: string
          id?: string
          notes?: string | null
          ordered_quantity?: number
          ordered_unit_price?: number
          purchase_order_item_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confirmation_id?: string
          confirmed_delivery_date?: string | null
          confirmed_quantity?: number
          confirmed_unit_price?: number
          created_at?: string
          id?: string
          notes?: string | null
          ordered_quantity?: number
          ordered_unit_price?: number
          purchase_order_item_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_confirmation_it_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_confirmation_items_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "restaurant_supplier_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_confirmation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_delivery_date: string | null
          correlation_id: string | null
          created_at: string
          document_number: string
          id: string
          notes: string | null
          purchase_order_id: string
          recorded_by: string
          status: Database["public"]["Enums"]["restaurant_confirmation_status"]
          supplier_reference: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_delivery_date?: string | null
          correlation_id?: string | null
          created_at?: string
          document_number: string
          id?: string
          notes?: string | null
          purchase_order_id: string
          recorded_by: string
          status?: Database["public"]["Enums"]["restaurant_confirmation_status"]
          supplier_reference?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string
          confirmed_delivery_date?: string | null
          correlation_id?: string | null
          created_at?: string
          document_number?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string
          recorded_by?: string
          status?: Database["public"]["Enums"]["restaurant_confirmation_status"]
          supplier_reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_confirmations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_confirmations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          invoice_id: string
          line_total: number
          purchase_order_item_id: string | null
          quantity: number
          receipt_item_id: string | null
          tax_amount: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          invoice_id: string
          line_total?: number
          purchase_order_item_id?: string | null
          quantity?: number
          receipt_item_id?: string | null
          tax_amount?: number
          tenant_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string
          line_total?: number
          purchase_order_item_id?: string | null
          quantity?: number
          receipt_item_id?: string | null
          tax_amount?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_invoice_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoice_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoice_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoice_items_receipt_item_id_fkey"
            columns: ["receipt_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoice_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_invoices: {
        Row: {
          amount_paid: number
          attachment_url: string | null
          correlation_id: string | null
          created_at: string
          currency: string
          document_number: string
          due_date: string | null
          id: string
          invoice_date: string
          location_id: string | null
          match_status: string
          matched_at: string | null
          notes: string | null
          payment_status: Database["public"]["Enums"]["restaurant_procurement_payment_status"]
          property_id: string | null
          purchase_order_id: string | null
          recorded_by: string
          status: Database["public"]["Enums"]["restaurant_invoice_status"]
          subtotal: number
          supplier_id: string | null
          supplier_invoice_number: string
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
          version: number
        }
        Insert: {
          amount_paid?: number
          attachment_url?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          document_number: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          location_id?: string | null
          match_status?: string
          matched_at?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["restaurant_procurement_payment_status"]
          property_id?: string | null
          purchase_order_id?: string | null
          recorded_by: string
          status?: Database["public"]["Enums"]["restaurant_invoice_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number: string
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
          version?: number
        }
        Update: {
          amount_paid?: number
          attachment_url?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          document_number?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          location_id?: string | null
          match_status?: string
          matched_at?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["restaurant_procurement_payment_status"]
          property_id?: string | null
          purchase_order_id?: string | null
          recorded_by?: string
          status?: Database["public"]["Enums"]["restaurant_invoice_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice_number?: string
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_price_history: {
        Row: {
          created_at: string
          currency: string
          dedupe_key: string | null
          effective_date: string
          id: string
          inventory_item_id: string | null
          price: number
          price_type: string
          quantity: number | null
          source_id: string | null
          source_type: string | null
          supplier_id: string
          supplier_product_id: string | null
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          dedupe_key?: string | null
          effective_date?: string
          id?: string
          inventory_item_id?: string | null
          price: number
          price_type: string
          quantity?: number | null
          source_id?: string | null
          source_type?: string | null
          supplier_id: string
          supplier_product_id?: string | null
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          dedupe_key?: string | null
          effective_date?: string
          id?: string
          inventory_item_id?: string | null
          price?: number
          price_type?: string
          quantity?: number | null
          source_id?: string | null
          source_type?: string | null
          supplier_id?: string
          supplier_product_id?: string | null
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_price_history_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_price_history_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_supplier_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_price_history_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "restaurant_supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_price_history_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_supplier_products: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          inventory_item_id: string | null
          last_price_at: string | null
          lead_time_days: number | null
          min_order_quantity: number | null
          name: string
          pack_size: number
          supplier_id: string
          supplier_sku: string | null
          tenant_id: string
          unit_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          inventory_item_id?: string | null
          last_price_at?: string | null
          lead_time_days?: number | null
          min_order_quantity?: number | null
          name: string
          pack_size?: number
          supplier_id: string
          supplier_sku?: string | null
          tenant_id: string
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          inventory_item_id?: string | null
          last_price_at?: string | null
          lead_time_days?: number | null
          min_order_quantity?: number | null
          name?: string
          pack_size?: number
          supplier_id?: string
          supplier_sku?: string | null
          tenant_id?: string
          unit_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_supplier_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "restaurant_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_supplier_products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_suppliers: {
        Row: {
          address: string | null
          code: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          lead_time_days: number | null
          metadata: Json
          name: string
          payment_terms: string | null
          phone: string | null
          reliability_score: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          metadata?: Json
          name: string
          payment_terms?: string | null
          phone?: string | null
          reliability_score?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          metadata?: Json
          name?: string
          payment_terms?: string | null
          phone?: string | null
          reliability_score?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          location_id: string | null
          name: string
          property_id: string | null
          seats: number
          status: Database["public"]["Enums"]["restaurant_table_status"]
          tenant_id: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          property_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["restaurant_table_status"]
          tenant_id: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          property_id?: string | null
          seats?: number
          status?: Database["public"]["Enums"]["restaurant_table_status"]
          tenant_id?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tax_rules: {
        Row: {
          active: boolean
          applies_to_categories: string[]
          applies_to_channels: string[]
          applies_to_products: string[]
          basis: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          compound: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fixed_amount: number
          id: string
          inclusive: boolean
          location_id: string | null
          name: string
          priority: number
          property_id: string | null
          rate: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_products?: string[]
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code: string
          compound?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number
          id?: string
          inclusive?: boolean
          location_id?: string | null
          name: string
          priority?: number
          property_id?: string | null
          rate?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to_categories?: string[]
          applies_to_channels?: string[]
          applies_to_products?: string[]
          basis?: Database["public"]["Enums"]["restaurant_charge_basis"]
          code?: string
          compound?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number
          id?: string
          inclusive?: boolean
          location_id?: string | null
          name?: string
          priority?: number
          property_id?: string | null
          rate?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tax_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tax_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "restaurant_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tax_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_tender_declarations: {
        Row: {
          close_id: string
          created_at: string
          currency: string
          declared_amount: number
          declared_by: string | null
          id: string
          method: string
          notes: string | null
          system_amount: number
          tenant_id: string
          updated_at: string
          variance: number
        }
        Insert: {
          close_id: string
          created_at?: string
          currency?: string
          declared_amount?: number
          declared_by?: string | null
          id?: string
          method: string
          notes?: string | null
          system_amount?: number
          tenant_id: string
          updated_at?: string
          variance?: number
        }
        Update: {
          close_id?: string
          created_at?: string
          currency?: string
          declared_amount?: number
          declared_by?: string | null
          id?: string
          method?: string
          notes?: string | null
          system_amount?: number
          tenant_id?: string
          updated_at?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tender_declarations_close_id_fkey"
            columns: ["close_id"]
            isOneToOne: false
            referencedRelation: "restaurant_daily_closes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tender_declarations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      review_statistics: {
        Row: {
          created_at: string
          overall_rating: number
          profile_url: string | null
          source: Database["public"]["Enums"]["review_source"]
          total_reviews: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          overall_rating: number
          profile_url?: string | null
          source: Database["public"]["Enums"]["review_source"]
          total_reviews: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          overall_rating?: number
          profile_url?: string | null
          source?: Database["public"]["Enums"]["review_source"]
          total_reviews?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          categories: Database["public"]["Enums"]["review_category"][]
          created_at: string
          created_by: string | null
          external_url: string | null
          featured: boolean
          guest_location: string | null
          guest_name: string
          id: string
          imported_at: string | null
          imported_by: string | null
          imported_from: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          medium_summary: string | null
          original_review: string | null
          rating: number
          review_date: string
          review_text: string
          review_url: string | null
          short_summary: string | null
          source: Database["public"]["Enums"]["review_source"]
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          categories?: Database["public"]["Enums"]["review_category"][]
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          featured?: boolean
          guest_location?: string | null
          guest_name: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          medium_summary?: string | null
          original_review?: string | null
          rating: number
          review_date: string
          review_text: string
          review_url?: string | null
          short_summary?: string | null
          source: Database["public"]["Enums"]["review_source"]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          categories?: Database["public"]["Enums"]["review_category"][]
          created_at?: string
          created_by?: string | null
          external_url?: string | null
          featured?: boolean
          guest_location?: string | null
          guest_name?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          medium_summary?: string | null
          original_review?: string | null
          rating?: number
          review_date?: string
          review_text?: string
          review_url?: string | null
          short_summary?: string | null
          source?: Database["public"]["Enums"]["review_source"]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      room_inventory: {
        Row: {
          available_units: number
          block_reason: string | null
          date: string
          is_blocked: boolean
          price_override: number | null
          room_id: string
          updated_at: string
        }
        Insert: {
          available_units: number
          block_reason?: string | null
          date: string
          is_blocked?: boolean
          price_override?: number | null
          room_id: string
          updated_at?: string
        }
        Update: {
          available_units?: number
          block_reason?: string | null
          date?: string
          is_blocked?: boolean
          price_override?: number | null
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_states: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          room_id: string
          state: Database["public"]["Enums"]["room_state"]
          state_note: string | null
          unit_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          room_id: string
          state?: Database["public"]["Enums"]["room_state"]
          state_note?: string | null
          unit_label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          room_id?: string
          state?: Database["public"]["Enums"]["room_state"]
          state_note?: string | null
          unit_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_states_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_states_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_states_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          base_price: number
          capacity_adults: number
          capacity_children: number
          created_at: string
          currency: string
          extra_guest_fee: number
          id: string
          included_guests: number
          max_occupancy: number
          name: string
          short_description: string | null
          slug: string
          sort_order: number
          status: string
          total_units: number
          updated_at: string
        }
        Insert: {
          base_price: number
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          currency?: string
          extra_guest_fee?: number
          id?: string
          included_guests?: number
          max_occupancy?: number
          name: string
          short_description?: string | null
          slug: string
          sort_order?: number
          status?: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          currency?: string
          extra_guest_fee?: number
          id?: string
          included_guests?: number
          max_occupancy?: number
          name?: string
          short_description?: string | null
          slug?: string
          sort_order?: number
          status?: string
          total_units?: number
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          config: Json
          created_at: string
          cron_expression: string
          description: string | null
          enabled: boolean
          id: string
          job_type: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          cron_expression: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          cron_expression?: string
          description?: string | null
          enabled?: boolean
          id?: string
          job_type?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seo_overrides: {
        Row: {
          canonical_url: string | null
          created_at: string
          description: string | null
          id: string
          index_status: boolean
          keywords: string[] | null
          notes: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          robots: string | null
          route_path: string
          schema_type: string | null
          title: string | null
          twitter_card: string | null
          twitter_description: string | null
          twitter_image: string | null
          twitter_title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          index_status?: boolean
          keywords?: string[] | null
          notes?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots?: string | null
          route_path: string
          schema_type?: string | null
          title?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          index_status?: boolean
          keywords?: string[] | null
          notes?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots?: string | null
          route_path?: string
          schema_type?: string | null
          title?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_errors: {
        Row: {
          context: Json
          created_at: string
          function_name: string | null
          id: string
          message: string
          module: string | null
          occurred_at: string
          request_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          function_name?: string | null
          id?: string
          message: string
          module?: string | null
          occurred_at?: string
          request_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          function_name?: string | null
          id?: string
          message?: string
          module?: string | null
          occurred_at?: string
          request_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_health_probes: {
        Row: {
          checked_at: string
          details: Json
          id: string
          latency_ms: number | null
          probe_name: string
          status: string
        }
        Insert: {
          checked_at?: string
          details?: Json
          id?: string
          latency_ms?: number | null
          probe_name: string
          status: string
        }
        Update: {
          checked_at?: string
          details?: Json
          id?: string
          latency_ms?: number | null
          probe_name?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_alerts: {
        Row: {
          booking_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string
          message: string
          provider_sid: string | null
          sent_at: string | null
          status: string
          to_number: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          message: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          message?: string
          provider_sid?: string | null
          sent_at?: string | null
          status?: string
          to_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ops_outstanding_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_run_steps: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          result: Json | null
          run_id: string
          started_at: string
          status: string
          step_config: Json
          step_index: number
          step_type: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id: string
          started_at?: string
          status?: string
          step_config?: Json
          step_index: number
          step_type: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id?: string
          started_at?: string
          status?: string
          step_config?: Json
          step_index?: number
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          conditions_met: boolean | null
          correlation_id: string | null
          error: string | null
          event_payload: Json
          finished_at: string | null
          id: string
          retry_count: number
          started_at: string
          status: string
          trigger_event: string
          workflow_id: string
        }
        Insert: {
          conditions_met?: boolean | null
          correlation_id?: string | null
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          retry_count?: number
          started_at?: string
          status?: string
          trigger_event: string
          workflow_id: string
        }
        Update: {
          conditions_met?: boolean | null
          correlation_id?: string | null
          error?: string | null
          event_payload?: Json
          finished_at?: string | null
          id?: string
          retry_count?: number
          started_at?: string
          status?: string
          trigger_event?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          approver_roles: string[]
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          is_template: boolean
          name: string
          requires_approval: boolean
          trigger_event: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          approver_roles?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_template?: boolean
          name: string
          requires_approval?: boolean
          trigger_event: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          approver_roles?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          is_template?: boolean
          name?: string
          requires_approval?: boolean
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      guest_country_stats: {
        Row: {
          country: string | null
          guest_count: number | null
          returning_count: number | null
          vip_count: number | null
        }
        Relationships: []
      }
      guest_directory: {
        Row: {
          avatar_url: string | null
          cancelled_count: number | null
          communication_preference:
            | Database["public"]["Enums"]["communication_preference"]
            | null
          country: string | null
          created_at: string | null
          email: string | null
          first_stay: string | null
          full_name: string | null
          id: string | null
          internal_notes: string | null
          last_stay: string | null
          lifetime_spend: number | null
          nationality: string | null
          phone_e164: string | null
          preferred_language: string | null
          status: Database["public"]["Enums"]["guest_status"] | null
          tag_ids: string[] | null
          time_zone: string | null
          total_nights: number | null
          total_stays: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      guest_metrics: {
        Row: {
          avg_lead_time_days: number | null
          avg_nights: number | null
          avg_party_size: number | null
          avg_spend: number | null
          cancellation_rate: number | null
          cancelled: number | null
          favourite_experience: string | null
          favourite_room_id: string | null
          guest_id: string | null
          is_repeat: boolean | null
          stays: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["favourite_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_outstanding_balances: {
        Row: {
          balance_amount: number | null
          check_in: string | null
          check_out: string | null
          currency: string | null
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          reference: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          total: number | null
        }
        Insert: {
          balance_amount?: number | null
          check_in?: string | null
          check_out?: string | null
          currency?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          total?: number | null
        }
        Update: {
          balance_amount?: number | null
          check_in?: string | null
          check_out?: string | null
          currency?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          reference?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_metrics"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_today: {
        Row: {
          arrivals: number | null
          departures: number | null
          dirty_rooms: number | null
          in_house: number | null
          maintenance_rooms: number | null
          occupied_rooms: number | null
          outstanding_total: number | null
          pending_check_in: number | null
          pending_check_out: number | null
          vacant_rooms: number | null
        }
        Relationships: []
      }
      restaurant_stock_positions_v: {
        Row: {
          inventory_item_id: string | null
          last_movement_at: string | null
          location_id: string | null
          movement_count: number | null
          on_hand: number | null
          tenant_id: string | null
          total_in: number | null
          total_out: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stock_reconciliation_v"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "restaurant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stock_reconciliation_v: {
        Row: {
          drift: number | null
          illegal_negative: boolean | null
          inventory_item_id: string | null
          item_quantity: number | null
          ledger_quantity: number | null
          movement_count: number | null
          name: string | null
          orphan_transfer_movements: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ai_knowledge_sources_search: {
        Args: { _limit?: number; _query: string }
        Returns: {
          content: string
          id: string
          rank: number
          source_type: string
          summary: string
          title: string
          url: string
        }[]
      }
      arrival_automation_run: {
        Args: { _booking_id: string; _event: string; _meta?: Json }
        Returns: boolean
      }
      arrival_pass_confirm: {
        Args: { _client?: Json; _pass_token: string }
        Returns: Json
      }
      arrival_pass_ensure: { Args: { _checkin_token: string }; Returns: Json }
      arrival_pass_fetch: { Args: { _pass_token: string }; Returns: Json }
      arrival_pass_validate: {
        Args: { _client?: Json; _pass_token: string }
        Returns: Json
      }
      checkin_eligibility: { Args: { _booking_id: string }; Returns: Json }
      checkin_ensure_for_booking: {
        Args: { _booking_id: string }
        Returns: {
          expires_at: string
          id: string
          status: Database["public"]["Enums"]["checkin_status"]
          token: string
        }[]
      }
      checkin_fetch_summary: {
        Args: { _token: string }
        Returns: {
          check_in: string
          check_out: string
          draft_step: number
          eligibility_code: string
          eligibility_message: string
          eligible: boolean
          email_hint: string
          expires_at: string
          has_draft: boolean
          locked: boolean
          nights: number
          reference: string
          room_name: string
          status: Database["public"]["Enums"]["checkin_status"]
          submitted_at: string
          surname_hint: string
        }[]
      }
      checkin_log_activity: {
        Args: {
          _action: string
          _booking_id: string
          _checkin_id: string
          _detail?: Json
          _session_id: string
        }
        Returns: undefined
      }
      checkin_save_draft: {
        Args: {
          _arrival: Json
          _guest: Json
          _session_id: string
          _step: number
          _token: string
        }
        Returns: Json
      }
      checkin_submit: {
        Args: {
          _answer: string
          _arrival: Json
          _client?: Json
          _final?: boolean
          _guest: Json
          _session_id?: string
          _token: string
        }
        Returns: Json
      }
      checkin_sync_reservation: {
        Args: { _checkin_id: string; _client?: Json }
        Returns: Json
      }
      checkin_verify: {
        Args: { _answer: string; _session_id?: string; _token: string }
        Returns: Json
      }
      create_booking:
        | {
            Args: {
              _adults: number
              _check_in: string
              _check_out: string
              _children: number
              _country: string
              _extras?: Json
              _guest_email: string
              _guest_name: string
              _guest_phone: string
              _room_slug: string
              _special_requests: string
            }
            Returns: {
              booking_id: string
              currency: string
              reference: string
              total: number
            }[]
          }
        | {
            Args: {
              _adults: number
              _check_in: string
              _check_out: string
              _children: number
              _children_7_plus?: number
              _children_below_6?: number
              _country: string
              _extras?: Json
              _guest_email: string
              _guest_name: string
              _guest_phone: string
              _room_slug: string
              _special_requests: string
            }
            Returns: {
              booking_id: string
              currency: string
              reference: string
              total: number
            }[]
          }
        | {
            Args: {
              _adults: number
              _check_in: string
              _check_out: string
              _children: number
              _children_7_plus?: number
              _children_below_6?: number
              _country: string
              _extras?: Json
              _guest_email: string
              _guest_name: string
              _guest_phone: string
              _hold_id?: string
              _room_slug: string
              _session_id?: string
              _special_requests: string
            }
            Returns: {
              booking_id: string
              currency: string
              reference: string
              total: number
            }[]
          }
      create_booking_hold: {
        Args: {
          _check_in: string
          _check_out: string
          _guest_email?: string
          _room_slug: string
          _session_id: string
          _ttl_seconds?: number
        }
        Returns: {
          expires_at: string
          hold_id: string
          room_id: string
        }[]
      }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_guest_type: {
        Args: { _purpose: string; _special: string }
        Returns: Database["public"]["Enums"]["guest_type"]
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_booking_holds: { Args: never; Returns: number }
      find_duplicate_guests: {
        Args: never
        Returns: {
          cluster_key: string
          guest_ids: string[]
          match_type: string
          sample_emails: string[]
          sample_names: string[]
        }[]
      }
      get_booking_hold_for_session: {
        Args: { _hold_id: string; _session_id: string }
        Returns: {
          check_in: string
          check_out: string
          expires_at: string
          id: string
          room_id: string
          status: string
        }[]
      }
      get_review_aggregates: {
        Args: never
        Returns: {
          average_rating: number
          review_count: number
          source: Database["public"]["Enums"]["review_source"]
        }[]
      }
      get_room_availability: {
        Args: { _check_in: string; _check_out: string }
        Returns: {
          base_price: number
          capacity_adults: number
          capacity_children: number
          currency: string
          is_available: boolean
          max_occupancy: number
          min_available: number
          name: string
          nightly_total: number
          nights: number
          room_id: string
          slug: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      knowledge_can_read_document: {
        Args: { _doc_id: string }
        Returns: boolean
      }
      knowledge_search: {
        Args: { _limit?: number; _query: string }
        Returns: {
          category_slug: string
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          document_slug: string
          document_title: string
          rank: number
        }[]
      }
      log_calendar_event: {
        Args: {
          _booking_id: string
          _event_type: string
          _from: string
          _hold_id: string
          _payload: Json
          _room_id: string
          _to: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reassign_booking_room: {
        Args: {
          _actor?: string
          _booking_id: string
          _new_room_id: string
          _reason?: string
        }
        Returns: Json
      }
      release_booking_hold: {
        Args: { _hold_id: string; _session_id: string }
        Returns: boolean
      }
      restaurant_can_read: { Args: { _tenant_id: string }; Returns: boolean }
      restaurant_can_write: {
        Args: {
          _roles: Database["public"]["Enums"]["restaurant_role"][]
          _tenant_id: string
        }
        Returns: boolean
      }
      restaurant_is_platform_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      restaurant_next_document_number: {
        Args: { _doc_type: string; _prefix: string; _tenant: string }
        Returns: string
      }
      set_room_block: {
        Args: {
          _blocked: boolean
          _from: string
          _reason?: string
          _room_id: string
          _to: string
        }
        Returns: number
      }
      system_observability_trim: { Args: never; Returns: undefined }
    }
    Enums: {
      ai_suggestion_kind:
        | "seo_title"
        | "seo_meta"
        | "seo_keywords"
        | "internal_links"
        | "faq"
        | "alt_text"
        | "testimonial_summary"
        | "related_articles"
        | "other"
      ai_suggestion_status: "pending" | "approved" | "rejected" | "applied"
      app_role:
        | "admin"
        | "reservations"
        | "user"
        | "owner"
        | "manager"
        | "reception"
        | "marketing"
        | "housekeeping"
        | "finance"
        | "editor"
      arrival_pass_status: "active" | "used" | "revoked" | "expired"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
        | "checked_in"
      calendar_entry_type:
        | "journal"
        | "homepage"
        | "campaign"
        | "promotion"
        | "social"
        | "other"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "archived"
      checkin_document_status: "pending" | "uploaded" | "verified" | "rejected"
      checkin_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "expired"
      cms_block_kind:
        | "hero"
        | "rich_text"
        | "image_gallery"
        | "cta"
        | "reviews"
        | "rooms"
        | "experiences"
        | "faq"
        | "video"
        | "statistics"
        | "contact"
        | "map"
      cms_page_status:
        | "draft"
        | "review"
        | "scheduled"
        | "published"
        | "archived"
      communication_preference: "email" | "whatsapp" | "sms" | "none"
      extra_unit:
        | "per_stay"
        | "per_night"
        | "per_person"
        | "per_person_per_night"
      guest_status: "new" | "returning" | "vip"
      guest_type: "standard" | "vip" | "climber"
      intel_action_status:
        | "proposed"
        | "approved"
        | "executing"
        | "completed"
        | "failed"
        | "cancelled"
        | "draft"
        | "pending_approval"
        | "queued"
        | "rejected"
        | "expired"
      intel_memory_scope:
        | "guest"
        | "reservation"
        | "room"
        | "module"
        | "property"
        | "global"
      intel_module:
        | "pms"
        | "booking"
        | "guest"
        | "revenue"
        | "marketing"
        | "restaurant"
        | "operations"
        | "finance"
        | "content"
        | "platform"
      intel_severity: "info" | "low" | "medium" | "high" | "critical"
      intel_stage:
        | "observe"
        | "understand"
        | "reason"
        | "recommend"
        | "act"
        | "learn"
      intel_status:
        | "new"
        | "reviewing"
        | "accepted"
        | "dismissed"
        | "expired"
        | "superseded"
      ops_alert_kind:
        | "late_arrival"
        | "overdue_departure"
        | "payment_issue"
        | "room_conflict"
        | "maintenance_conflict"
      ops_task_status: "pending" | "in_progress" | "completed" | "cancelled"
      payment_status:
        | "unpaid"
        | "deposit_paid"
        | "paid"
        | "refunded"
        | "payment_mismatch"
      restaurant_charge_basis: "percent" | "fixed"
      restaurant_confirmation_status:
        | "pending"
        | "confirmed"
        | "partially_confirmed"
        | "declined"
      restaurant_discount_scope: "order" | "product" | "category"
      restaurant_invoice_status:
        | "draft"
        | "recorded"
        | "matched"
        | "disputed"
        | "cancelled"
      restaurant_menu_status: "draft" | "published" | "archived"
      restaurant_modifier_effect: "none" | "inventory" | "recipe"
      restaurant_order_status:
        | "open"
        | "sent"
        | "served"
        | "closed"
        | "cancelled"
        | "voided"
      restaurant_order_type:
        | "dine_in"
        | "bar"
        | "takeaway"
        | "room_service"
        | "delivery"
        | "banquet"
      restaurant_payment_state:
        | "unpaid"
        | "partially_paid"
        | "paid"
        | "refunded"
        | "comped"
        | "room_charged"
      restaurant_po_status:
        | "draft"
        | "submitted"
        | "approved"
        | "partially_received"
        | "received"
        | "cancelled"
      restaurant_pr_priority: "low" | "normal" | "high" | "urgent"
      restaurant_pr_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "converted_to_po"
        | "cancelled"
      restaurant_price_scope: "tenant" | "property" | "location"
      restaurant_price_status:
        | "draft"
        | "pending_approval"
        | "active"
        | "superseded"
        | "expired"
        | "rejected"
      restaurant_procurement_payment_status:
        | "unpaid"
        | "partially_paid"
        | "paid"
        | "disputed"
      restaurant_product_type:
        | "standard"
        | "retail"
        | "variant_parent"
        | "bundle"
      restaurant_production_status:
        | "draft"
        | "in_progress"
        | "completed"
        | "cancelled"
      restaurant_promotion_action:
        | "percent_discount"
        | "fixed_discount"
        | "price_override"
        | "percent_uplift"
      restaurant_promotion_status:
        | "draft"
        | "scheduled"
        | "active"
        | "ended"
        | "cancelled"
      restaurant_receipt_status: "draft" | "posted" | "cancelled"
      restaurant_recipe_component_kind: "inventory_item" | "sub_recipe"
      restaurant_recipe_kind: "menu" | "sub_recipe" | "production"
      restaurant_recipe_status: "draft" | "active" | "inactive" | "archived"
      restaurant_requisition_status:
        | "draft"
        | "submitted"
        | "approved"
        | "partially_issued"
        | "fulfilled"
        | "rejected"
        | "cancelled"
      restaurant_reservation_status:
        | "active"
        | "released"
        | "consumed"
        | "expired"
      restaurant_role:
        | "owner"
        | "general_manager"
        | "restaurant_manager"
        | "chef"
        | "kitchen_manager"
        | "bartender"
        | "inventory_manager"
        | "purchasing_officer"
        | "accountant"
        | "viewer"
      restaurant_stock_movement_type:
        | "opening_balance"
        | "purchase_receipt"
        | "consumption"
        | "wastage"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
        | "return_to_supplier"
        | "adjustment_in"
        | "adjustment_out"
        | "production"
        | "reversal"
      restaurant_stocktake_scope: "full" | "location" | "category" | "selected"
      restaurant_stocktake_status:
        | "draft"
        | "counting"
        | "review"
        | "approved"
        | "posted"
        | "cancelled"
      restaurant_table_status:
        | "available"
        | "occupied"
        | "reserved"
        | "cleaning"
        | "out_of_service"
      restaurant_ticket_status:
        | "queued"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
      restaurant_transfer_status:
        | "draft"
        | "requested"
        | "approved"
        | "rejected"
        | "dispatched"
        | "partially_received"
        | "received"
        | "completed"
        | "cancelled"
      restaurant_variance_status: "open" | "accepted" | "resolved" | "escalated"
      restaurant_variance_type:
        | "quantity"
        | "price"
        | "quality"
        | "delivery"
        | "tax"
        | "invoice"
      review_category:
        | "hospitality_service"
        | "tranquility_nature"
        | "safari_gateway"
        | "rooms_comfort"
        | "dining"
        | "pool_family"
        | "overall_experience"
      review_source: "google" | "tripadvisor" | "direct"
      review_status: "pending" | "approved" | "archived"
      room_state:
        | "vacant_clean"
        | "vacant_dirty"
        | "occupied"
        | "reserved"
        | "inspection"
        | "maintenance"
        | "out_of_service"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_suggestion_kind: [
        "seo_title",
        "seo_meta",
        "seo_keywords",
        "internal_links",
        "faq",
        "alt_text",
        "testimonial_summary",
        "related_articles",
        "other",
      ],
      ai_suggestion_status: ["pending", "approved", "rejected", "applied"],
      app_role: [
        "admin",
        "reservations",
        "user",
        "owner",
        "manager",
        "reception",
        "marketing",
        "housekeeping",
        "finance",
        "editor",
      ],
      arrival_pass_status: ["active", "used", "revoked", "expired"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
        "checked_in",
      ],
      calendar_entry_type: [
        "journal",
        "homepage",
        "campaign",
        "promotion",
        "social",
        "other",
      ],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "archived",
      ],
      checkin_document_status: ["pending", "uploaded", "verified", "rejected"],
      checkin_status: [
        "not_started",
        "in_progress",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "expired",
      ],
      cms_block_kind: [
        "hero",
        "rich_text",
        "image_gallery",
        "cta",
        "reviews",
        "rooms",
        "experiences",
        "faq",
        "video",
        "statistics",
        "contact",
        "map",
      ],
      cms_page_status: [
        "draft",
        "review",
        "scheduled",
        "published",
        "archived",
      ],
      communication_preference: ["email", "whatsapp", "sms", "none"],
      extra_unit: [
        "per_stay",
        "per_night",
        "per_person",
        "per_person_per_night",
      ],
      guest_status: ["new", "returning", "vip"],
      guest_type: ["standard", "vip", "climber"],
      intel_action_status: [
        "proposed",
        "approved",
        "executing",
        "completed",
        "failed",
        "cancelled",
        "draft",
        "pending_approval",
        "queued",
        "rejected",
        "expired",
      ],
      intel_memory_scope: [
        "guest",
        "reservation",
        "room",
        "module",
        "property",
        "global",
      ],
      intel_module: [
        "pms",
        "booking",
        "guest",
        "revenue",
        "marketing",
        "restaurant",
        "operations",
        "finance",
        "content",
        "platform",
      ],
      intel_severity: ["info", "low", "medium", "high", "critical"],
      intel_stage: [
        "observe",
        "understand",
        "reason",
        "recommend",
        "act",
        "learn",
      ],
      intel_status: [
        "new",
        "reviewing",
        "accepted",
        "dismissed",
        "expired",
        "superseded",
      ],
      ops_alert_kind: [
        "late_arrival",
        "overdue_departure",
        "payment_issue",
        "room_conflict",
        "maintenance_conflict",
      ],
      ops_task_status: ["pending", "in_progress", "completed", "cancelled"],
      payment_status: [
        "unpaid",
        "deposit_paid",
        "paid",
        "refunded",
        "payment_mismatch",
      ],
      restaurant_charge_basis: ["percent", "fixed"],
      restaurant_confirmation_status: [
        "pending",
        "confirmed",
        "partially_confirmed",
        "declined",
      ],
      restaurant_discount_scope: ["order", "product", "category"],
      restaurant_invoice_status: [
        "draft",
        "recorded",
        "matched",
        "disputed",
        "cancelled",
      ],
      restaurant_menu_status: ["draft", "published", "archived"],
      restaurant_modifier_effect: ["none", "inventory", "recipe"],
      restaurant_order_status: [
        "open",
        "sent",
        "served",
        "closed",
        "cancelled",
        "voided",
      ],
      restaurant_order_type: [
        "dine_in",
        "bar",
        "takeaway",
        "room_service",
        "delivery",
        "banquet",
      ],
      restaurant_payment_state: [
        "unpaid",
        "partially_paid",
        "paid",
        "refunded",
        "comped",
        "room_charged",
      ],
      restaurant_po_status: [
        "draft",
        "submitted",
        "approved",
        "partially_received",
        "received",
        "cancelled",
      ],
      restaurant_pr_priority: ["low", "normal", "high", "urgent"],
      restaurant_pr_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "converted_to_po",
        "cancelled",
      ],
      restaurant_price_scope: ["tenant", "property", "location"],
      restaurant_price_status: [
        "draft",
        "pending_approval",
        "active",
        "superseded",
        "expired",
        "rejected",
      ],
      restaurant_procurement_payment_status: [
        "unpaid",
        "partially_paid",
        "paid",
        "disputed",
      ],
      restaurant_product_type: [
        "standard",
        "retail",
        "variant_parent",
        "bundle",
      ],
      restaurant_production_status: [
        "draft",
        "in_progress",
        "completed",
        "cancelled",
      ],
      restaurant_promotion_action: [
        "percent_discount",
        "fixed_discount",
        "price_override",
        "percent_uplift",
      ],
      restaurant_promotion_status: [
        "draft",
        "scheduled",
        "active",
        "ended",
        "cancelled",
      ],
      restaurant_receipt_status: ["draft", "posted", "cancelled"],
      restaurant_recipe_component_kind: ["inventory_item", "sub_recipe"],
      restaurant_recipe_kind: ["menu", "sub_recipe", "production"],
      restaurant_recipe_status: ["draft", "active", "inactive", "archived"],
      restaurant_requisition_status: [
        "draft",
        "submitted",
        "approved",
        "partially_issued",
        "fulfilled",
        "rejected",
        "cancelled",
      ],
      restaurant_reservation_status: [
        "active",
        "released",
        "consumed",
        "expired",
      ],
      restaurant_role: [
        "owner",
        "general_manager",
        "restaurant_manager",
        "chef",
        "kitchen_manager",
        "bartender",
        "inventory_manager",
        "purchasing_officer",
        "accountant",
        "viewer",
      ],
      restaurant_stock_movement_type: [
        "opening_balance",
        "purchase_receipt",
        "consumption",
        "wastage",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "return_to_supplier",
        "adjustment_in",
        "adjustment_out",
        "production",
        "reversal",
      ],
      restaurant_stocktake_scope: ["full", "location", "category", "selected"],
      restaurant_stocktake_status: [
        "draft",
        "counting",
        "review",
        "approved",
        "posted",
        "cancelled",
      ],
      restaurant_table_status: [
        "available",
        "occupied",
        "reserved",
        "cleaning",
        "out_of_service",
      ],
      restaurant_ticket_status: [
        "queued",
        "preparing",
        "ready",
        "served",
        "cancelled",
      ],
      restaurant_transfer_status: [
        "draft",
        "requested",
        "approved",
        "rejected",
        "dispatched",
        "partially_received",
        "received",
        "completed",
        "cancelled",
      ],
      restaurant_variance_status: ["open", "accepted", "resolved", "escalated"],
      restaurant_variance_type: [
        "quantity",
        "price",
        "quality",
        "delivery",
        "tax",
        "invoice",
      ],
      review_category: [
        "hospitality_service",
        "tranquility_nature",
        "safari_gateway",
        "rooms_comfort",
        "dining",
        "pool_family",
        "overall_experience",
      ],
      review_source: ["google", "tripadvisor", "direct"],
      review_status: ["pending", "approved", "archived"],
      room_state: [
        "vacant_clean",
        "vacant_dirty",
        "occupied",
        "reserved",
        "inspection",
        "maintenance",
        "out_of_service",
      ],
    },
  },
} as const
